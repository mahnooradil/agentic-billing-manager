/**
 * Membership model — links a User to an Organization they belong to. A user
 * may hold multiple Memberships (their own personal workspace as owner, plus
 * any org they were invited into) — the compound unique index below only
 * prevents a duplicate membership to the SAME organization, not a second
 * organization altogether. Which one is "current" for a request is a
 * separate concept — see `User.activeOrganizationId` and
 * `auth.middleware.ts`, which resolves and attaches
 * `req.organization`/`req.membership` for exactly that one org each request.
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
      // No standalone index — the compound unique index below (user first)
      // already serves "find this user's memberships" queries.
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

// One membership per (user, organization) pair — prevents a duplicate join,
// while still allowing the SAME user to hold separate memberships across
// multiple organizations.
membershipSchema.index({ user: 1, organization: 1 }, { unique: true });

export const Membership = model<IMembership, MembershipModel>(
  "Membership",
  membershipSchema
);
