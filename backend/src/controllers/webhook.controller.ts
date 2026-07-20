/**
 * Webhook controllers — Phase 8C.
 *
 * Ingests billing events pushed by Pipedream. Reuses the Billing model and
 * serializer so webhook-sourced records are identical to UI-created ones (they
 * appear in the Billing page, search/filter/sort, and dashboard statistics with
 * no frontend changes). Secret verification happens in the route middleware.
 *
 * Idempotency: a record is matched by (platform, invoiceNumber). If it already
 * exists it is UPDATED with the newer webhook values instead of duplicated.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { toPublicBilling } from "@/utils/billing.serializer";
import { Billing } from "@/models/billing.model";
import { Platform } from "@/models/platform.model";
import type { WebhookBillingInput } from "@/validators/webhook.validator";

/** POST /api/webhooks/billing — create or update a billing record from Pipedream. */
export const ingestBillingWebhook = asyncHandler(async (req, res) => {
  const body = req.body as WebhookBillingInput;

  // Resolve the platform by slug; an unknown platform is unprocessable.
  const platform = await Platform.findOne({ slug: body.platformSlug });
  if (!platform) {
    throw new AppError("Unknown platform for the provided platformSlug", 422);
  }

  // Idempotency: match on (platform, invoiceNumber).
  const existing = await Billing.findOne({
    platform: platform._id,
    invoiceNumber: body.invoiceNumber,
  });

  if (existing) {
    // Update mutable fields with the newer webhook values (no duplicate).
    existing.customerName = body.customerName;
    existing.amount = body.amount;
    existing.currency = body.currency;
    existing.billingDate = body.billingDate;
    if (body.status) {
      existing.status = body.status;
    }
    if (body.notes !== undefined) {
      existing.notes = body.notes;
    }
    await existing.save();
    await existing.populate("platform");

    sendSuccess(res, 200, "Billing record updated from webhook", {
      billingRecord: toPublicBilling(existing),
    });
    return;
  }

  const created = await Billing.create({
    platform: platform._id,
    customerName: body.customerName,
    invoiceNumber: body.invoiceNumber,
    amount: body.amount,
    currency: body.currency,
    billingDate: body.billingDate,
    ...(body.status ? { status: body.status } : {}),
    ...(body.notes ? { notes: body.notes } : {}),
  });
  await created.populate("platform");

  sendSuccess(res, 201, "Billing record created from webhook", {
    billingRecord: toPublicBilling(created),
  });
});
