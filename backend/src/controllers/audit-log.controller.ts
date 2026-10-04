/**
 * Audit log controller — WP-12 (flow/03 Sec7, CLAUDE.md roadmap). Read-only:
 * entries are written by `services/billing/audit-log-recorder.service.ts`
 * from `billing.controller.ts`'s own mutation handlers, never here.
 *
 * Owner/admin only — a member who's allowed to read billing data (RBAC —
 * see billing.controller.ts) is not automatically allowed to see who else
 * on the team has been editing or deleting it; same privilege boundary the
 * plan/billing-mutation routes already use.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { AuditLog } from "@/models/audit-log.model";
import { toPublicAuditLog } from "@/utils/audit-log.serializer";
import { listAuditLogQuerySchema } from "@/validators/audit-log.validator";

/** GET /api/audit-log — the organization's financial-mutation history,
 *  newest first (owner/admin only). */
export const listAuditLog = asyncHandler(async (req, res) => {
  const organization = req.organization;
  const membership = req.membership;
  if (!organization || !membership) {
    throw new AppError("Authentication required", 401);
  }
  if (membership.role === "member") {
    throw new AppError("Only an owner or admin can view the audit log.", 403);
  }

  const { limit } = listAuditLogQuerySchema.parse(req.query);

  const entries = await AuditLog.find({ organization: organization._id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("user", "fullName email");

  sendSuccess(res, 200, "Audit log retrieved", {
    entries: entries.map(toPublicAuditLog),
  });
});
