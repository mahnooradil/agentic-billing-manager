import { Router } from "express";

import {
  getMyOrganization,
  updateMyOrganization,
  getMembers,
  updateMemberRole,
  removeMember,
  exportMyData,
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
// Static path registered before "/members"/"/invitations" — no id collision
// risk here either way, but keeps the convention consistent with other
// route files that register fixed paths before dynamic ones.
router.get("/export", exportMyData);

router.get("/members", getMembers);
router.patch("/members/:id", validate(updateMembershipRoleSchema), updateMemberRole);
router.delete("/members/:id", removeMember);

router.post("/invitations", validate(createInvitationSchema), createOrganizationInvitation);
router.delete("/invitations/:id", revokeOrganizationInvitation);

export default router;
