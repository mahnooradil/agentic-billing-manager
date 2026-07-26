/**
 * Zod schema for the agent chat request body. A single message per request —
 * conversation continuity lives server-side in the Managed Agents session,
 * not in a client-resent history (unlike the plain /api/ai/chat endpoint).
 */
import { z } from "zod";

export const agentChatSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(8000, "Message is too long"),
});

export type AgentChatInput = z.infer<typeof agentChatSchema>;
