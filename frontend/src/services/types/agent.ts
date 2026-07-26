/**
 * Billing Agent chat types — deliberately separate from `services/types/ai.ts`
 * (the plain AI Assistant), since these two chats have different backends and
 * different response shapes (the agent can attach a `connect_platform` action).
 */
export type AgentChatRole = "user" | "assistant";

/**
 * Surfaced by the agent when it confirms a platform CAN be live-connected —
 * the chat UI renders this as a one-click deep link straight into the
 * existing, already-secure Connect flow on the Platforms page. Metadata only;
 * never a credential.
 */
export interface ConnectPlatformAction {
  type: "connect_platform";
  platform: string;
  displayName: string;
  source: "native" | "pipedream";
}

export interface AgentChatMessage {
  role: AgentChatRole;
  content: string;
  action?: ConnectPlatformAction;
}

/** Response `data` shape for a Billing Agent chat turn. */
export interface AgentChatResponseData {
  message: AgentChatMessage;
}
