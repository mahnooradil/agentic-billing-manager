/**
 * User model — authentication foundation.
 *
 * - `email` is unique.
 * - `password` is hashed with bcrypt before every save and is NEVER returned
 *   in query results (`select: false`) or serialized JSON.
 * - `timestamps` adds `createdAt` / `updatedAt` automatically.
 */
import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import bcrypt from "bcrypt";

/** Cost factor for bcrypt hashing. Centralized — no magic numbers inline. */
const BCRYPT_SALT_ROUNDS = 12;

/** Shape of the persisted user fields. */
export interface IUser {
  fullName: string;
  email: string;
  password: string;
  profilePicture?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Instance methods available on a user document. */
export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<IUser, IUserMethods>;
type UserModel = Model<IUser, Record<string, never>, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
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
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      // Excluded from query results by default; opt in with `.select("+password")`.
      select: false,
    },
    profilePicture: {
      type: String,
      trim: true,
      default: undefined,
    },
  },
  {
    timestamps: true,
    // Defensive: strip password if a document is ever serialized directly.
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.password;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/**
 * Hash the password before saving whenever it has been set or changed.
 * Async middleware: returning/awaiting is enough — no `next` callback needed.
 */
userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) {
    return;
  }
  this.password = await bcrypt.hash(this.password, BCRYPT_SALT_ROUNDS);
});

/**
 * Compare a plaintext candidate against the stored bcrypt hash.
 * NOTE: `password` is `select: false`, so the caller MUST load the document
 * with `.select("+password")` — otherwise `this.password` is undefined and
 * this always resolves to `false`.
 */
userSchema.methods.comparePassword = async function comparePassword(
  candidate: string
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

export const User = model<IUser, UserModel>("User", userSchema);
