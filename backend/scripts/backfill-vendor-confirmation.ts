/**
 * Vendor-confirmation backfill — WP-5's "confirm detected vendors" step
 * (see vendor.model.ts's `confirmedAt` docstring). Every existing Vendor
 * predates this field and would otherwise show up as "awaiting review" the
 * first time anyone loads the Platforms page — a surprise backlog of
 * already-trusted, already-in-real-use vendors, not a genuine new
 * detection. This marks every pre-existing Vendor as already-confirmed (as
 * of its own `createdAt`, not "now" — an honest timestamp) so the feature
 * only ever prompts for vendors detected AFTER this backfill runs.
 *
 * Two modes:
 *
 *   npx tsx scripts/backfill-vendor-confirmation.ts            — CHECK ONLY
 *     (default, safe). Reports how many vendors would be marked confirmed
 *     without writing anything.
 *
 *   npx tsx scripts/backfill-vendor-confirmation.ts --apply    — Applies it.
 *     Idempotent — only touches vendors with no `confirmedAt`/`rejectedAt`
 *     yet, so re-running is a no-op once applied.
 */
import mongoose from "mongoose";

import { env } from "@/config/env";
import { Vendor } from "@/models/vendor.model";

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  if (!env.mongoUri) {
    throw new Error("MONGODB_URI is not set — see backend/.env");
  }

  console.log("Connecting (autoIndex disabled — this script controls its own writes)...");
  await mongoose.connect(env.mongoUri, { autoIndex: false });
  console.log(`Connected to database: ${mongoose.connection.db?.databaseName}\n`);

  const unconfirmed = await Vendor.find({
    confirmedAt: { $exists: false },
    rejectedAt: { $exists: false },
  }).select("name domain createdAt");

  console.log("=".repeat(72));
  console.log(apply ? "APPLYING vendor-confirmation backfill" : "CHECK ONLY — no writes will be made");
  console.log("=".repeat(72));

  for (const vendor of unconfirmed) {
    console.log(
      `  ${apply ? "CONFIRMING" : "WOULD CONFIRM"}  ${vendor._id.toString()} — ${vendor.name}` +
        `${vendor.domain ? ` <${vendor.domain}>` : ""} (created ${vendor.createdAt.toISOString()})`
    );
    if (apply) {
      await Vendor.updateOne({ _id: vendor._id }, { $set: { confirmedAt: vendor.createdAt } });
    }
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`Found ${unconfirmed.length} pre-existing unconfirmed vendor(s).`);
  if (!apply) {
    console.log(`\nThis was a dry run — nothing was written. Re-run with --apply to backfill.`);
  }

  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Vendor-confirmation backfill failed:", error);
    process.exit(1);
  });
