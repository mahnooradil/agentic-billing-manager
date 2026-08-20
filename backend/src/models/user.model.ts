/**
 * User model — authentication foundation.
 *
 * Passwordless: accounts are created and signed in entirely via emailed
 * one-time codes (see `Otp`) — there is no password to store or compare.
 *
 * - `email` is unique.
 * - `timestamps` adds `createdAt` / `updatedAt` automatically.
 */
import { Schema, model, type HydratedDocument, type Model } from "mongoose";

/** Shape of the persisted user fields. */
export interface IUser {
  fullName: string;
  email: string;
  profilePicture?: string;
  /** Bumped by "sign out of all other devices" — invalidates every JWT signed
   *  with an older version, since verifying one compares it to this value. */
  tokenVersion: number;
  /** Credit-based usage tracker balance (see config/credits.ts,
   *  services/credits/). Starts at 0 here — the signup grant is applied
   *  explicitly via `grantCredits` (auth.controller.ts) so it's a real ledger
   *  entry, not an unexplained default. Can dip slightly below zero — see
   *  CreditTransaction's `balanceAfter` field for why. No payment processor
   *  wired up yet. Deliberately PER-USER even inside an organization — each
   *  member's own Billing Advisor Agent usage, not a shared org pool. Plan
   *  tier (and its limits) moved to Organization — it gates the org's SHARED
   *  Platform/Billing data, not any one member's usage. */
  creditsBalance: number;
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
    creditsBalance: {
      type: Number,
      default: 0,
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
