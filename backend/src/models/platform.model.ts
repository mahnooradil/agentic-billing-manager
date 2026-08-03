/**
 * Platform model — first business module (Phase 6A).
 *
 * A "platform" is a third-party service the user is billed on. Only presentation
 * fields here; no billing/usage data (out of scope for this phase).
 *
 * - `slug` is unique (URL-friendly identifier).
 * - `timestamps` adds `createdAt` / `updatedAt` automatically.
 */
import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

/** Allowed platform statuses. Single source of truth for schema + validators. */
export const PLATFORM_STATUSES = ["Active", "Inactive"] as const;
export type PlatformStatus = (typeof PLATFORM_STATUSES)[number];

/** Shape of the persisted platform fields. */
export interface IPlatform {
  /** Owning user — every query MUST be scoped by this. */
  user: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  website?: string;
  logo?: string;
  status: PlatformStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type PlatformDocument = HydratedDocument<IPlatform>;
type PlatformModel = Model<IPlatform>;

const platformSchema = new Schema<IPlatform, PlatformModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name must be at most 100 characters"],
    },
    slug: {
      type: String,
      required: [true, "Slug is required"],
      // Uniqueness is per-user (see compound index below), not global — two
      // different users may each have their own platform with the same slug.
      lowercase: true,
      trim: true,
      minlength: [2, "Slug must be at least 2 characters"],
      maxlength: [100, "Slug must be at most 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description must be at most 500 characters"],
      default: undefined,
    },
    website: { type: String, trim: true, default: undefined },
    logo: { type: String, trim: true, default: undefined },
    status: {
      type: String,
      enum: {
        values: PLATFORM_STATUSES,
        message: "Status must be either Active or Inactive",
      },
      default: "Active",
    },
  },
  {
    timestamps: true,
    // Strip Mongoose internals if a document is ever serialized directly.
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// One slug per user (not global) — replaces the old bare-unique index.
platformSchema.index({ user: 1, slug: 1 }, { unique: true });

export const Platform = model<IPlatform, PlatformModel>(
  "Platform",
  platformSchema
);
