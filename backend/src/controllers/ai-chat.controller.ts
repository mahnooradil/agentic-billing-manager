/**
 * AI chat controller — Phase 8B.
 *
 * Reuses the per-user AI settings from Phase 8A: reads the provider, model and
 * ENCRYPTED API key, decrypts the key in memory only for the outgoing request,
 * and returns the assistant reply. The key is never logged or returned.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { decryptSecret } from "@/utils/crypto";
import { generateChatCompletion } from "@/utils/ai-provider";
import { AiSettings } from "@/models/ai-settings.model";
import type { ChatInput } from "@/validators/ai-chat.validator";

/** POST /api/ai/chat — send the conversation to the user's provider. */
export const chat = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  const { messages } = req.body as ChatInput;

  // `apiKey` is select:false, so request it explicitly for this call only.
  const settings = await AiSettings.findOne({ user: user._id }).select(
    "+apiKey"
  );
  if (!settings) {
    throw new AppError(
      "Please configure your AI provider in Settings before using the assistant.",
      400
    );
  }

  const apiKey = decryptSecret(settings.apiKey);
  const reply = await generateChatCompletion({
    provider: settings.provider,
    model: settings.model,
    apiKey,
    messages,
  });

  sendSuccess(res, 200, "AI response generated", {
    message: { role: "assistant", content: reply },
  });
});
