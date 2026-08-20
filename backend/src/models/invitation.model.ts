/**
 * Invitation model — a pending "join my organization" invite by email.
 *
 * Mirrors the Otp model's "pending doc → consumed at accept-time" shape
 * (see auth.controller.ts's verifyOtp): persisted first, emailed best-effort,
 * consumed (status flips) when accepted. `token` is a high-entropy random
 * string (32 bytes hex) used in the accept link (`/invite/:token`) — unlike
 * the 6-digit OTP code, it doesn't need hashing (too much entropy to brute-force).
 */
import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

import { MEMBERSHIP_ROLES, type MembershipRole } from "@/models/membership.model";

export const INVITATION_STATUSES = ["pending", "accepted", "revoked", "expired"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/** An invite can only grant admin/member — never owner (there's exactly one
 *  owner, the org's creator; ownership transfers, never invites, in v1). Kept
 *  as its own literal tuple (not derived from MEMBERSHIP_ROLES via `.filter`)
 *  so it stays a usable tuple type for `z.enum`. Must be kept in sync with
 *  MEMBERSHIP_ROLES minus "owner" by hand — there are only 3 roles total. */
export const INVITABLE_ROLES = ["admin", "member"] as const satisfies readonly MembershipRole[];

export interface IInvitation {
  organization: Types.ObjectId;
  email: string;
  role: MembershipRole;
  invitedBy: Types.ObjectId;
  token: string;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type InvitationDocument = HydratedDocument<IInvitation>;
type InvitationModel = Model<IInvitation>;

const invitationSchema = new Schema<IInvitation, InvitationModel>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization is required"],
      index: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      enum: {
        values: MEMBERSHIP_ROLES,
        message: "Role must be admin or member",
      },
      default: "member",
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Inviter is required"],
    },
    token: {
      type: String,
      required: [true, "Token is required"],
      unique: true,
    },
    status: {
      type: String,
      enum: {
        values: INVITATION_STATUSES,
        message: "Invalid invitation status",
      },
      default: "pending",
      index: true,
    },
    expiresAt: {
      type: Date,
      required: [true, "Expiry is required"],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        delete ret.token; // never echoed back once created — email is the only delivery channel
        return ret;
      },
    },
  }
);

// One PENDING invite per email per org at a time — a revoked/expired/accepted
// one doesn't block re-inviting the same address later.
invitationSchema.index(
  { organization: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

export const Invitation = model<IInvitation, InvitationModel>(
  "Invitation",
  invitationSchema
);
