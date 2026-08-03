/** Zod schema for submitting a support request. */
import { z } from "zod";

import { SUPPORT_CATEGORIES } from "@/models/support-request.model";

export const createSupportRequestSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  subject: z
    .string()
    .trim()
    .min(3, "Subject must be at least 3 characters")
    .max(150, "Subject must be at most 150 characters"),
  message: z
    .string()
    .trim()
    .min(10, "Message must be at least 10 characters")
    .max(2000, "Message must be at most 2000 characters"),
});

export type CreateSupportRequestInput = z.infer<typeof createSupportRequestSchema>;
