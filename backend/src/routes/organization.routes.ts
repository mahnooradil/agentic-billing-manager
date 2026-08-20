import { Router } from "express";

import {
  getMyOrganization,
  updateMyOrganization,
  getMembers,
  updateMemberRole,
  removeMember,
} from "@/controllers/organization.controller";
import {
  createOrganizationInvitation,
  revokeOrganizationInvitation,
} from "@/controllers/invitation.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import {
  updateOrganizationSchema,
  updateMembershipRoleSchema,
} from "@/validators/organization.validator";
import { createInvitationSchema } from "@/validators/invitation.validator";

const router = Router();

router.use(authenticate);

router.get("/", getMyOrganization);
router.patch("/", validate(updateOrganizationSchema), updateMyOrganization);

router.get("/members", getMembers);
router.patch("/members/:id", validate(updateMembershipRoleSchema), updateMemberRole);
router.delete("/members/:id", removeMember);

router.post("/invitations", validate(createInvitationSchema), createOrganizationInvitation);
router.delete("/invitations/:id", revokeOrganizationInvitation);

export default router;
