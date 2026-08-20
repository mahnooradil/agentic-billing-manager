import { z } from "zod";

import { INVITABLE_ROLES } from "@/models/invitation.model";

export const createInvitationSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: z.enum(INVITABLE_ROLES).default("member"),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
