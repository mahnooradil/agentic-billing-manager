/**
 * Index integrity — the runtime half of the S-01 fix. `config/database.ts`
 * disables Mongoose's automatic index building in production
 * (`autoIndex: false`, for predictable startup performance under load), so
 * every `unique`/`index: true`/`schema.index()` declaration across the
 * models needs an explicit mechanism to actually reach the database —
 * otherwise every uniqueness guarantee the app relies on (one account per
 * email, one Otp per email, invoice dedup, Slack/Stripe event dedup, etc.)
 * is silently fictional there. Two pieces, both called from `server.ts`
 * right after `connectDatabase()`, before anything else runs:
 *
 *  - `syncIndexesIfEnabled()` — only runs `Model.syncIndexes()` (a real,
 *    potentially slow write, and one that DROPS any index in the database
 *    the current schema no longer declares) when `SYNC_INDEXES_ON_BOOT=true`
 *    is set. Meant to be turned on for one deploy after adding or changing
 *    an index, then off again — never left on by default.
 *  - `assertIndexesInSync()` — always runs, fast and read-only (an
 *    `indexes()` list call per collection, no writes). Compares every
 *    registered model's declared indexes against what actually exists and
 *    throws — which `server.ts` treats as a startup failure, the same as a
 *    failed database connection — if anything declared is missing. This is
 *    the actual safety net: even if the sync flag was left off, or a new
 *    model shipped without anyone remembering to run the migration script,
 *    the app refuses to boot into a state where its own data-integrity
 *    guarantees are silently absent, rather than running broken and quiet.
 *
 * Model discovery is dynamic (`mongoose.modelNames()`), not a hardcoded
 * list — by the time `server.ts` calls these, every model file has already
 * been imported transitively through `createApp()` → routes → controllers,
 * so this covers any model added later with no update needed here.
 *
 * The one-off migration script (`scripts/sync-indexes.ts`) additionally
 * runs a duplicate-detection pass before building any missing unique index,
 * and reports "extra" (undeclared, stale) indexes before dropping them —
 * deliberately more cautious than this runtime path, since it's meant to be
 * run and read by a person before a real schema change ships, not to gate
 * every boot.
 */
import mongoose from "mongoose";

import { env } from "@/config/env";

/** A stable, comparable signature for an index's key spec, e.g. "organization_1,slug_1". */
function indexSignature(key: Record<string, number | string>): string {
  return Object.entries(key)
    .map(([field, dir]) => `${field}_${dir}`)
    .join(",");
}

async function getMissingIndexes(modelName: string): Promise<string[]> {
  const model = mongoose.model(modelName);
  const declaredIndexes = model.schema.indexes() as [Record<string, number>, unknown][];
  const declared = declaredIndexes.map(([key]) => indexSignature(key));

  // A collection that has never received a write doesn't physically exist
  // in MongoDB yet, and `collection.indexes()` throws "ns does not exist"
  // rather than returning an empty list for that case — treat it as zero
  // actual indexes (correct: none exist) instead of letting a raw driver
  // error crash the boot sequence with a misleading message.
  let actual: Awaited<ReturnType<typeof model.collection.indexes>> = [];
  try {
    actual = await model.collection.indexes();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("ns does not exist")) throw error;
  }

  const actualSignatures = new Set(
    actual
      .filter((ix) => ix.name !== "_id_")
      .map((ix) => indexSignature(ix.key as Record<string, number>))
  );
  return declared.filter((sig: string) => !actualSignatures.has(sig));
}

/** Runs `Model.syncIndexes()` for every registered model — see the module
 *  docstring for why this only happens when explicitly enabled. */
export async function syncIndexesIfEnabled(): Promise<void> {
  if (!env.syncIndexesOnBoot) return;

  console.log("SYNC_INDEXES_ON_BOOT=true — syncing indexes for every model...");
  for (const modelName of mongoose.modelNames()) {
    await mongoose.model(modelName).syncIndexes();
  }
  console.log("Index sync complete.");
}

/** Fails startup loudly if any model's declared indexes are missing from
 *  its live collection — the guarantee that closes S-01 for good. */
export async function assertIndexesInSync(): Promise<void> {
  const problems: string[] = [];

  for (const modelName of mongoose.modelNames()) {
    const missing = await getMissingIndexes(modelName);
    if (missing.length > 0) {
      problems.push(`${modelName}: missing [${missing.join(", ")}]`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      "Index integrity check failed — declared indexes are missing from the database:\n" +
        problems.map((p) => `  - ${p}`).join("\n") +
        "\nRun: npx tsx scripts/sync-indexes.ts --apply"
    );
  }
}
