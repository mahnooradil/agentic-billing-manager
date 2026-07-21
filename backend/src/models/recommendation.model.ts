/**
 * Recommendation model — Phase F1 (Autonomous AI Recommendation Engine).
 *
 * Recommendations are now PERSISTENT workspace data (not ephemeral AI responses).
 * The engine reconciles AI output against these documents by `signature` — one
 * document per signature — so a rec is updated in place (no duplicates), and its
 * `status` evolves over time (active -> completed/dismissed) rather than being
 * deleted. `resolvedBy` records whether a resolution was the AI's (auto) or the
 * user's, which governs recurrence handling.
 */
import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
} from "mongoose";

/** Lifecycle status. History is preserved — nothing is auto-deleted. */
export const RECOMMENDATION_STATUSES = ["active", "dismissed", "completed"] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

/** Priority. Mirrors the AI recommendation severities. */
export const RECOMMENDATION_SEVERITIES = ["low", "medium", "high"] as const;
export type RecommendationSeverity = (typeof RECOMMENDATION_SEVERITIES)[number];

/** How the recommendation was generated. Extend as new sources appear. */
export const RECOMMENDATION_SOURCES = ["auto", "manual"] as const;
export type RecommendationSource = (typeof RECOMMENDATION_SOURCES)[number];

/** Who resolved it (null while active). Governs recurrence/reactivation. */
export const RECOMMENDATION_RESOLVERS = ["ai", "user"] as const;
export type RecommendationResolver = (typeof RECOMMENDATION_RESOLVERS)[number];

export interface IRecommendation {
  title: string;
  detail: string;
  severity: RecommendationSeverity;
  category: string;
  suggestedAction: string;
  source: RecommendationSource;
  status: RecommendationStatus;
  /** Stable identity used for dedup/reconciliation (hash of category+title). */
  signature: string;
  /** null while active; "ai" if auto-completed; "user" if user acted. */
  resolvedBy: RecommendationResolver | null;
  /** Provider/model that produced the current content (audit; never a key). */
  provider?: string;
  model?: string;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type RecommendationDocument = HydratedDocument<IRecommendation>;
type RecommendationModel = Model<IRecommendation>;

const recommendationSchema = new Schema<IRecommendation, RecommendationModel>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    detail: { type: String, required: true, trim: true, maxlength: 1000 },
    severity: {
      type: String,
      enum: RECOMMENDATION_SEVERITIES,
      default: "medium",
    },
    category: { type: String, required: true, trim: true, maxlength: 60, default: "general" },
    suggestedAction: { type: String, trim: true, maxlength: 500, default: "" },
    source: { type: String, enum: RECOMMENDATION_SOURCES, default: "auto" },
    status: {
      type: String,
      enum: RECOMMENDATION_STATUSES,
      default: "active",
      index: true,
    },
    signature: { type: String, required: true, index: true },
    resolvedBy: { type: String, enum: RECOMMENDATION_RESOLVERS, default: null },
    provider: { type: String },
    model: { type: String },
    generatedAt: { type: Date, default: Date.now },
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

export const Recommendation = model<IRecommendation, RecommendationModel>(
  "Recommendation",
  recommendationSchema
);
