/**
 * User model — authentication foundation.
 *
 * Passwordless: accounts are created and signed in entirely via emailed
 * one-time codes (see `Otp`) — there is no password to store or compare.
 *
 * - `email` is unique.
 * - `timestamps` adds `createdAt` / `updatedAt` automatically.
 * - The credit-based AI usage tracker (`creditsBalance`, `lastCreditResetAt`)
 *   lives on `Organization`, NOT here — whoever is actively using AI
 *   features draws from the CURRENT workspace's pool (the one its owner
 *   actually pays for), not a balance tied to this individual account.
 */
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

/** Shape of the persisted user fields. */
export interface IUser {
  fullName: string;
  email: string;
  profilePicture?: string;
  /** Bumped by "sign out of all other devices" — invalidates every JWT signed
   *  with an older version, since verifying one compares it to this value. */
  tokenVersion: number;
  /** Which of this user's (possibly several) Organizations is "current" —
   *  every business-data request is scoped to this one org, never more than
   *  one at a time (see auth.middleware.ts). `undefined` for a user who has
   *  never needed to switch (their only/first membership is used instead). */
  activeOrganizationId?: Types.ObjectId;
  /** This user's linked Slack identities, one per CONNECTED WORKSPACE (an
   *  Organization's `slackWorkspace` — see organization.model.ts). A Slack
   *  member id (`U…`) is only unique WITHIN its own workspace (`teamId`), so
   *  a user who belongs to several organizations, each with their own
   *  separate connected Slack workspace, needs one entry per workspace —
   *  never a single flat id. Set via a one-time link code (see
   *  services/slack/slack-chat-handler.ts) once per workspace. */
  slackLinks: Array<{
    teamId: string;
    slackUserId: string;
    organization: Types.ObjectId;
  }>;
  /** Pending Slack link code + expiry, cleared once used. Scoped to the
   *  specific organization (and therefore Slack workspace) the code was
   *  generated for — redeeming it in the wrong workspace's DM must not
   *  silently link against a different org than the one intended. Short-
   *  lived — never treated as a login credential. */
  slackLinkCode?: string;
  slackLinkCodeExpiresAt?: Date;
  slackLinkOrganizationId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUser>;
type UserModel = Model<IUser>;

const userSchema = new Schema<IUser, UserModel>(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      minlength: [2, "Full name must be at least 2 characters"],
      maxlength: [100, "Full name must be at most 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true, // also creates the index — no separate `index: true` needed
      lowercase: true,
      trim: true,
    },
    profilePicture: {
      type: String,
      trim: true,
      default: undefined,
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    activeOrganizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
    },
    slackLinks: {
      type: [
        {
          teamId: { type: String, required: true, trim: true },
          slackUserId: { type: String, required: true, trim: true },
          organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
        },
      ],
      default: [],
    },
    slackLinkCode: {
      type: String,
      trim: true,
    },
    slackLinkCodeExpiresAt: {
      type: Date,
    },
    slackLinkOrganizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
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

// Enforces that a (teamId, slackUserId) pair — one Slack identity within one
// specific workspace — is never linked to more than one User document. A
// multikey index: each array element becomes its own index entry, so this
// still catches a collision even though the fields live inside an array.
userSchema.index(
  { "slackLinks.teamId": 1, "slackLinks.slackUserId": 1 },
  { unique: true, sparse: true }
);

export const User = model<IUser, UserModel>("User", userSchema);
