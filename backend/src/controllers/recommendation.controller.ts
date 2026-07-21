/**
 * Recommendation controller — Phase F1.
 *
 * Read + lifecycle endpoints over the persistent Recommendation collection, plus
 * an internal `/refresh` for ops/debugging (not surfaced in the UI). Generation
 * itself lives in the Recommendation Engine; this layer stays thin. All routes
 * are protected by `authenticate`.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { toPublicRecommendation } from "@/utils/recommendation.serializer";
import { Recommendation } from "@/models/recommendation.model";
import { runRefresh } from "@/services/ai/recommendation-engine";
import {
  listRecommendationsQuerySchema,
  type UpdateRecommendationStatusInput,
} from "@/validators/recommendation.validator";
import { isValidObjectId } from "mongoose";

/** GET /api/recommendations?status=active|dismissed|completed|all */
export const listRecommendations = asyncHandler(async (req, res) => {
  const { status } = listRecommendationsQuerySchema.parse(req.query);
  const filter = status === "all" ? {} : { status };

  const docs = await Recommendation.find(filter).sort({ updatedAt: -1 });
  const recommendations = docs.map(toPublicRecommendation);

  // "Last updated" reflects the most recent change across the returned set.
  const lastUpdatedAt =
    recommendations.length > 0 ? recommendations[0].updatedAt : null;

  sendSuccess(res, 200, "Recommendations retrieved", {
    recommendations,
    meta: { status, count: recommendations.length, lastUpdatedAt },
  });
});

/** PATCH /api/recommendations/:id/status — dismiss/complete/reactivate. */
export const updateRecommendationStatus = asyncHandler(async (req, res) => {
  const id = req.params.id as string;
  if (!isValidObjectId(id)) {
    throw new AppError("Recommendation not found", 404);
  }

  const { status } = req.body as UpdateRecommendationStatusInput;
  const doc = await Recommendation.findById(id);
  if (!doc) {
    throw new AppError("Recommendation not found", 404);
  }

  doc.status = status;
  // A user action owns the resolution; active clears it.
  doc.resolvedBy = status === "active" ? null : "user";
  await doc.save();

  sendSuccess(res, 200, "Recommendation updated", {
    recommendation: toPublicRecommendation(doc),
  });
});

/**
 * POST /api/recommendations/refresh — internal/ops trigger. Awaits a full engine
 * run (so callers get a deterministic result) and returns the active set.
 */
export const refreshRecommendations = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const result = await runRefresh(user._id.toString());
  const docs = await Recommendation.find({ status: "active" }).sort({
    updatedAt: -1,
  });

  sendSuccess(res, 200, "Recommendation refresh completed", {
    result,
    recommendations: docs.map(toPublicRecommendation),
  });
});
