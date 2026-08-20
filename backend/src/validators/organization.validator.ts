import { z } from "zod";

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const updateMembershipRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});
export type UpdateMembershipRoleInput = z.infer<typeof updateMembershipRoleSchema>;
