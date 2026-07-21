/**
 * AI chat controller — Phase 8B, made data-aware in Phase 11.
 *
 * Reuses the per-user AI settings from Phase 8A: reads the provider, model and
 * ENCRYPTED API key, decrypts the key in memory only for the outgoing request,
 * and returns the assistant reply. The key is never logged or returned.
 *
 * Phase 11: before calling the provider it builds a compact, PII-free grounding
 * context from the read-only tool registry and passes it as the system
 * instruction, so answers are grounded in the workspace's aggregated billing
 * data. Grounding degrades gracefully — if the context build fails, chat still
 * works exactly as in Phase 8B.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { decryptSecret } from "@/utils/crypto";
import { generateChatCompletion } from "@/utils/ai-provider";
import { buildAssistantContext } from "@/services/ai/tools";
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

  // Ground the assistant in the workspace's aggregated billing data. Failure to
  // build the context must never break chat, so degrade to ungrounded on error.
  let system: string | undefined;
  try {
    system = await buildAssistantContext();
  } catch {
    system = undefined;
  }

  const apiKey = decryptSecret(settings.apiKey);
  const reply = await generateChatCompletion({
    provider: settings.provider,
    model: settings.model,
    apiKey,
    messages,
    system,
  });

  sendSuccess(res, 200, "AI response generated", {
    message: { role: "assistant", content: reply },
  });
});
