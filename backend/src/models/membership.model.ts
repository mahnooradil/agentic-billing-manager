/**
 * Membership model — links a User to the ONE Organization they belong to.
 *
 * v1 simplification: a user belongs to exactly one organization at a time
 * (enforced by the `unique: true` on `user` below) — no org-switching, no
 * multi-org membership yet. `authenticate` (auth.middleware.ts) looks this up
 * for every request and attaches `req.organization`/`req.membership`.
 */
import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

/** Owner: created the org / full control (delete org, change any role).
 *  Admin: invite/remove members, manage billing data, cannot delete the org
 *  or remove/demote the Owner. Member: use the shared workspace data. */
export const MEMBERSHIP_ROLES = ["owner", "admin", "member"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export interface IMembership {
  user: Types.ObjectId;
  organization: Types.ObjectId;
  role: MembershipRole;
  createdAt: Date;
  updatedAt: Date;
}

export type MembershipDocument = HydratedDocument<IMembership>;
type MembershipModel = Model<IMembership>;

const membershipSchema = new Schema<IMembership, MembershipModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      unique: true, // v1: one organization per user
    },
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization is required"],
      index: true,
    },
    role: {
      type: String,
      enum: {
        values: MEMBERSHIP_ROLES,
        message: "Role must be owner, admin, or member",
      },
      default: "member",
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const Membership = model<IMembership, MembershipModel>(
  "Membership",
  membershipSchema
);
