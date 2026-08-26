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
  /** This user's Slack member id (`U…`), once they've linked their account
   *  via a one-time code (see services/slack) — lets them chat with the
   *  Billing Advisor Agent from a Slack DM. `undefined` until linked. */
  slackUserId?: string;
  /** Pending Slack link code + expiry, cleared once used. Short-lived (see
   *  services/slack/slack-chat-handler.ts) — never treated as a login credential. */
  slackLinkCode?: string;
  slackLinkCodeExpiresAt?: Date;
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
    slackUserId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true, // most users never link Slack — sparse keeps them out of the unique index
    },
    slackLinkCode: {
      type: String,
      trim: true,
    },
    slackLinkCodeExpiresAt: {
      type: Date,
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

export const User = model<IUser, UserModel>("User", userSchema);
