/**
 * Zod schemas for authentication request bodies. Passwordless: every request
 * body only ever carries an email (+ name, for the register flow) or a
 * 6-digit code — there is no password anywhere in this contract.
 */
import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("A valid email address is required");

/** Register flow: name + email are known upfront so a new account can be
 *  created the moment the code is verified. */
export const requestRegisterOtpSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must be at most 100 characters"),
  email: emailSchema,
});

/** Login flow: email only — the account must already exist. */
export const requestLoginOtpSchema = z.object({
  email: emailSchema,
});

export const verifyOtpSchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

/** Profile update: only the display name — email changes go through the
 *  separate OTP-verified email-change flow below. */
export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must be at most 100 characters"),
});

/** Change-email flow: request a code at the NEW address, then verify it. */
export const requestEmailChangeSchema = z.object({
  newEmail: emailSchema,
});

export const verifyEmailChangeSchema = z.object({
  newEmail: emailSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

/** Switches which of the caller's own organizations is active. */
export const switchOrganizationSchema = z.object({
  organizationId: z
    .string()
    .trim()
    .regex(/^[0-9a-fA-F]{24}$/, "A valid organization is required"),
});

export type RequestRegisterOtpInput = z.infer<typeof requestRegisterOtpSchema>;
export type RequestLoginOtpInput = z.infer<typeof requestLoginOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type RequestEmailChangeInput = z.infer<typeof requestEmailChangeSchema>;
export type VerifyEmailChangeInput = z.infer<typeof verifyEmailChangeSchema>;
export type SwitchOrganizationInput = z.infer<typeof switchOrganizationSchema>;
