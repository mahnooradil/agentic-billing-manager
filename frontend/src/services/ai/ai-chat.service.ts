/**
 * AI chat service — sends the in-memory conversation to the backend, which
 * forwards it to the user's configured provider. Goes through the shared
 * authenticated `api` client (Bearer token + central 401 handling).
 */
import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type { ChatMessage, ChatResponseData } from "@/services/types/ai";

/** POST /ai/chat */
export function sendChatMessage(
  messages: ChatMessage[]
): Promise<ApiSuccess<ChatResponseData>> {
  return api.post<ApiSuccess<ChatResponseData>>("/ai/chat", { messages });
}
