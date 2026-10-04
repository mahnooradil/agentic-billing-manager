/**
 * Zod schemas for billing request bodies. Single source of truth for the
 * create/update input rules; kept in sync with the Mongoose schema.
 */
import { z } from "zod";

import { BILLING_STATUSES } from "@/models/billing.model";

/** A 24-character hex MongoDB ObjectId. */
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/** ISO 4217-style currency code: exactly three letters (e.g. USD). */
const CURRENCY_REGEX = /^[A-Z]{3}$/;

export const createBillingSchema = z.object({
  platform: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "A valid platform is required"),
  customerName: z
    .string()
    .trim()
    .min(2, "Customer name must be at least 2 characters")
    .max(100, "Customer name must be at most 100 characters"),
  invoiceNumber: z
    .string()
    .trim()
    .min(1, "Invoice number is required")
    .max(50, "Invoice number must be at most 50 characters"),
  amount: z.coerce
    .number()
    .nonnegative("Amount must be zero or greater"),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(CURRENCY_REGEX, "Currency must be a 3-letter code (e.g. USD)"),
  billingDate: z.coerce.date(),
  status: z.enum(BILLING_STATUSES).optional(),
  notes: z
    .string()
    .trim()
    .max(1000, "Notes must be at most 1000 characters")
    .optional(),
});

/** Update allows any subset of the create fields. */
export const updateBillingSchema = createBillingSchema.partial();

/** One CSV row's fields, minus `platform` (resolved by name against the
 *  caller's own platforms, not submitted as an id — see the import endpoint). */
export const importBillingRowSchema = createBillingSchema.omit({ platform: true });

/** POST /billing/import body — raw CSV text (read client-side via `File.text()`). */
export const importBillingSchema = z.object({
  csv: z.string().min(1, "The CSV file is empty"),
});

/**
 * GET /billing query params — WP-3 (CLAUDE.md Sec10.3): the endpoint used to
 * run `Billing.find({organization})` with no `.limit()` at all. `limit`
 * defaults to 2000 (above every current plan tier's billing-record cap
 * except Business's "unlimited" — see config/plans.ts — so this changes
 * nothing for any real account today) and is hard-capped at 5000 regardless
 * of what a caller requests, closing the literal unbounded-query risk.
 */
export const listBillingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(5000).optional().default(2000),
  /** WP-5 duplicate-merge — merged-away duplicates are hidden from the
   *  default list (see billing.controller.ts); this reveals them for a
   *  "view/restore hidden duplicates" UI. */
  includeDuplicates: z.coerce.boolean().optional().default(false),
});

/** POST /billing/:id/merge body — the OTHER record being merged into :id. */
export const mergeBillingSchema = z.object({
  duplicateId: z
    .string()
    .trim()
    .regex(OBJECT_ID_REGEX, "A valid billing record id is required"),
});

export type CreateBillingInput = z.infer<typeof createBillingSchema>;
export type UpdateBillingInput = z.infer<typeof updateBillingSchema>;
export type ImportBillingRowInput = z.infer<typeof importBillingRowSchema>;
export type ImportBillingInput = z.infer<typeof importBillingSchema>;
export type ListBillingQuery = z.infer<typeof listBillingQuerySchema>;
export type MergeBillingInput = z.infer<typeof mergeBillingSchema>;
