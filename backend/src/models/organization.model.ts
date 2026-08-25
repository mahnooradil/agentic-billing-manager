/**
 * Organization model — the shared workspace multiple users belong to.
 *
 * Every existing single-user account gets its own personal Organization
 * (created either at signup, or backfilled for pre-existing accounts — see
 * services/organizations/organization-bootstrap.service.ts). Business data
 * that used to be scoped by `user` (Platform, Billing, PlatformConnection,
 * Recommendation, Notification) is now scoped by `organization` instead, so
 * every member of an org sees the same shared data. `planTier` moved here
 * from User — plan limits (max platforms/billing records) gate the org's
 * SHARED resources, not any one member.
 */
import { Schema, model, type HydratedDocument, type Model } from "mongoose";

import { PLAN_TIERS, type PlanTier } from "@/config/plans";

export interface IOrganization {
  name: string;
  planTier: PlanTier;
  /** Credit-based AI usage tracker (see config/credits.ts, services/credits/)
   *  — deliberately scoped to the ORGANIZATION, not any one member: whoever
   *  is currently active in this workspace draws from the SAME pool,
   *  matching who actually pays for the plan (the org, not an individual
   *  member). A user's own personal workspace has its own pool too — same
   *  field, just an organization of one. Can dip slightly below zero — see
   *  CreditTransaction's `balanceAfter` field for why. No payment processor
   *  wired up yet. */
  creditsBalance: number;
  /** When this organization's plan-cycle credit allowance was last applied
   *  (see services/credits/credit-reset-scheduler.ts). `undefined` for an
   *  org that hasn't had its first cycle reset yet — treated as due
   *  immediately. */
  lastCreditResetAt?: Date;
  /** True only for a personal workspace auto-created as a fallback (see
   *  `ensureOwnerHasPersonalWorkspace`) so its owner isn't left without one
   *  after inviting someone into their original workspace. Never set for a
   *  signup-created or otherwise deliberately-created workspace. The ONLY
   *  thing this flag enables: `cleanupRedundantFallbackWorkspace` may
   *  auto-delete it later if it's still empty once no longer needed —
   *  never touches a workspace without this flag. */
  isFallbackPersonal?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type OrganizationDocument = HydratedDocument<IOrganization>;
type OrganizationModel = Model<IOrganization>;

const organizationSchema = new Schema<IOrganization, OrganizationModel>(
  {
    name: {
      type: String,
      required: [true, "Organization name is required"],
      trim: true,
      minlength: [1, "Organization name is required"],
      maxlength: [100, "Organization name must be at most 100 characters"],
    },
    planTier: {
      type: String,
      enum: PLAN_TIERS,
      default: "Free",
    },
    creditsBalance: {
      type: Number,
      default: 0,
    },
    lastCreditResetAt: {
      type: Date,
    },
    isFallbackPersonal: {
      type: Boolean,
      default: false,
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

export const Organization = model<IOrganization, OrganizationModel>(
  "Organization",
  organizationSchema
);
