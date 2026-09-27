/**
 * Vendor backfill — Task 7. Every existing `auto_sync`/`email_sync` Billing
 * record predates the `Vendor` model and has no `vendor`/`vendorDomain` set.
 * This resolves (or creates) the right `Vendor` for each one, using the exact
 * same `resolveVendor()` both sync engines now use going forward — so a
 * legacy record and a freshly-synced one for the same real vendor land on
 * the identical Vendor document.
 *
 * Two modes:
 *
 *   npx tsx scripts/backfill-vendors.ts            — CHECK ONLY (default, safe).
 *     Reports what each record WOULD resolve to (new vendor vs. an existing
 *     match) without writing anything, to either `Vendor` or `Billing`.
 *
 *   npx tsx scripts/backfill-vendors.ts --apply    — Applies the backfill.
 *     Same resolution, but actually upserts each `Vendor` and sets
 *     `Billing.vendor`/`vendorDomain`. Idempotent — safe to re-run; a record
 *     that already has `vendor` set is skipped every time.
 *
 * Run `scripts/sync-indexes.ts --apply` once after this (or before — order
 * doesn't matter for correctness, only for when the uniqueness guarantee
 * becomes DB-enforced) so `Vendor`'s own unique indexes actually exist.
 */
import mongoose, { Types } from "mongoose";

import { env } from "@/config/env";
import { Billing } from "@/models/billing.model";
import { PlatformConnection } from "@/models/platform-connection.model";
import "@/models/vendor.model";
import { resolveVendor } from "@/services/vendors/vendor-resolver.service";
import { legacyBillingVendorIdentity } from "@/services/vendors/legacy-billing-vendor-identity";

interface LegacyRecord {
  _id: Types.ObjectId;
  organization: Types.ObjectId;
  source: "auto_sync" | "email_sync";
  platformConnection?: Types.ObjectId;
  vendorName?: string;
  customerName: string;
  senderDomain?: string;
}

/** The display name + domain this record should resolve its vendor by —
 *  see legacy-billing-vendor-identity.ts for the actual (tested) derivation.
 *  Caches a connection's displayName per id so an auto_sync connection with
 *  hundreds of records only ever looks it up once per run. */
async function identityFor(
  record: LegacyRecord,
  connectionNameCache: Map<string, string>
): Promise<{ name: string; domain?: string } | null> {
  return legacyBillingVendorIdentity(record, async (connectionId) => {
    const cached = connectionNameCache.get(connectionId);
    if (cached) return cached;
    const connection = await PlatformConnection.findById(connectionId).select("displayName");
    if (!connection?.displayName) return null;
    connectionNameCache.set(connectionId, connection.displayName);
    return connection.displayName;
  });
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  if (!env.mongoUri) {
    throw new Error("MONGODB_URI is not set — see backend/.env");
  }

  console.log("Connecting (autoIndex disabled — this script controls its own writes)...");
  await mongoose.connect(env.mongoUri, { autoIndex: false });
  console.log(`Connected to database: ${mongoose.connection.db?.databaseName}\n`);

  const cursor = Billing.find({
    source: { $in: ["auto_sync", "email_sync"] },
    vendor: { $exists: false },
  })
    .select("organization source platformConnection vendorName customerName senderDomain")
    .lean<LegacyRecord[]>()
    .cursor();

  const connectionNameCache = new Map<string, string>();
  let scanned = 0;
  let resolved = 0;
  let skippedNoIdentity = 0;
  let vendorsCreated = 0;
  let vendorsMatched = 0;
  const seenVendorIds = new Set<string>();

  console.log("=".repeat(72));
  console.log(apply ? "APPLYING vendor backfill" : "CHECK ONLY — no writes will be made");
  console.log("=".repeat(72));

  for await (const record of cursor) {
    scanned++;
    const identity = await identityFor(record, connectionNameCache);
    if (!identity) {
      skippedNoIdentity++;
      console.log(`  SKIP  Billing ${record._id.toString()} — no name/connection to resolve from`);
      continue;
    }

    if (!apply) {
      console.log(
        `  WOULD RESOLVE  Billing ${record._id.toString()} (${record.source}) → ` +
          `${identity.name}${identity.domain ? ` <${identity.domain}>` : ""}`
      );
      resolved++;
      continue;
    }

    const vendorDoc = await resolveVendor(record.organization, identity);
    const vendorIdStr = vendorDoc._id.toString();
    if (seenVendorIds.has(vendorIdStr)) {
      vendorsMatched++;
    } else {
      seenVendorIds.add(vendorIdStr);
      // First time this run sees this vendor id — could be pre-existing
      // (created by a live sync run since this migration was written) or
      // brand new; `createdAt`/`updatedAt` equality is the only cheap way
      // to tell without a second query, close enough for a progress report.
      if (vendorDoc.createdAt.getTime() === vendorDoc.updatedAt.getTime()) {
        vendorsCreated++;
      } else {
        vendorsMatched++;
      }
    }

    await Billing.updateOne(
      { _id: record._id },
      {
        $set: {
          vendor: vendorDoc._id,
          ...(vendorDoc.domain ? { vendorDomain: vendorDoc.domain } : {}),
        },
      }
    );
    resolved++;
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`Scanned ${scanned} legacy record(s) with no vendor set.`);
  console.log(`  ${apply ? "Resolved/updated" : "Would resolve"}: ${resolved}`);
  console.log(`  Skipped (no usable name): ${skippedNoIdentity}`);
  if (apply) {
    console.log(`  Vendors created: ${vendorsCreated}`);
    console.log(`  Vendors matched (existing): ${vendorsMatched}`);
  } else {
    console.log(`\nThis was a dry run — nothing was written. Re-run with --apply to backfill.`);
  }

  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Vendor backfill failed:", error);
    process.exit(1);
  });
