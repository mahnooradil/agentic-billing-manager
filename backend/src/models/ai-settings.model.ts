/**
 * AI provider settings model — Phase 8A.
 *
 * Stores one AI provider configuration per user. The API key is stored
 * ENCRYPTED (see utils/crypto.ts) and is never returned to clients; only the
 * last four characters are kept in plaintext to render a masked hint.
 */
import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

/** Supported AI providers. Single source of truth for schema + validators. */
export const AI_PROVIDERS = ["OpenAI", "Gemini", "OpenRouter", "Claude"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** Shape of the persisted AI settings fields. */
export interface IAiSettings {
  user: Types.ObjectId;
  provider: AiProvider;
  /** AES-256-GCM encrypted API key. Never exposed to clients. */
  apiKey: string;
  /** Last four characters of the raw key, for a masked display hint. */
  apiKeyLast4: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AiSettingsDocument = HydratedDocument<IAiSettings>;
type AiSettingsModel = Model<IAiSettings>;

const aiSettingsSchema = new Schema<IAiSettings, AiSettingsModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      unique: true, // one AI configuration per user
    },
    provider: {
      type: String,
      required: [true, "Provider is required"],
      enum: {
        values: AI_PROVIDERS,
        message: "Provider must be OpenAI, Gemini, OpenRouter, or Claude",
      },
    },
    apiKey: {
      type: String,
      required: [true, "API key is required"],
      select: false, // never returned by default queries
    },
    apiKeyLast4: {
      type: String,
      default: "",
    },
    model: {
      type: String,
      required: [true, "Model name is required"],
      trim: true,
      maxlength: [100, "Model name must be at most 100 characters"],
    },
  },
  {
    timestamps: true,
    // Defensive: strip internals if a document is ever serialized directly.
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        delete ret.apiKey;
        return ret;
      },
    },
  }
);

export const AiSettings = model<IAiSettings, AiSettingsModel>(
  "AiSettings",
  aiSettingsSchema
);
