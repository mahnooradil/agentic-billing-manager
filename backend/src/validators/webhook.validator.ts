/**
 * Zod schema for the inbound Pipedream billing webhook payload. Field rules are
 * kept consistent with the Billing module; the platform is identified by its
 * human-friendly `platformSlug` (resolved to a Platform in the controller).
 */
import { z } from "zod";

import { BILLING_STATUSES } from "@/models/billing.model";

/** URL-friendly slug: lowercase letters, numbers, and single hyphens. */
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** ISO 4217-style currency code: exactly three letters (e.g. USD). */
const CURRENCY_REGEX = /^[A-Z]{3}$/;

export const webhookBillingSchema = z.object({
  platformSlug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Platform slug must be at least 2 characters")
    .max(100, "Platform slug must be at most 100 characters")
    .regex(SLUG_REGEX, "Platform slug may contain only lowercase letters, numbers, and hyphens"),
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
  amount: z.coerce.number().nonnegative("Amount must be zero or greater"),
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

export type WebhookBillingInput = z.infer<typeof webhookBillingSchema>;
