/**
 * Billing Agent chat service — talks to the Managed Agents backend
 * (`/agent/chat`), separate from the plain AI Assistant (`/ai/chat`). Only
 * the latest message is sent each turn — conversation memory lives in the
 * agent's own session server-side, not resent from the client.
 */
import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type { AgentChatResponseData } from "@/services/types/agent";

/** POST /agent/chat */
export function sendAgentMessage(
  message: string
): Promise<ApiSuccess<AgentChatResponseData>> {
  return api.post<ApiSuccess<AgentChatResponseData>>("/agent/chat", { message });
}

/** DELETE /agent/chat — ends the current agent session ("New Chat"). */
export function resetAgentSession(): Promise<ApiSuccess<null>> {
  return api.delete<ApiSuccess<null>>("/agent/chat");
}
