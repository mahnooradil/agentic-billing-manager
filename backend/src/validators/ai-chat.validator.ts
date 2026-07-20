/**
 * Zod schema for the AI chat request body. The client sends the full in-memory
 * conversation (no server-side history in this phase). Roles are limited to
 * user/assistant; system prompts are out of scope.
 */
import { z } from "zod";

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .trim()
    .min(1, "Message content is required")
    .max(8000, "Message is too long"),
});

export const chatSchema = z.object({
  messages: z
    .array(chatMessageSchema)
    .min(1, "At least one message is required")
    .max(50, "Too many messages in one request"),
});

export type ChatInput = z.infer<typeof chatSchema>;
