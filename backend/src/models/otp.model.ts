/**
 * One-time verification code model — powers the entire auth flow (there is no
 * password anywhere in this app). One pending code per email; a new request
 * replaces any previous one (upsert).
 *
 * `codeHash` is a SHA-256 digest, not bcrypt — the code is short-lived (see
 * `OTP_TTL_MINUTES`), single-use, and already rate-limited by `attempts`, so a
 * fast hash is enough here (unlike a password, which must resist offline
 * brute-force indefinitely).
 *
 * `fullName` is only ever set when the request came from the register flow
 * (an email with no existing account) — it is used to create the User on a
 * successful verify, then the whole document is deleted.
 */
import { Schema, model, type HydratedDocument, type Model } from "mongoose";

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

export interface IOtp {
  email: string;
  codeHash: string;
  fullName?: string;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type OtpDocument = HydratedDocument<IOtp>;
type OtpModel = Model<IOtp>;

const otpSchema = new Schema<IOtp, OtpModel>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    codeHash: { type: String, required: true },
    fullName: { type: String, trim: true, default: undefined },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

export const Otp = model<IOtp, OtpModel>("Otp", otpSchema);
