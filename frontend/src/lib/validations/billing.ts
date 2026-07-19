/**
 * Client-side billing form schema. Rules mirror the backend Zod validators for
 * fast UX feedback. The backend remains the source of truth. Form inputs are
 * strings; the dialog converts `amount` to a number and passes the date/status
 * through before submitting.
 */
import { z } from "zod";

export const BILLING_STATUSES = ["Pending", "Paid", "Overdue"] as const;

const CURRENCY_REGEX = /^[A-Z]{3}$/;

export const billingFormSchema = z.object({
  platform: z.string().min(1, "Please select a platform"),
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
  amount: z
    .string()
    .trim()
    .min(1, "Amount is required")
    .refine(
      (value) => !Number.isNaN(Number(value)) && Number(value) >= 0,
      "Amount must be a number of zero or greater"
    ),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(CURRENCY_REGEX, "Use a 3-letter code (e.g. USD)"),
  billingDate: z.string().min(1, "Billing date is required"),
  status: z.enum(BILLING_STATUSES),
  notes: z
    .string()
    .trim()
    .max(1000, "Notes must be at most 1000 characters"),
});

export type BillingFormValues = z.infer<typeof billingFormSchema>;
