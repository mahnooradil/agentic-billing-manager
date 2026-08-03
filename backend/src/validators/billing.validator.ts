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

export type CreateBillingInput = z.infer<typeof createBillingSchema>;
export type UpdateBillingInput = z.infer<typeof updateBillingSchema>;
export type ImportBillingRowInput = z.infer<typeof importBillingRowSchema>;
export type ImportBillingInput = z.infer<typeof importBillingSchema>;
