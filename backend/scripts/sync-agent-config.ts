/**
 * One-off setup script — syncs the "Billing Advisor Agent" (Claude Managed
 * Agents) tool configuration. Run manually whenever the agent's tools change;
 * NOT part of the request path (agents are persisted, versioned resources —
 * see shared managed-agents docs: create/update once, sessions reference the
 * ID). Re-run with `npx tsx backend/scripts/sync-agent-config.ts`.
 *
 * WP-7 (CLAUDE.md Sec10.3/flow-04 D9) — this file previously went stale
 * relative to the live Console config: 3 tools (`search_billing_records`,
 * `propose_update_billing_status`, `propose_delete_billing_record`, added
 * 2026-08-26 per CLAUDE.md's phase log) and `get_analytics_summary`'s
 * `from`/`to` date-range parameters existed live but were never reflected
 * here, because those additions were made directly in the Console rather
 * than through this script. Re-synced 2026-10-01 against a live `agents.retrieve()`
 * read (not guessed) so this file is once again an accurate, committed
 * snapshot of what's actually configured — re-run this script any time the
 * Console config changes by hand, or better, make this script the only way
 * the config changes going forward.
 *
 * Also fixes a real, unintentional drift found during that re-sync: the live
 * agent had Anthropic's built-in `agent_toolset_20260401` (bash/read/write/
 * edit/glob/grep/web_fetch/web_search, `always_allow`) ENABLED, despite this
 * script's own original intent (see the comment below) never having included
 * it. `agents.versions.list()` shows why: v9 has no toolset and matches this
 * script's then-payload exactly (produced by an earlier run of this very
 * script), but v10 — the very next version, same 4 tools, no new ones added —
 * has the toolset back. The only explanation is the Console's own edit UI
 * defaulting that bundle back to enabled on a save that didn't deliberately
 * include it, not a considered decision to grant a billing-advisor chatbot
 * bash/file-system/web access in a managed sandbox outside this app's own
 * tool dispatcher. Disabled here, explicitly, by omitting it.
 */
import Anthropic from "@anthropic-ai/sdk";

import { env } from "@/config/env";

const BILLING_ADVISOR_SYSTEM_PROMPT = `You are the Billing Advisor Agent for a billing management application called agentic-billing-manager. Your job is to help the user understand their spending across third-party platforms/subscriptions (like OpenAI, Facebook Ads, Canva, GitHub, etc.) that they track in this app.

You have tools to read the workspace's real, aggregated billing and platform data — use them whenever a question depends on real numbers. Never invent numbers. If the data doesn't cover what was asked, say so clearly instead of guessing.

get_analytics_summary defaults to all-time but accepts optional from/to (YYYY-MM-DD) for a specific window — use these whenever the user asks about a specific period ("last month", "this quarter", "since March", "yesterday"). Resolve relative phrases against the current date yourself.

search_billing_records finds SPECIFIC invoices by customer name, invoice number, and/or status — use it when the user asks about one particular invoice rather than aggregate totals (e.g. "what's the status of invoice #123", "show me Acme Corp's invoices"). If a search returns more than one match and the user's request implies acting on exactly one of them, list the matches (invoice number + customer + amount) and ask which one they mean — never guess.

FIXED FACT ABOUT THIS APP (always true, never conditional, never needs a tool to confirm): every user can always add ANY platform by name on the Platforms page and manually log its invoices/charges on the Billing page — this has no restrictions and works for literally any platform, connected or not. This is core, existing app functionality, not a maybe. Never say "if the app supports X" or "if that option exists" about this — it always exists. This is your default fallback answer whenever a platform can't be live-connected.

You can also help users connect new platforms. When a user says something like "connect Shopify":
1. Call search_supported_platforms if you need to confirm the exact platform name.
2. Call get_connection_requirements with that platform name to find out exactly what's needed and which secure channel completes it.
3. If the result includes a "fields" list, walk through each one BEFORE the user opens any form or popup: its label, what it's for, and — when a field has a where-to-get URL — exactly which page of that platform's own site to go get it from. If a field has a fixed "options" list, state the exact valid choices by name — never guess, hedge, or invent a value for it. The goal is the user has every value ready in hand before they click Connect, instead of being surprised mid-popup. If there's no "fields" list (e.g. a plain OAuth sign-in), just explain in plain language what will happen instead (e.g. "Shopify connects through a secure popup where you sign in directly").
4. Tell the user to finish the connection from the Platforms page in the app (the "Connect" button there opens the correct secure form or provider popup for that exact platform).

Not every platform can be live-connected — only what a native connector or Pipedream supports. If get_connection_requirements comes back unsupported (or you already know from earlier in this conversation that a platform isn't supported, so you don't need to call the tool again), never leave the user stuck: tell them clearly that live auto-connect isn't available for that one yet, and point them straight to the fixed fact above — add it as a platform on the Platforms page and log its billing manually on the Billing page. Frame this as "here's what you can do right now," not as a dead end.

CHANGING OR DELETING A BILLING RECORD — you can help, but you NEVER make the change yourself, and you must be exact about this with the user:
1. First call search_billing_records to find the record the user means. If the search returns more than one plausible match, list them and ask which one — do not guess, and do not proceed to step 2 with an ambiguous match.
2. Once you have exactly ONE record's billingId, call propose_update_billing_status (to mark it Pending/Paid/Overdue) or propose_delete_billing_record (to remove it).
3. These two tools only PREPARE the change and never apply it — the app shows the user a confirm button after your reply, and the change only happens if THEY click it. Always tell the user this explicitly in your reply (e.g. "I've found invoice #123 — click Confirm below to mark it Paid" or "...to delete it"). Never say the change has already been made, and never claim success for it in your own words — the confirm button is the only thing that actually does it.
4. Deletion is permanent — if a user's request is vague about which invoice to delete, always confirm the exact one via search first rather than proposing a deletion you're not sure about.

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
      // Deliberately no `agent_toolset_20260401` (Anthropic's built-in bash/
      // read/write/edit/glob/grep/web_fetch/web_search bundle) — dead weight
      // for a billing advisor, and a real permission-surface risk for a
      // financial-data agent if left `always_allow`. Only the 7 custom tools
      // below are ever exercised by this agent (see agent-tools.ts's
      // dispatcher — it has no case for any built-in toolset action at all).
      {
        type: "custom",
        name: "get_analytics_summary",
        description:
          "Billing analytics for a time window: per-currency totals (total/paid/outstanding), invoice status counts, spend by platform, recent monthly trend, rule-based insights, and top customers by invoice count and by amount — use this for 'which customer has the most invoices/spend' style questions. Defaults to all-time; pass from/to for a specific window (e.g. 'last month', 'this quarter').",
        input_schema: {
          type: "object",
          properties: {
            from: {
              type: "string",
              description: "Start date (YYYY-MM-DD), inclusive. Omit for open-ended.",
            },
            to: {
              type: "string",
              description: "End date (YYYY-MM-DD), inclusive. Omit for open-ended.",
            },
          },
          additionalProperties: false,
        },
      },
      {
        type: "custom",
        name: "get_platform_summary",
        description:
          "Aggregate platform counts (total/active/inactive manually-created billing platforms) AND the user's real connected integrations (e.g. Gmail, GitHub, Stripe) with their display names — use this for 'how many platforms have I connected' style questions.",
        input_schema: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        type: "custom",
        name: "search_billing_records",
        description:
          "Finds specific billing records by customer name, invoice number, and/or status (Pending/Paid/Overdue) — use this for questions about ONE particular invoice, or as the first step before proposing a status change or deletion (get the exact billingId here first). Returns up to `limit` (default 10, max 20) matches, newest first.",
        input_schema: {
          type: "object",
          properties: {
            customerName: {
              type: "string",
              description: "Customer name to search for (partial match, case-insensitive).",
            },
            invoiceNumber: {
              type: "string",
              description: "Invoice number to search for (partial match, case-insensitive).",
            },
            status: {
              type: "string",
              enum: ["Pending", "Paid", "Overdue"],
              description: "Filter by status.",
            },
            limit: {
              type: "number",
              description: "Max results, default 10, max 20.",
            },
          },
          additionalProperties: false,
        },
      },
      {
        type: "custom",
        name: "propose_update_billing_status",
        description:
          "PREPARES marking one billing record's status as Pending/Paid/Overdue — does NOT apply the change itself. Requires the exact billingId from a prior search_billing_records call. The app shows the user a confirm button; only their click actually changes it.",
        input_schema: {
          type: "object",
          properties: {
            billingId: {
              type: "string",
              description: "The exact billingId from search_billing_records.",
            },
            newStatus: {
              type: "string",
              enum: ["Pending", "Paid", "Overdue"],
              description: "The status to propose.",
            },
          },
          required: ["billingId", "newStatus"],
          additionalProperties: false,
        },
      },
      {
        type: "custom",
        name: "propose_delete_billing_record",
        description:
          "PREPARES deleting one billing record — does NOT delete it itself. Requires the exact billingId from a prior search_billing_records call. The app shows the user a confirm button; only their click actually deletes it. Deletion is permanent.",
        input_schema: {
          type: "object",
          properties: {
            billingId: {
              type: "string",
              description: "The exact billingId from search_billing_records.",
            },
          },
          required: ["billingId"],
          additionalProperties: false,
        },
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
