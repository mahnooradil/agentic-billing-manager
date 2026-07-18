/**
 * Zod schemas for authentication request bodies.
 * These are the single source of truth for register/login input rules and
 * feed both runtime validation (via the `validate` middleware) and static
 * types (via `z.infer`).
 */
import { z } from "zod";

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name must be at most 100 characters"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("A valid email address is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
  profilePicture: z
    .string()
    .trim()
    .url("Profile picture must be a valid URL")
    .optional(),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("A valid email address is required"),
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
