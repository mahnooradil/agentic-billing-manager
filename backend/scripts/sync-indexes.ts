/**
 * Index migration / sync — the fix for S-01: `config/database.ts` sets
 * `autoIndex: !isProduction`, so every `unique`/`index: true`/`schema.index()`
 * declaration across the models never actually becomes a real MongoDB index
 * in production. Every uniqueness guarantee the app relies on (one account
 * per email, one Otp per email, invoice dedup, Slack/Stripe event dedup,
 * etc.) is currently unenforced at the database layer there.
 *
 * Two modes, both read the exact same declared-vs-actual comparison:
 *
 *   npx tsx scripts/sync-indexes.ts            — CHECK ONLY (default, safe).
 *     Reports, per collection: which declared indexes are missing from the
 *     live database, and — for every unique constraint — runs a duplicate-
 *     detection aggregation FIRST, so a build failure is diagnosed before
 *     it's ever attempted. Writes nothing to the database.
 *
 *   npx tsx scripts/sync-indexes.ts --apply    — Applies the sync.
 *     Same check first. Any collection whose duplicate check came back
 *     clean gets `Model.syncIndexes()` called for real. Any unique
 *     constraint with actual duplicate data is SKIPPED and reported —
 *     never force-built, never silently partial. Re-run in check mode
 *     afterward to confirm.
 *
 * This script intentionally does not touch `connectDatabase()` — it opens
 * its own connection with `autoIndex: false` explicitly, so nothing is
 * built as an accidental side effect of merely connecting.
 */
import mongoose, { type PipelineStage } from "mongoose";

import { env } from "@/config/env";

// Import every model so `mongoose.model()` registration happens as a side
// effect — required before `mongoose.connection.collections` / `syncIndexes()`
// can see them. One import per model file, all 17.
import "@/models/agent-session.model";
import "@/models/otp.model";
import "@/models/processed-message.model";
import "@/models/session.model";
import "@/models/support-request.model";
import "@/models/platform.model";
import "@/models/recommendation.model";
import "@/models/notification.model";
import "@/models/invitation.model";
import "@/models/platform-connection.model";
import "@/models/membership.model";
import "@/models/credit-transaction.model";
import "@/models/user-settings.model";
import "@/models/slack-processed-event.model";
import "@/models/billing.model";
import "@/models/stripe-processed-event.model";
import "@/models/user.model";
import "@/models/organization.model";
import "@/models/vendor.model";
import "@/models/billing-event.model";

interface UniqueCheck {
  modelName: string;
  label: string; // human-readable, for the report
  /** Aggregation stages run before the duplicate-detection $group — used to
   *  mirror a partialFilterExpression or an $unwind for a multikey index. */
  preStages?: Record<string, unknown>[];
  /** Field(s) forming the unique key, as they'd appear after any preStages. */
  groupFields: Record<string, string>;
}

// Every unique constraint declared across the schema layer today — mirrors
// each model's `unique: true` field or `schema.index(..., { unique: true })`
// call exactly, including partial filters, so the duplicate check tests the
// same condition MongoDB itself would enforce.
const UNIQUE_CHECKS: UniqueCheck[] = [
  { modelName: "AgentSession", label: "AgentSession.user", groupFields: { user: "$user" } },
  { modelName: "Invitation", label: "Invitation.token", groupFields: { token: "$token" } },
  {
    modelName: "Invitation",
    label: "Invitation {organization, email} where status=pending",
    preStages: [{ $match: { status: "pending" } }],
    groupFields: { organization: "$organization", email: "$email" },
  },
  {
    modelName: "Billing",
    label: "Billing {organization, platformConnection, externalId} where both exist",
    preStages: [
      { $match: { platformConnection: { $exists: true }, externalId: { $exists: true } } },
    ],
    groupFields: {
      organization: "$organization",
      platformConnection: "$platformConnection",
      externalId: "$externalId",
    },
  },
  {
    modelName: "Membership",
    label: "Membership {user, organization}",
    groupFields: { user: "$user", organization: "$organization" },
  },
  { modelName: "Otp", label: "Otp.email", groupFields: { email: "$email" } },
  {
    modelName: "ProcessedMessage",
    label: "ProcessedMessage {connection, messageId}",
    groupFields: { connection: "$connection", messageId: "$messageId" },
  },
  { modelName: "User", label: "User.email", groupFields: { email: "$email" } },
  {
    modelName: "User",
    label: "User.slackLinks {teamId, slackUserId} (multikey, sparse)",
    preStages: [
      { $match: { "slackLinks.0": { $exists: true } } },
      { $unwind: "$slackLinks" },
    ],
    groupFields: {
      teamId: "$slackLinks.teamId",
      slackUserId: "$slackLinks.slackUserId",
    },
  },
  {
    modelName: "Platform",
    label: "Platform {organization, slug}",
    groupFields: { organization: "$organization", slug: "$slug" },
  },
  {
    modelName: "Organization",
    label: "Organization.slackWorkspace.teamId (sparse)",
    preStages: [{ $match: { "slackWorkspace.teamId": { $exists: true } } }],
    groupFields: { teamId: "$slackWorkspace.teamId" },
  },
  { modelName: "Session", label: "Session.jti", groupFields: { jti: "$jti" } },
  {
    modelName: "PlatformConnection",
    label: "PlatformConnection {organization, platform, accountIdentifier}",
    groupFields: {
      organization: "$organization",
      platform: "$platform",
      accountIdentifier: "$accountIdentifier",
    },
  },
  { modelName: "UserSettings", label: "UserSettings.user", groupFields: { user: "$user" } },
  {
    modelName: "StripeProcessedEvent",
    label: "StripeProcessedEvent.eventId",
    groupFields: { eventId: "$eventId" },
  },
  {
    modelName: "SlackProcessedEvent",
    label: "SlackProcessedEvent.eventId",
    groupFields: { eventId: "$eventId" },
  },
  {
    modelName: "Vendor",
    label: "Vendor {organization, dedupeKey}",
    groupFields: { organization: "$organization", dedupeKey: "$dedupeKey" },
  },
];

interface DuplicateGroup {
  key: Record<string, unknown>;
  count: number;
  ids: string[];
}

async function findDuplicates(check: UniqueCheck): Promise<DuplicateGroup[]> {
  const model = mongoose.model(check.modelName);
  const pipeline = [
    ...(check.preStages ?? []),
    { $group: { _id: check.groupFields, count: { $sum: 1 }, ids: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } },
  ] as unknown as PipelineStage[];
  const results = await model.aggregate(pipeline);
  return results.map((r) => ({
    key: r._id as Record<string, unknown>,
    count: r.count as number,
    ids: (r.ids as unknown[]).map(String),
  }));
}

interface IndexComparison {
  modelName: string;
  collectionName: string;
  declaredCount: number;
  actualCount: number;
  missing: string[]; // declared index key signatures not found in the live collection
  extra: { name: string; signature: string }[]; // live indexes not declared in the schema
}

/** A stable, comparable signature for an index's key spec, e.g. "organization_1,slug_1". */
function indexSignature(key: Record<string, number | string>): string {
  return Object.entries(key)
    .map(([field, dir]) => `${field}_${dir}`)
    .join(",");
}

async function compareIndexes(modelName: string): Promise<IndexComparison> {
  const model = mongoose.model(modelName);
  const collection = model.collection;

  const declaredIndexes = model.schema.indexes() as [Record<string, number>, unknown][];
  const declared = declaredIndexes.map(([key]) => indexSignature(key));
  const declaredSet = new Set(declared);

  // A collection that has never received a write doesn't physically exist in
  // MongoDB yet, and `collection.indexes()` throws "ns does not exist" for
  // that case instead of returning an empty list — treat it as zero actual
  // indexes rather than letting the raw driver error abort the whole script.
  let actual: Awaited<ReturnType<typeof collection.indexes>> = [];
  try {
    actual = await collection.indexes();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("ns does not exist")) throw error;
  }
  const actualNonId = actual.filter((ix) => ix.name !== "_id_");
  const actualSignatures = new Set(
    actualNonId.map((ix) => indexSignature(ix.key as Record<string, number>))
  );

  const missing = declared.filter((sig) => !actualSignatures.has(sig));
  const extra = actualNonId
    .filter((ix) => !declaredSet.has(indexSignature(ix.key as Record<string, number>)))
    .map((ix) => ({ name: ix.name as string, signature: indexSignature(ix.key as Record<string, number>) }));

  return {
    modelName,
    collectionName: collection.collectionName,
    declaredCount: declared.length,
    actualCount: actualSignatures.size,
    missing,
    extra,
  };
}

const ALL_MODEL_NAMES = [
  "AgentSession",
  "Otp",
  "ProcessedMessage",
  "Session",
  "SupportRequest",
  "Platform",
  "Recommendation",
  "Notification",
  "Invitation",
  "PlatformConnection",
  "Membership",
  "CreditTransaction",
  "UserSettings",
  "SlackProcessedEvent",
  "Billing",
  "StripeProcessedEvent",
  "User",
  "Organization",
  "Vendor",
  "BillingEvent",
];

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  if (!env.mongoUri) {
    throw new Error("MONGODB_URI is not set — see backend/.env");
  }

  console.log(`Connecting (autoIndex disabled — this script controls index builds explicitly)...`);
  await mongoose.connect(env.mongoUri, { autoIndex: false });
  console.log(`Connected to database: ${mongoose.connection.db?.databaseName}\n`);

  // ---- Step 1: duplicate detection for every unique constraint, always run first ----
  console.log("=".repeat(72));
  console.log("STEP 1 — Duplicate detection (every unique constraint, read-only)");
  console.log("=".repeat(72));

  const conflictedModels = new Set<string>();
  for (const check of UNIQUE_CHECKS) {
    const dupes = await findDuplicates(check);
    if (dupes.length === 0) {
      console.log(`  OK    ${check.label}`);
    } else {
      conflictedModels.add(check.modelName);
      console.log(`  ⚠ CONFLICT  ${check.label} — ${dupes.length} colliding group(s):`);
      for (const d of dupes.slice(0, 5)) {
        console.log(`      key=${JSON.stringify(d.key)} count=${d.count} ids=${d.ids.join(",")}`);
      }
      if (dupes.length > 5) console.log(`      ...and ${dupes.length - 5} more group(s)`);
    }
  }

  // ---- Step 2: compare declared vs actual indexes per collection ----
  console.log(`\n${"=".repeat(72)}`);
  console.log("STEP 2 — Declared vs. actual indexes per collection");
  console.log("=".repeat(72));

  const comparisons: IndexComparison[] = [];
  for (const modelName of ALL_MODEL_NAMES) {
    const cmp = await compareIndexes(modelName);
    comparisons.push(cmp);
    const status = cmp.missing.length === 0 ? "OK  " : "MISS";
    console.log(
      `  ${status}  ${cmp.modelName.padEnd(20)} declared=${cmp.declaredCount} actual=${cmp.actualCount}` +
        (cmp.missing.length ? `  missing=[${cmp.missing.join(" | ")}]` : "")
    );
    if (cmp.extra.length) {
      for (const e of cmp.extra) {
        console.log(`          extra (not in schema): name="${e.name}" key=${e.signature}`);
      }
    }
  }

  const modelsWithMissingIndexes = comparisons.filter((c) => c.missing.length > 0);

  // ---- Step 3: apply, if requested ----
  if (apply) {
    console.log(`\n${"=".repeat(72)}`);
    console.log("STEP 3 — Applying (--apply passed)");
    console.log("=".repeat(72));

    for (const modelName of ALL_MODEL_NAMES) {
      if (conflictedModels.has(modelName)) {
        console.log(`  SKIP  ${modelName} — has real duplicate data, resolve first, not touched`);
        continue;
      }
      const model = mongoose.model(modelName);
      try {
        await model.syncIndexes();
        console.log(`  DONE  ${modelName}.syncIndexes()`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  FAIL  ${modelName}.syncIndexes() — ${message}`);
      }
    }

    console.log(`\nRe-run without --apply to confirm the result.`);
  } else {
    console.log(`\n${"=".repeat(72)}`);
    if (conflictedModels.size > 0) {
      console.log(
        `⚠ ${conflictedModels.size} model(s) have real duplicate data — resolve before applying: ` +
          [...conflictedModels].join(", ")
      );
    }
    if (modelsWithMissingIndexes.length > 0) {
      console.log(
        `${modelsWithMissingIndexes.length} of ${ALL_MODEL_NAMES.length} collections are missing at least one declared index in this database.`
      );
    } else {
      console.log(`All declared indexes already exist in this database. Nothing to apply.`);
    }
    console.log(`This was a dry run — nothing was written. Re-run with --apply to build indexes.`);
  }

  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Index sync failed:", error);
    process.exit(1);
  });
