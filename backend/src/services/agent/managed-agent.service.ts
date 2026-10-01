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
import { sanitizeForAgentContext } from "@/utils/sanitize-untrusted-text";
import { consumeCredits } from "@/services/credits/credit-ledger.service";
import { tokensToCredits } from "@/config/credits";
import type { ConnectionRequirements } from "@/services/integrations/capability-resolver";
import type {
  ProposeUpdateStatusResult,
  ProposeDeleteResult,
} from "@/services/ai/tools/billing-actions.tool";
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

/** Surfaced when the agent has resolved a "mark as Paid/Pending/Overdue"
 *  request to one exact record — the chat UI renders a confirm button that
 *  calls the existing `PUT /api/billing/:id` itself; the agent never makes
 *  this change directly (see billing-actions.tool.ts). */
export interface UpdateBillingStatusAction {
  type: "update_billing_status";
  billingId: string;
  customerName: string;
  invoiceNumber: string;
  currentStatus: string;
  newStatus: string;
}

/** Same confirm-first pattern as above, for a delete request — the chat UI's
 *  confirm button calls the existing `DELETE /api/billing/:id`. */
export interface DeleteBillingRecordAction {
  type: "delete_billing_record";
  billingId: string;
  customerName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
}

export type AgentAction =
  | ConnectPlatformAction
  | UpdateBillingStatusAction
  | DeleteBillingRecordAction;

export interface AgentReply {
  reply: string;
  action?: AgentAction;
}

/**
 * WP-7 fix — the tool-call loop in `sendAgentMessage` previously had no
 * bound at all: a model that kept calling tools (a genuine bug on
 * Anthropic's side, a confused reasoning loop, or a future tool with a
 * surprising result shape it reacts badly to) could run indefinitely,
 * burning real tokens/credits on a SINGLE user turn with nothing to stop
 * it. Two tiers: at `MAX_TOOL_ITERATIONS_SOFT`, the agent is told (via an
 * error tool result, the same pattern already used to decline an
 * irrelevant tool call) that it's hit the limit and should wrap up with
 * whatever it has — giving it a real chance to produce a normal, useful
 * reply instead of being cut off mid-thought. `MAX_TOOL_ITERATIONS_HARD`
 * is the actual guarantee: if the model ignores that and keeps calling
 * tools anyway, the loop is forced to stop regardless, so there is always
 * a real ceiling no model behavior can exceed.
 */
const MAX_TOOL_ITERATIONS_SOFT = 8;
const MAX_TOOL_ITERATIONS_HARD = 12;

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
 * Returns a live session ID for this (user, organization) pair — reusing
 * the stored one if it's still usable, otherwise creating a fresh session
 * and persisting its ID. See agent-session.model.ts's docstring for why
 * this is scoped by organization, not just user.
 */
async function getOrCreateSessionId(
  userId: Types.ObjectId | string,
  organizationId: Types.ObjectId | string
): Promise<string> {
  const anthropic = getClient();
  const existing = await AgentSession.findOne({ user: userId, organization: organizationId });

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
    title: `Billing Advisor — user ${userId.toString()} — org ${organizationId.toString()}`,
  });

  await AgentSession.findOneAndUpdate(
    { user: userId, organization: organizationId },
    { sessionId: session.id },
    { upsert: true }
  );

  return session.id;
}

/**
 * Ends the user's current agent conversation for ONE organization
 * ("New Chat", or a deliberate fresh start on workspace switch — see
 * auth.controller.ts's `switchOrganization`) — archives the Managed
 * Agents session (tidy cleanup, not required for correctness) and drops
 * the local pointer, so the next message in THIS organization starts a
 * brand-new session. Other organizations' sessions are untouched — each
 * has its own row (see agent-session.model.ts).
 */
export async function resetAgentSession(
  userId: Types.ObjectId | string,
  organizationId: Types.ObjectId | string
): Promise<void> {
  const existing = await AgentSession.findOne({ user: userId, organization: organizationId });
  if (!existing) return;

  try {
    const anthropic = getClient();
    await anthropic.beta.sessions.archive(existing.sessionId);
  } catch {
    // Already gone/archived, or the agent isn't configured — fine either way,
    // the local pointer removal below is what actually matters.
  }

  await AgentSession.deleteOne({ _id: existing._id });
}

/**
 * Ends EVERY one of a user's agent conversations, across every
 * organization — used only by account deletion (auth.controller.ts),
 * where the whole account (and so every organization's conversation with
 * it) is going away, unlike a workspace switch or "New Chat" which only
 * ever touch one organization's session.
 */
export async function resetAllAgentSessionsForUser(userId: Types.ObjectId | string): Promise<void> {
  const sessions = await AgentSession.find({ user: userId });
  if (sessions.length === 0) return;

  const anthropic = getClient();
  await Promise.all(
    sessions.map((s) =>
      anthropic.beta.sessions.archive(s.sessionId).catch(() => {
        // Already gone/archived, or unreachable — the deleteMany below is
        // what actually matters for correctness.
      })
    )
  );

  await AgentSession.deleteMany({ user: userId });
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
  organizationId: Types.ObjectId | string,
  prompt: string
): Promise<string> {
  const anthropic = getClient();
  const session = await anthropic.beta.sessions.create({
    agent: env.anthropicAgentId,
    environment_id: env.anthropicEnvironmentId,
    title: `Recommendation refresh — user ${userId.toString()}`,
  });

  let inputTokens = 0;
  let outputTokens = 0;
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
      } else if (event.type === "span.model_request_end") {
        // Same accounting as a chat turn (see sendAgentMessage below) — a
        // background generation call costs real tokens too, and skipping
        // this tracking would leave it invisible on the workspace's ledger.
        inputTokens += event.model_usage.input_tokens;
        outputTokens += event.model_usage.output_tokens;
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
    // Deduct AFTER the turn (actual cost is only known once it's done),
    // even if the loop above threw — the API call already happened either way.
    void consumeCredits(
      organizationId,
      tokensToCredits(inputTokens, outputTokens),
      "recommendation_generation",
      userId
    );
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
  organizationId: Types.ObjectId | string,
  text: string
): Promise<AgentReply> {
  const anthropic = getClient();
  const sessionId = await getOrCreateSessionId(userId, organizationId);

  const stream = await anthropic.beta.sessions.events.stream(sessionId);
  await anthropic.beta.sessions.events.send(sessionId, {
    events: [{ type: "user.message", content: [{ type: "text", text }] }],
  });

  let reply = "";
  let action: AgentAction | undefined;
  let inputTokens = 0;
  let outputTokens = 0;
  let toolIterations = 0;
  for await (const event of stream) {
    if (event.type === "agent.message") {
      for (const block of event.content) {
        if (block.type === "text") reply += block.text;
      }
    } else if (event.type === "agent.custom_tool_use") {
      toolIterations++;

      // WP-7 — the hard ceiling: stop reading the stream entirely rather
      // than send yet another tool result, regardless of what the model
      // does next. See MAX_TOOL_ITERATIONS_HARD's own docstring.
      if (toolIterations > MAX_TOOL_ITERATIONS_HARD) {
        break;
      }

      // The soft ceiling: tell the model it's out of room, the same
      // decline pattern runAgentPrompt already uses for an irrelevant tool
      // call, so it gets a real chance to produce a normal closing reply
      // instead of just being cut off.
      if (toolIterations > MAX_TOOL_ITERATIONS_SOFT) {
        await anthropic.beta.sessions.events.send(sessionId, {
          events: [
            {
              type: "user.custom_tool_result",
              custom_tool_use_id: event.id,
              content: [
                {
                  type: "text",
                  text: "Tool call limit reached for this turn. Stop calling tools and reply now with whatever you've already found, noting that the answer may be incomplete.",
                },
              ],
              is_error: true,
            },
          ],
        });
        continue;
      }

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
        // Task 9 (S-07) — a second, independent sanitization pass right at
        // the boundary where a tool result actually enters the model's
        // context, on top of ai-invoice-extractor.ts's own ingest-time pass.
        // Catches anything that reaches this point from a path the ingest
        // sanitizer doesn't cover (a future tool, a field it doesn't touch)
        // rather than relying on a single point of defense.
        resultText = JSON.stringify(sanitizeForAgentContext(result));

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
        } else if (
          event.name === "propose_update_billing_status" &&
          result &&
          typeof result === "object" &&
          (result as ProposeUpdateStatusResult).found
        ) {
          const r = result as Required<ProposeUpdateStatusResult>;
          action = {
            type: "update_billing_status",
            billingId: r.billingId,
            customerName: r.customerName,
            invoiceNumber: r.invoiceNumber,
            currentStatus: r.currentStatus,
            newStatus: r.proposedStatus,
          };
        } else if (
          event.name === "propose_delete_billing_record" &&
          result &&
          typeof result === "object" &&
          (result as ProposeDeleteResult).found
        ) {
          const r = result as Required<ProposeDeleteResult>;
          action = {
            type: "delete_billing_record",
            billingId: r.billingId,
            customerName: r.customerName,
            invoiceNumber: r.invoiceNumber,
            amount: r.amount,
            currency: r.currency,
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
    organizationId,
    tokensToCredits(inputTokens, outputTokens),
    "agent_message",
    userId
  );

  if (!reply.trim()) {
    throw new AppError(
      "The AI agent didn't return a response. Please try again.",
      502
    );
  }

  return { reply, action };
}
