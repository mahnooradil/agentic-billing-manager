/**
 * Converts an Invitation document into the wire shape. The `token` never
 * appears here — the model's own `toJSON` transform strips it (email is the
 * only delivery channel for the accept link).
 */
import type { InvitationDocument } from "@/models/invitation.model";

export interface PublicInvitation {
  id: string;
  email: string;
  role: InvitationDocument["role"];
  status: InvitationDocument["status"];
  createdAt: Date;
  expiresAt: Date;
}

export function toPublicInvitation(invitation: InvitationDocument): PublicInvitation {
  return {
    id: invitation._id.toString(),
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    createdAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
  };
}
