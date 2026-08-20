import { z } from "zod";

export const inviteMemberFormSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  role: z.enum(["admin", "member"]),
});

export type InviteMemberFormValues = z.infer<typeof inviteMemberFormSchema>;
