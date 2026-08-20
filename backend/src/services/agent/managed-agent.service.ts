/**
 * Claude Managed Agents client — talks to the "Billing Advisor Agent" created
 * in the Anthropic Console. One persisted agent (config lives in the Console,
 * versioned there) + one persisted environment; this service only creates and
 * drives SESSIONS, which is the per-request/per-user data-plane work.
 *
 * One active session per user (see AgentSession) so a conversation continues
 * across turns instead of starting fresh every message.
 */
import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/config/env";
import { AppError } from "@/utils/appError";
import { AgentSession } from "@/models/agent-session.model";
import { executeCustomTool } from "@/services/agent/agent-tools";
import { consumeCredits } from "@/services/credits/credit-ledger.service";
import { tokensToCredits } from "@/config/credits";
import type { ConnectionRequirements } from "@/services/integrations/capability-resolver";
import type { Types } from "mongoose";

/**
 * Surfaced to the frontend when the agent confirms a platform CAN be
 * live-connected — lets the chat UI offer a one-click deep link straight into
 * the real, already-secure Connect flow (Platforms page). Metadata only; the
 * agent never sees or forwards a credential.
 */
export interface ConnectPlatformAction {
  type: "connect_platform";
  platform: string;
  displayName: string;
  source: "native" | "pipedream";
}

export interface AgentReply {
  reply: string;
  action?: ConnectPlatformAction;
}

let client: Anthropic | null = null;

/** Lazily constructs the Anthropic client — never at import time. */
function getClient(): Anthropic {
  if (!env.anthropicApiKey || !env.anthropicAgentId || !env.anthropicEnvironmentId) {
    throw new AppError(
      "The AI agent isn't configured on this server yet. Please try again later.",
      503
    );
  }
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

/**
 * Returns a live session ID for this user — reusing the stored one if it's
 * still usable, otherwise creating a fresh session and persisting its ID.
 */
async function getOrCreateSessionId(userId: Types.ObjectId | string): Promise<string> {
  const anthropic = getClient();
  const existing = await AgentSession.findOne({ user: userId });

  if (existing) {
    try {
      const session = await anthropic.beta.sessions.retrieve(existing.sessionId);
      if (session.status !== "terminated") return existing.sessionId;
    } catch {
      // Session no longer resolvable (deleted, archived environment, etc.) —
      // fall through and create a replacement below.
    }
  }

  const session = await anthropic.beta.sessions.create({
    agent: env.anthropicAgentId,
    environment_id: env.anthropicEnvironmentId,
    title: `Billing Advisor — user ${userId.toString()}`,
  });

  await AgentSession.findOneAndUpdate(
    { user: userId },
    { sessionId: session.id },
    { upsert: true }
  );

  return session.id;
}

/**
 * Ends the user's current agent conversation ("New Chat") — archives the
 * Managed Agents session (tidy cleanup, not required for correctness) and
 * drops the local pointer, so the next message starts a brand-new session
 * with no memory of the old conversation.
 */
export async function resetAgentSession(userId: Types.ObjectId | string): Promise<void> {
  const existing = await AgentSession.findOne({ user: userId });
  if (!existing) return;

  try {
    const anthropic = getClient();
    await anthropic.beta.sessions.archive(existing.sessionId);
  } catch {
    // Already gone/archived, or the agent isn't configured — fine either way,
    // the local pointer removal below is what actually matters.
  }

  await AgentSession.deleteOne({ user: userId });
}

/**
 * Runs ONE prompt through the Billing Advisor Agent on a throwaway session —
 * created fresh and archived immediately after, never touching the user's
 * persisted `AgentSession` (the one their visible chat thread continues on).
 * Used by background/system callers (the recommendation engine) that need the
 * agent's reasoning without leaking generation prompts into that chat history.
 */
export async function runAgentPrompt(
  userId: Types.ObjectId | string,
  prompt: string
): Promise<string> {
  const anthropic = getClient();
  const session = await anthropic.beta.sessions.create({
    agent: env.anthropicAgentId,
    environment_id: env.anthropicEnvironmentId,
    title: `Recommendation refresh — user ${userId.toString()}`,
  });

  try {
    const stream = await anthropic.beta.sessions.events.stream(session.id);
    await anthropic.beta.sessions.events.send(session.id, {
      events: [{ type: "user.message", content: [{ type: "text", text: prompt }] }],
    });

    let reply = "";
    for await (const event of stream) {
      if (event.type === "agent.message") {
        for (const block of event.content) {
          if (block.type === "text") reply += block.text;
        }
      } else if (event.type === "agent.custom_tool_use") {
        // Not relevant to a one-shot generation task — decline so the session
        // can still terminate cleanly instead of waiting on a result forever.
        await anthropic.beta.sessions.events.send(session.id, {
          events: [
            {
              type: "user.custom_tool_result",
              custom_tool_use_id: event.id,
              content: [{ type: "text", text: "Not available for this request." }],
              is_error: true,
            },
          ],
        });
      } else if (event.type === "session.status_terminated") {
        break;
      } else if (event.type === "session.status_idle") {
        if (event.stop_reason?.type !== "requires_action") break;
      } else if (event.type === "session.error") {
        throw new AppError("The AI agent failed to generate a response.", 502);
      }
    }

    if (!reply.trim()) {
      throw new AppError("The AI agent didn't return a response.", 502);
    }
    return reply;
  } finally {
    await anthropic.beta.sessions.archive(session.id).catch(() => {
      // Best-effort cleanup — a stray unarchived session is not fatal.
    });
  }
}

/**
 * Sends one user message to the user's agent session and waits for the
 * agent's reply, returning the concatenated text of its response.
 *
 * Stream-first: the event stream is opened before the message is sent, so no
 * events are missed (see Anthropic's Managed Agents client-patterns guide).
 */
export async function sendAgentMessage(
  userId: Types.ObjectId | string,
  text: string
): Promise<AgentReply> {
  const anthropic = getClient();
  const sessionId = await getOrCreateSessionId(userId);

  const stream = await anthropic.beta.sessions.events.stream(sessionId);
  await anthropic.beta.sessions.events.send(sessionId, {
    events: [{ type: "user.message", content: [{ type: "text", text }] }],
  });

  let reply = "";
  let action: ConnectPlatformAction | undefined;
  let inputTokens = 0;
  let outputTokens = 0;
  for await (const event of stream) {
    if (event.type === "agent.message") {
      for (const block of event.content) {
        if (block.type === "text") reply += block.text;
      }
    } else if (event.type === "agent.custom_tool_use") {
      // A registered read-only/metadata-only tool — run it locally and hand
      // the result straight back so the session can continue.
      let resultText: string;
      let isError = false;
      try {
        const input = (event.input ?? {}) as Record<string, unknown>;
        const result = await executeCustomTool(
          userId.toString(),
          event.name,
          input
        );
        resultText = JSON.stringify(result);

        // The agent confirmed a real, live-connectable platform — surface a
        // deep link the frontend can turn into a one-click "Connect now"
        // button straight into the existing secure Connect flow.
        if (
          event.name === "get_connection_requirements" &&
          result &&
          typeof result === "object" &&
          (result as ConnectionRequirements).supported
        ) {
          const requirements = result as ConnectionRequirements;
          action = {
            type: "connect_platform",
            platform: requirements.platform,
            displayName: (requirements.displayName ?? requirements.platform).trim(),
            source: requirements.source === "pipedream" ? "pipedream" : "native",
          };
        }
      } catch (err) {
        resultText =
          err instanceof Error ? err.message : "Failed to run this tool. Please try again.";
        isError = true;
      }
      await anthropic.beta.sessions.events.send(sessionId, {
        events: [
          {
            type: "user.custom_tool_result",
            custom_tool_use_id: event.id,
            content: [{ type: "text", text: resultText }],
            is_error: isError,
          },
        ],
      });
    } else if (event.type === "span.model_request_end") {
      // A turn can involve multiple model requests (e.g. one per tool round
      // trip) — accumulate across the whole turn, not just the first one.
      inputTokens += event.model_usage.input_tokens;
      outputTokens += event.model_usage.output_tokens;
    } else if (event.type === "session.status_terminated") {
      break;
    } else if (event.type === "session.status_idle") {
      // requires_action after a custom_tool_use just means "waiting on the
      // result we already sent above" — keep reading, don't treat as done.
      if (event.stop_reason?.type !== "requires_action") break;
    } else if (event.type === "session.error") {
      throw new AppError(
        "The AI agent ran into a problem answering that. Please try again.",
        502
      );
    }
  }

  // Deduct AFTER the turn — actual cost is only known once it's done. Never
  // blocks the reply on a ledger failure (see consumeCredits' own guarantee).
  void consumeCredits(
    userId,
    tokensToCredits(inputTokens, outputTokens),
    "agent_message"
  );

  if (!reply.trim()) {
    throw new AppError(
      "The AI agent didn't return a response. Please try again.",
      502
    );
  }

  return { reply, action };
}
