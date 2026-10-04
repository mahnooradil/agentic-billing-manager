/**
 * Duplicate-candidate detection — WP-5's "duplicate flags with a merge
 * action" (flow/08 §6). Read-only, deterministic, no AI call — groups
 * records that are very likely the SAME real bill observed twice (e.g. a
 * platform connected via both a billing-sync adapter AND an email-sync
 * inbox, or two near-identical sync passes), as distinct from a normal
 * RECURRING charge (the same vendor/amount billed again next month, which
 * must never be flagged).
 *
 * Grouping key: the same real-world vendor identity (preferring the
 * resolved `Vendor` id — Task 7 — which is shared across auto_sync AND
 * email_sync for the same vendor; falling back to `vendorName`, then the
 * manual `platform` ref, then raw `customerName` for the oldest legacy
 * records with none of the above) plus an identical amount and currency.
 * Within one such group, records are further clustered by `billingDate`
 * proximity (`DUPLICATE_WINDOW_DAYS`) — this is what distinguishes "two
 * records for the same October invoice, 2 days apart" (a real duplicate)
 * from "this vendor's October AND November invoice" (normal recurrence,
 * a month apart) using the exact same amount.
 *
 * Deliberately excludes anything already resolved: `duplicateOf` set
 * (already merged into another record) or `duplicateDismissedAt` set (a
 * human already reviewed this exact record and said it's not a duplicate).
 */
import { Types } from "mongoose";

import { Billing, type BillingDocument } from "@/models/billing.model";
// Registered for side effects only — this file's own `.populate()` calls
// below need these models registered with Mongoose even when this module is
// imported in isolation (e.g. a standalone test run that never otherwise
// loads billing.controller.ts, which is what normally pulls them in).
import "@/models/platform.model";
import "@/models/platform-connection.model";
import "@/models/vendor.model";

/** Tight enough to never catch a monthly/annual recurring charge (which
 *  would share the same amount a month+ apart), loose enough to catch two
 *  sources reporting the same real-world bill a few days apart. */
const DUPLICATE_WINDOW_DAYS = 5;
const DUPLICATE_WINDOW_MS = DUPLICATE_WINDOW_DAYS * 86_400_000;
/** Safety bound on how many non-resolved records this scans per request —
 *  matches the scale-appropriate caps already used elsewhere in this file's
 *  sibling services (e.g. billing.controller.ts's EXPORT_SAFETY_LIMIT). */
const CANDIDATE_SCAN_LIMIT = 5000;

interface CandidateLean {
  _id: Types.ObjectId;
  vendor?: Types.ObjectId;
  vendorName?: string;
  platform?: Types.ObjectId;
  customerName: string;
  amount: number;
  currency: string;
  billingDate: Date;
}

function groupKey(record: CandidateLean): string {
  const identity = record.vendor
    ? `v:${record.vendor.toString()}`
    : record.vendorName
      ? `n:${record.vendorName.trim().toLowerCase()}`
      : record.platform
        ? `p:${record.platform.toString()}`
        : `c:${record.customerName.trim().toLowerCase()}`;
  return `${identity}|${record.amount}|${record.currency}`;
}

/** Sliding-window clustering within one (vendor, amount, currency) group:
 *  sorted by date, a new cluster starts whenever the gap from the previous
 *  record exceeds the window. Only clusters of 2+ are real candidates. */
function clusterByDate(records: CandidateLean[]): Types.ObjectId[][] {
  const sorted = [...records].sort((a, b) => a.billingDate.getTime() - b.billingDate.getTime());
  const clusters: CandidateLean[][] = [];
  for (const record of sorted) {
    const current = clusters[clusters.length - 1];
    if (current && record.billingDate.getTime() - current[current.length - 1].billingDate.getTime() <= DUPLICATE_WINDOW_MS) {
      current.push(record);
    } else {
      clusters.push([record]);
    }
  }
  return clusters.filter((c) => c.length >= 2).map((c) => c.map((r) => r._id));
}

/** Returns groups of likely-duplicate Billing records (full, populated
 *  documents — same shape the controller already populates for a normal
 *  list), newest group first. Each group has 2+ records. */
export async function findDuplicateCandidateGroups(
  organizationId: Types.ObjectId
): Promise<BillingDocument[][]> {
  const candidates = await Billing.find({
    organization: organizationId,
    duplicateOf: { $exists: false },
    duplicateDismissedAt: { $exists: false },
  })
    .select("vendor vendorName platform customerName amount currency billingDate")
    .limit(CANDIDATE_SCAN_LIMIT)
    .lean<CandidateLean[]>();

  const byKey = new Map<string, CandidateLean[]>();
  for (const record of candidates) {
    const key = groupKey(record);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(record);
    else byKey.set(key, [record]);
  }

  const clusterIdGroups: Types.ObjectId[][] = [];
  for (const bucket of byKey.values()) {
    if (bucket.length < 2) continue;
    clusterIdGroups.push(...clusterByDate(bucket));
  }

  if (clusterIdGroups.length === 0) return [];

  const allIds = clusterIdGroups.flat();
  const fullRecords = await Billing.find({ _id: { $in: allIds } })
    .populate("platform", "name slug")
    .populate("platformConnection", "displayName platform accountIdentifier")
    .populate("vendor", "name domain");
  const byId = new Map(fullRecords.map((r) => [r._id.toString(), r]));

  return clusterIdGroups
    .map((ids) => ids.map((id) => byId.get(id.toString())).filter((r): r is BillingDocument => Boolean(r)))
    .filter((group) => group.length >= 2)
    .sort((a, b) => b[0].billingDate.getTime() - a[0].billingDate.getTime());
}
