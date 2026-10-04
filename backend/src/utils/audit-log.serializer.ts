/** Converts an AuditLog document into the shape returned to API clients. */
import type { AuditLogDocument, AuditLogAction, AuditLogEntityType } from "@/models/audit-log.model";
import type { UserDocument } from "@/models/user.model";

export interface PublicAuditLogUser {
  id: string;
  fullName: string;
  email: string;
}

export interface PublicAuditLog {
  id: string;
  user: PublicAuditLogUser | null;
  action: AuditLogAction;
  entityType: AuditLogEntityType;
  entityId: string;
  summary: string;
  createdAt: Date;
}

export function toPublicAuditLog(entry: AuditLogDocument): PublicAuditLog {
  const user = entry.user as unknown as UserDocument | null;
  const isPopulated = user && typeof user === "object" && "fullName" in user;

  return {
    id: entry._id.toString(),
    user: isPopulated
      ? { id: user._id.toString(), fullName: user.fullName, email: user.email }
      : null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId.toString(),
    summary: entry.summary,
    createdAt: entry.createdAt,
  };
}
