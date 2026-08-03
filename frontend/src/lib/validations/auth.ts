/**
 * Client-side auth form schemas. Passwordless: kept in sync with the
 * backend's Zod validators — email (+ name for register), then a 6-digit
 * code. The backend remains the source of truth — these just give fast UX
 * feedback.
 */
import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email address");

export const registerEmailFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must be at most 100 characters"),
  email: emailSchema,
});
export type RegisterEmailFormValues = z.infer<typeof registerEmailFormSchema>;

export const loginEmailFormSchema = z.object({
  email: emailSchema,
});
export type LoginEmailFormValues = z.infer<typeof loginEmailFormSchema>;

export const otpCodeFormSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});
export type OtpCodeFormValues = z.infer<typeof otpCodeFormSchema>;

export const newEmailFormSchema = z.object({
  newEmail: emailSchema,
});
export type NewEmailFormValues = z.infer<typeof newEmailFormSchema>;
