/**
 * AI recommendations controller — Phase 10 (first Agentic AI foundation layer).
 *
 * Flow: analytics snapshot -> AI reasoning -> structured recommendations.
 * Reuses the per-user AI settings (Phase 8A) exactly like the chat controller:
 * reads provider/model/ENCRYPTED key, decrypts in memory only for the outgoing
 * request, and never logs or returns the key. Provider failures are mapped to a
 * clean 502 by the provider layer (never 401). Only AGGREGATED analytics are
 * sent to the provider — see `ai-recommendations.prompt.ts`.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { decryptSecret } from "@/utils/crypto";
import { generateChatCompletion } from "@/utils/ai-provider";
import { computeAnalyticsOverview } from "@/services/analytics/analytics.engine";
import { buildRecommendationsPrompt } from "@/utils/ai-recommendations.prompt";
import {
  parseRecommendations,
  type AiRecommendationsResult,
} from "@/utils/ai-recommendations.serializer";
import { AiSettings } from "@/models/ai-settings.model";
import type { AiRecommendationsInput } from "@/validators/ai-recommendations.validator";

/** POST /api/ai/recommendations — AI recommendations from the analytics snapshot. */
export const generateRecommendations = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const { range, focus } = req.body as AiRecommendationsInput;

  // `apiKey` is select:false, so request it explicitly for this call only.
  const settings = await AiSettings.findOne({ user: user._id }).select("+apiKey");
  if (!settings) {
    throw new AppError(
      "Please configure your AI provider in Settings before generating recommendations.",
      400
    );
  }

  const overview = await computeAnalyticsOverview(range);

  // No billing data -> short-circuit with a friendly result and NO billable call.
  if (overview.invoiceCount === 0) {
    const emptyResult: AiRecommendationsResult = {
      recommendations: [],
      provider: settings.provider,
      model: settings.model,
      generatedAt: new Date(),
      dataAvailable: false,
    };
    sendSuccess(res, 200, "No billing data to analyze yet", emptyResult);
    return;
  }

  const prompt = buildRecommendationsPrompt(overview, focus);
  const apiKey = decryptSecret(settings.apiKey);
  const reply = await generateChatCompletion({
    provider: settings.provider,
    model: settings.model,
    apiKey,
    messages: [{ role: "user", content: prompt }],
  });

  const result: AiRecommendationsResult = {
    recommendations: parseRecommendations(reply),
    provider: settings.provider,
    model: settings.model,
    generatedAt: new Date(),
    dataAvailable: true,
  };

  sendSuccess(res, 200, "AI recommendations generated", result);
});
