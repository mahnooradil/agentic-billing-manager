/**
 * Billing CRUD controllers.
 *
 * Input is validated by the `validate` middleware and all routes are protected
 * by `authenticate`, so these handlers focus on business logic. Errors are
 * thrown as `AppError`s and formatted centrally; async rejections are forwarded
 * via `asyncHandler`. Follows the same model→controller pattern as platforms.
 *
 * Every query is scoped to the authenticated user's ORGANIZATION — billing
 * records are shared across every member of the org. Every billing record
 * belongs to one Platform; the reference is populated on reads so the
 * serialized record carries a minimal { id, name, slug } platform.
 */
import { isValidObjectId, type Types } from "mongoose";

import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { toPublicBilling } from "@/utils/billing.serializer";
import { toCsv, parseCsv } from "@/utils/csv";
import { Billing, type BillingDocument } from "@/models/billing.model";
import { BillingEvent } from "@/models/billing-event.model";
import { Platform } from "@/models/platform.model";
import { emitBusinessDataChanged } from "@/services/events/event-bus";
import {
  assertBillingRecordLimit,
  getRemainingBillingRecordCapacity,
} from "@/utils/plan-limits";
import { importBillingRowSchema, listBillingQuerySchema } from "@/validators/billing.validator";
import { recordBillingEvent } from "@/services/billing/billing-event-recorder.service";
import { recordAuditLog, billingAuditSummary } from "@/services/billing/audit-log-recorder.service";
import type {
  CreateBillingInput,
  UpdateBillingInput,
  ImportBillingInput,
} from "@/validators/billing.validator";

/** Hard ceiling for `/billing/export` — unlike the list endpoint this is
 *  meant to return everything, so there's no page/limit query param, just a
 *  safety bound well above any current plan tier's record count (see
 *  config/plans.ts) so it only ever bites a scale this product doesn't have
 *  customers at yet, per CLAUDE.md Sec10.3's "unbounded list/export" finding. */
const EXPORT_SAFETY_LIMIT = 20_000;

/** Loads a billing record by id, scoped to its organization, or throws a 404. */
async function findBillingOr404(
  id: string,
  organizationId: Types.ObjectId
): Promise<BillingDocument> {
  if (!isValidObjectId(id)) {
    throw new AppError("Billing record not found", 404);
  }
  const billing = await Billing.findOne({ _id: id, organization: organizationId })
    .populate("platform", "name slug")
    .populate("platformConnection", "displayName platform accountIdentifier")
    .populate("vendor", "name domain");
  if (!billing) {
    throw new AppError("Billing record not found", 404);
  }
  return billing;
}

/**
 * Ensures the referenced platform exists AND belongs to this organization,
 * else a 400 (bad reference) — without this check a member could attach a
 * billing record to another organization's platform id.
 */
async function assertPlatformExists(
  platformId: string,
  organizationId: Types.ObjectId
): Promise<void> {
  const exists = await Platform.exists({ _id: platformId, organization: organizationId });
  if (!exists) {
    throw new AppError("The selected platform does not exist", 400);
  }
}

/**
 * GET /api/billing — list the organization's billing records (newest billing
 * date first). WP-3 (CLAUDE.md Sec10.3) — this used to run with no
 * `.limit()` at all, so it's now paginated: `page`/`limit` query params
 * (defaults below make this a no-op for every real account today), plus a
 * `totalRecords` count so a future UI can show "N of M" honestly even before
 * a full server-side-pagination table exists.
 */
export const listBillingRecords = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const { page, limit } = listBillingQuerySchema.parse(req.query);
  const filter = { organization: organization._id };

  const [records, totalRecords] = await Promise.all([
    Billing.find(filter)
      .populate("platform", "name slug")
      .populate("platformConnection", "displayName platform accountIdentifier")
      .populate("vendor", "name domain")
      .sort({ billingDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Billing.countDocuments(filter),
  ]);

  sendSuccess(res, 200, "Billing records retrieved", {
    billingRecords: records.map(toPublicBilling),
    pagination: { page, limit, totalRecords, totalPages: Math.max(1, Math.ceil(totalRecords / limit)) },
  });
});

/** GET /api/billing/export — the organization's full billing history as a CSV download. */
export const exportBillingRecords = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const records = await Billing.find({ organization: organization._id })
    .populate("platform", "name slug")
    .populate("platformConnection", "displayName platform accountIdentifier")
    .populate("vendor", "name domain")
    .sort({ billingDate: -1, createdAt: -1 })
    .limit(EXPORT_SAFETY_LIMIT);

  const csv = toCsv(
    ["Platform", "Customer", "Invoice Number", "Amount", "Currency", "Billing Date", "Status", "Source"],
    records.map((record) => {
      const pub = toPublicBilling(record);
      return [
        pub.platform.name,
        pub.customerName,
        pub.invoiceNumber,
        pub.amount,
        pub.currency,
        pub.billingDate.toISOString().slice(0, 10),
        pub.status,
        pub.source,
      ];
    })
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="billing-records-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.send(csv);
});

const IMPORT_COLUMNS = [
  "platform",
  "customer",
  "invoice number",
  "amount",
  "currency",
  "billing date",
  "status",
] as const;

/**
 * POST /api/billing/import — bulk-creates billing records from a CSV file
 * (read client-side via `File.text()` and posted as plain JSON, so no
 * multipart/file-upload dependency is needed). Every row must reference one
 * of the organization's OWN platforms by name (case-insensitive) — unknown
 * platforms are reported as a per-row error, never auto-created. Imported
 * records are always `source: "manual"`, regardless of what a "Source"
 * column in the file says.
 */
export const importBillingRecords = asyncHandler(async (req, res) => {
  const user = req.user;
  const organization = req.organization;
  const membership = req.membership;
  if (!user || !organization || !membership) {
    throw new AppError("Authentication required", 401);
  }
  if (membership.role === "member") {
    throw new AppError("Only an owner or admin can import billing records.", 403);
  }

  const { csv } = req.body as ImportBillingInput;
  const rows = parseCsv(csv);
  if (rows.length === 0) {
    throw new AppError("The CSV file is empty", 400);
  }

  const [header, ...dataRows] = rows;
  const columnIndex = new Map(
    header.map((h, i) => [h.trim().toLowerCase(), i] as const)
  );
  const missingColumns = IMPORT_COLUMNS.filter((c) => !columnIndex.has(c));
  if (missingColumns.length > 0) {
    throw new AppError(
      `The CSV is missing required column(s): ${missingColumns.join(", ")}`,
      400
    );
  }
  const cell = (row: string[], column: (typeof IMPORT_COLUMNS)[number]): string =>
    (row[columnIndex.get(column) as number] ?? "").trim();

  const platforms = await Platform.find({ organization: organization._id });
  const platformByName = new Map(
    platforms.map((p) => [p.name.trim().toLowerCase(), p])
  );

  let remainingCapacity = await getRemainingBillingRecordCapacity(
    organization._id,
    organization.planTier
  );

  let imported = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = i + 2; // +1 for the header row, +1 for 1-indexing

    if (remainingCapacity !== null && remainingCapacity <= 0) {
      errors.push({
        row: rowNumber,
        message: "Your plan's billing record limit has been reached — upgrade to import more.",
      });
      continue;
    }

    const platformName = cell(row, "platform");
    const platform = platformByName.get(platformName.toLowerCase());
    if (!platform) {
      errors.push({
        row: rowNumber,
        message: `Unknown platform "${platformName || "(blank)"}" — add it under Integrations first.`,
      });
      continue;
    }

    const parsed = importBillingRowSchema.safeParse({
      customerName: cell(row, "customer"),
      invoiceNumber: cell(row, "invoice number"),
      amount: cell(row, "amount"),
      currency: cell(row, "currency"),
      billingDate: cell(row, "billing date"),
      status: cell(row, "status") || undefined,
    });
    if (!parsed.success) {
      errors.push({
        row: rowNumber,
        message: parsed.error.issues[0]?.message ?? "Invalid row",
      });
      continue;
    }

    try {
      await Billing.create({
        ...parsed.data,
        organization: organization._id,
        user: user._id,
        platform: platform._id,
        source: "manual",
      });
      imported += 1;
      if (remainingCapacity !== null) remainingCapacity -= 1;
    } catch (err) {
      errors.push({
        row: rowNumber,
        message: err instanceof Error ? err.message : "Could not save this row",
      });
    }
  }

  if (imported > 0) {
    emitBusinessDataChanged({
      source: "billing",
      action: "create",
      triggeredBy: user._id.toString(),
    });
  }

  sendSuccess(res, 200, "Import complete", {
    imported,
    failed: errors.length,
    errors: errors.slice(0, 20),
  });
});

/** GET /api/billing/stats — aggregate counts + paid revenue for the dashboard. */
export const getBillingStats = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const [
    totalRecords,
    paidRecords,
    pendingRecords,
    overdueRecords,
    revenueRows,
  ] = await Promise.all([
    Billing.countDocuments({ organization: organization._id }),
    Billing.countDocuments({ organization: organization._id, status: "Paid" }),
    Billing.countDocuments({ organization: organization._id, status: "Pending" }),
    Billing.countDocuments({ organization: organization._id, status: "Overdue" }),
    Billing.aggregate<{ _id: string; revenue: number }>([
      { $match: { organization: organization._id, status: "Paid" } },
      { $group: { _id: "$currency", revenue: { $sum: "$amount" } } },
      { $sort: { revenue: -1 } },
    ]),
  ]);

  // WP-3 (CLAUDE.md Sec10.3) — Paid amounts are summed PER CURRENCY, never
  // added together as one bare number (USD + EUR + PKR is not a meaningful
  // sum). Sorted highest-first so the first entry is the natural "primary"
  // currency to headline, same convention `analytics.engine.ts` already uses.
  const revenueByCurrency = revenueRows.map((row) => ({
    currency: row._id,
    total: row.revenue,
  }));

  sendSuccess(res, 200, "Billing statistics retrieved", {
    stats: {
      totalRecords,
      paidRecords,
      pendingRecords,
      overdueRecords,
      revenueByCurrency,
    },
  });
});

/** GET /api/billing/:id — fetch a single billing record. */
export const getBillingRecord = asyncHandler(async (req, res) => {
  const organization = req.organization;
  if (!organization) {
    throw new AppError("Authentication required", 401);
  }

  const billing = await findBillingOr404(req.params.id as string, organization._id);
  sendSuccess(res, 200, "Billing record retrieved", {
    billingRecord: toPublicBilling(billing),
  });
});

/** POST /api/billing — create a billing record (owner/admin only). */
export const createBillingRecord = asyncHandler(async (req, res) => {
  const user = req.user;
  const organization = req.organization;
  const membership = req.membership;
  if (!user || !organization || !membership) {
    throw new AppError("Authentication required", 401);
  }
  if (membership.role === "member") {
    throw new AppError("Only an owner or admin can create billing records.", 403);
  }

  const body = req.body as CreateBillingInput;

  await assertPlatformExists(body.platform, organization._id);
  await assertBillingRecordLimit(organization._id, organization.planTier);

  const billing = await Billing.create({
    ...body,
    organization: organization._id,
    user: user._id,
  });
  await billing.populate("platform");
  await recordAuditLog({
    organization: organization._id,
    user: user._id,
    action: "create",
    entityType: "Billing",
    entityId: billing._id,
    summary: `Created invoice ${billingAuditSummary(billing)}`,
  });
  emitBusinessDataChanged({
    source: "billing",
    action: "create",
    triggeredBy: user._id.toString(),
  });
  sendSuccess(res, 201, "Billing record created", {
    billingRecord: toPublicBilling(billing),
  });
});

/** PUT /api/billing/:id — update a billing record (owner/admin only). */
export const updateBillingRecord = asyncHandler(async (req, res) => {
  const user = req.user;
  const organization = req.organization;
  const membership = req.membership;
  if (!user || !organization || !membership) {
    throw new AppError("Authentication required", 401);
  }
  if (membership.role === "member") {
    throw new AppError("Only an owner or admin can edit billing records.", 403);
  }

  const body = req.body as UpdateBillingInput;
  const billing = await findBillingOr404(req.params.id as string, organization._id);
  const previousStatus = billing.status;

  // Only re-validate the platform reference when it is actually changing.
  if (body.platform) {
    await assertPlatformExists(body.platform, organization._id);
  }

  Object.assign(billing, body);
  // Marks this as a human correction so a later email-sync pass never
  // silently reverts it based on an older email — see sync-engine.ts.
  billing.manuallyEditedAt = new Date();
  await billing.save();
  await billing.populate("platform");

  // Task 8 (dual-write, behind a flag) — a human changing the status is the
  // ONE event type that always wins in deriveStatus(), recorded here so
  // that guarantee actually holds. Only for a REAL change, not a no-op save
  // of the same status, and only for auto_sync/email_sync records (a manual
  // record has no BillingEvent history at all — nothing synced ever writes
  // one for it, so there's nothing for a correction to override).
  if (body.status && body.status !== previousStatus && billing.source !== "manual") {
    await recordBillingEvent({
      organization: organization._id,
      billing: billing._id,
      type: "user_correction",
      occurredAt: new Date(),
      confidence: 1,
      source: "user",
      correctedStatus: body.status,
      createdBy: user._id,
    }).catch(() => {
      // Best-effort — see the function's own docstring.
    });
  }

  await recordAuditLog({
    organization: organization._id,
    user: user._id,
    action: "update",
    entityType: "Billing",
    entityId: billing._id,
    summary:
      body.status && body.status !== previousStatus
        ? `Changed status of ${billingAuditSummary(billing)} from ${previousStatus} to ${body.status}`
        : `Edited ${billingAuditSummary(billing)}`,
  });

  emitBusinessDataChanged({
    source: "billing",
    action: "update",
    triggeredBy: user._id.toString(),
  });
  sendSuccess(res, 200, "Billing record updated", {
    billingRecord: toPublicBilling(billing),
  });
});

/** DELETE /api/billing/:id — remove a billing record (owner/admin only). */
export const deleteBillingRecord = asyncHandler(async (req, res) => {
  const user = req.user;
  const organization = req.organization;
  const membership = req.membership;
  if (!user || !organization || !membership) {
    throw new AppError("Authentication required", 401);
  }
  if (membership.role === "member") {
    throw new AppError("Only an owner or admin can delete billing records.", 403);
  }

  const billing = await findBillingOr404(req.params.id as string, organization._id);
  // Captured before the delete so AuditLog has something to describe — the
  // in-memory document still holds every field afterward too (deleteOne()
  // only issues the DB command, it doesn't clear this object), but reading
  // it beforehand makes that not something a future refactor could break.
  const summary = `Deleted invoice ${billingAuditSummary(billing)}`;
  await billing.deleteOne();
  // Best-effort cleanup of this record's BillingEvent history (Task 8) — an
  // orphaned event referencing a deleted Billing id is harmless (nothing
  // reads events except by billing id, which will simply never match
  // again), but there's no reason to leave it around either.
  await BillingEvent.deleteMany({ billing: billing._id }).catch(() => {});
  await recordAuditLog({
    organization: organization._id,
    user: user._id,
    action: "delete",
    entityType: "Billing",
    entityId: billing._id,
    summary,
  });
  emitBusinessDataChanged({
    source: "billing",
    action: "delete",
    triggeredBy: user._id.toString(),
  });
  sendSuccess(res, 200, "Billing record deleted", {
    id: billing._id.toString(),
  });
});
