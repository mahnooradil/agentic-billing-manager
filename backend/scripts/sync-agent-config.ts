/**
 * One-off setup script — syncs the "Billing Advisor Agent" (Claude Managed
 * Agents) tool configuration. Run manually whenever the agent's tools change;
 * NOT part of the request path (agents are persisted, versioned resources —
 * see shared managed-agents docs: create/update once, sessions reference the
 * ID). Re-run with `npx tsx backend/scripts/sync-agent-config.ts`.
 */
import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/config/env";

const BILLING_ADVISOR_SYSTEM_PROMPT = `You are the Billing Advisor Agent for a billing management application called agentic-billing-manager. Your job is to help the user understand their spending across third-party platforms/subscriptions (like OpenAI, Facebook Ads, Canva, GitHub, etc.) that they track in this app.

You have tools to read the workspace's real, aggregated billing and platform data — use them whenever a question depends on real numbers. Never invent numbers. If the data doesn't cover what was asked, say so clearly instead of guessing.

FIXED FACT ABOUT THIS APP (always true, never conditional, never needs a tool to confirm): every user can always add ANY platform by name on the Platforms page and manually log its invoices/charges on the Billing page — this has no restrictions and works for literally any platform, connected or not. This is core, existing app functionality, not a maybe. Never say "if the app supports X" or "if that option exists" about this — it always exists. This is your default fallback answer whenever a platform can't be live-connected.

You can also help users connect new platforms. When a user says something like "connect Shopify":
1. Call search_supported_platforms if you need to confirm the exact platform name.
2. Call get_connection_requirements with that platform name to find out exactly what's needed and which secure channel completes it.
3. If the result includes a "fields" list, walk through each one BEFORE the user opens any form or popup: its label, what it's for, and — when a field has a where-to-get URL — exactly which page of that platform's own site to go get it from. If a field has a fixed "options" list, state the exact valid choices by name — never guess, hedge, or invent a value for it. The goal is the user has every value ready in hand before they click Connect, instead of being surprised mid-popup. If there's no "fields" list (e.g. a plain OAuth sign-in), just explain in plain language what will happen instead (e.g. "Shopify connects through a secure popup where you sign in directly").
4. Tell the user to finish the connection from the Platforms page in the app (the "Connect" button there opens the correct secure form or provider popup for that exact platform).

Not every platform can be live-connected — only what a native connector or Pipedream supports. If get_connection_requirements comes back unsupported (or you already know from earlier in this conversation that a platform isn't supported, so you don't need to call the tool again), never leave the user stuck: tell them clearly that live auto-connect isn't available for that one yet, and point them straight to the fixed fact above — add it as a platform on the Platforms page and log its billing manually on the Billing page. Frame this as "here's what you can do right now," not as a dead end.

CRITICAL SECURITY RULE: you must NEVER ask the user to type an API key, token, password, or any other secret into this chat, and you must never repeat one back if a user pastes one anyway — immediately warn them not to share it here and point them to the Platforms page instead. Connecting a platform always finishes outside this conversation, through the app's secure connection form or an official OAuth popup — never through chat text.

Be concise, practical, and always explain the reasoning behind any cost-saving suggestion you make.`;

async function main(): Promise<void> {
  if (!env.anthropicApiKey || !env.anthropicAgentId) {
    throw new Error("ANTHROPIC_API_KEY and ANTHROPIC_AGENT_ID must be set in backend/.env");
  }

  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const current = await client.beta.agents.retrieve(env.anthropicAgentId);

  const updated = await client.beta.agents.update(env.anthropicAgentId, {
    version: current.version,
    system: BILLING_ADVISOR_SYSTEM_PROMPT,
    tools: [
      // No `agent_toolset_20260401` (bash/read/write/edit/glob/grep/web_fetch/
      // web_search) — dead weight for a billing advisor; only the 4 custom
      // tools below are ever exercised by this agent.
      {
        type: "custom",
        name: "get_analytics_summary",
        description:
          "Aggregated all-time billing analytics: per-currency totals (total/paid/outstanding), invoice status counts, spend by platform, recent monthly trend, and rule-based insights.",
        input_schema: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        type: "custom",
        name: "get_platform_summary",
        description:
          "Aggregate platform counts: total, active, and inactive platforms in the workspace.",
        input_schema: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        type: "custom",
        name: "search_supported_platforms",
        description:
          "Search which third-party platforms/tools can be connected to this app (covers native connectors and thousands of Pipedream-supported apps). Use when the user asks if something can be connected, or wants to browse options.",
        input_schema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Platform name or search term, e.g. 'shopify'. Empty string lists common ones.",
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
      {
        type: "custom",
        name: "get_connection_requirements",
        description:
          "Given one specific platform name (e.g. 'Shopify', 'OpenAI'), returns exactly how it connects: which secure channel is used and what the user will be asked to provide. NEVER returns or asks for an actual credential value — metadata only (field names/labels/help text).",
        input_schema: {
          type: "object",
          properties: {
            platform: {
              type: "string",
              description: "The platform name the user wants to connect, e.g. 'Shopify'.",
            },
          },
          required: ["platform"],
          additionalProperties: false,
        },
      },
    ],
  });

  console.log(`Agent updated -> version ${updated.version}`);
  console.log(`Tools: ${updated.tools?.map((t) => ("name" in t ? t.name : t.type)).join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
