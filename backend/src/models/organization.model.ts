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
