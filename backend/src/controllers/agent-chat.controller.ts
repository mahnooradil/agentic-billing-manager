/**
 * Agent chat controller — talks to the Claude Managed Agents "Billing Advisor
 * Agent" (Console-created, see AgentSession/managed-agent.service). Separate
 * from the plain /api/ai/chat endpoint: this one keeps conversation state in
 * the Managed Agents session itself, one session per user.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import { sendSuccess } from "@/utils/apiResponse";
import { assertCreditBalance } from "@/utils/credits";
import {
  sendAgentMessage,
  resetAgentSession,
} from "@/services/agent/managed-agent.service";
import type { AgentChatInput } from "@/validators/agent-chat.validator";

/** POST /api/agent/chat */
export const agentChat = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  assertCreditBalance(user);

  const { message } = req.body as AgentChatInput;
  const { reply, action } = await sendAgentMessage(user._id, message);

  sendSuccess(res, 200, "Agent response generated", {
    message: { role: "assistant", content: reply, ...(action ? { action } : {}) },
  });
});

/** DELETE /api/agent/chat — ends the current conversation ("New Chat"). */
export const resetAgentChat = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) {
    throw new AppError("Authentication required", 401);
  }

  await resetAgentSession(user._id);
  sendSuccess(res, 200, "Conversation reset", null);
});
