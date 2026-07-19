/**
 * AI settings controllers — per-user AI provider configuration.
 *
 * All routes are protected by `authenticate`, so `req.user` is present. Each
 * user has at most one configuration; create/edit is a single upsert. The API
 * key is encrypted before storage and never returned (only a masked hint).
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { encryptSecret } from "@/utils/crypto";
import { toPublicAiSettings } from "@/utils/ai-settings.serializer";
import { AiSettings } from "@/models/ai-settings.model";
import type { UpsertAiSettingsInput } from "@/validators/ai-settings.validator";

/** GET /api/ai/settings — the current user's AI configuration (or null). */
export const getMyAiSettings = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const settings = await AiSettings.findOne({ user: user._id });
  sendSuccess(res, 200, "AI settings retrieved", {
    settings: settings ? toPublicAiSettings(settings) : null,
  });
});

/** PUT /api/ai/settings — create or update the current user's configuration. */
export const upsertAiSettings = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const body = req.body as UpsertAiSettingsInput;
  const existing = await AiSettings.findOne({ user: user._id });

  // A key is mandatory when first creating a configuration.
  if (!existing && !body.apiKey) {
    throw new AppError("API key is required", 400);
  }

  const update: {
    provider: UpsertAiSettingsInput["provider"];
    model: string;
    apiKey?: string;
    apiKeyLast4?: string;
  } = {
    provider: body.provider,
    model: body.model,
  };

  // Only re-encrypt/replace the stored key when a new one is provided.
  if (body.apiKey) {
    update.apiKey = encryptSecret(body.apiKey);
    update.apiKeyLast4 = body.apiKey.slice(-4);
  }

  const settings = await AiSettings.findOneAndUpdate(
    { user: user._id },
    { $set: update, $setOnInsert: { user: user._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  sendSuccess(res, existing ? 200 : 201, "AI settings saved", {
    settings: toPublicAiSettings(settings),
  });
});

/** DELETE /api/ai/settings — remove the current user's configuration. */
export const deleteAiSettings = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const deleted = await AiSettings.findOneAndDelete({ user: user._id });
  if (!deleted) {
    throw new AppError("AI settings not found", 404);
  }

  sendSuccess(res, 200, "AI settings deleted", {
    id: deleted._id.toString(),
  });
});
