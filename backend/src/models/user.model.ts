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

import { PLAN_TIERS, type PlanTier } from "@/config/plans";

/** Shape of the persisted user fields. */
export interface IUser {
  fullName: string;
  email: string;
  profilePicture?: string;
  /** Self-service plan tier (no payment processor yet — see config/plans.ts). */
  planTier: PlanTier;
  /** Bumped by "sign out of all other devices" — invalidates every JWT signed
   *  with an older version, since verifying one compares it to this value. */
  tokenVersion: number;
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
    planTier: {
      type: String,
      enum: PLAN_TIERS,
      default: "Free",
    },
    tokenVersion: {
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
