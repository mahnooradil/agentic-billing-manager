/**
 * Read-only agent tool registry — Phase 11.
 *
 * The registry is the single list of tools the assistant can draw on. In this
 * phase every tool is run deterministically to build a compact grounding context
 * for the chat (always-on, all-time aggregates). A future LangGraph agent will
 * instead let the MODEL choose which registered tool to call — the registry and
 * the `AssistantTool` contract are designed for exactly that evolution.
 */
import { analyticsSummaryTool } from "@/services/ai/tools/analytics.tool";
import { platformSummaryTool } from "@/services/ai/tools/platforms.tool";
import type { AssistantTool } from "@/services/ai/tools/types";

export type { AssistantTool } from "@/services/ai/tools/types";

/** All read-only tools available to the assistant. */
export const TOOL_REGISTRY: AssistantTool[] = [
  analyticsSummaryTool,
  platformSummaryTool,
];

/**
 * Runs every tool and assembles a compact, PII-free system instruction that
 * grounds the chat in the workspace's real (aggregated) billing data. Tools run
 * in parallel; a single tool failure degrades that section to null rather than
 * failing the whole context.
 */
export async function buildAssistantContext(): Promise<string> {
  const entries = await Promise.all(
    TOOL_REGISTRY.map(async (tool) => {
      try {
        return [tool.name, await tool.run()] as const;
      } catch {
        return [tool.name, null] as const;
      }
    })
  );

  const data = Object.fromEntries(entries);
  const snapshot = JSON.stringify(data, null, 2);

  return [
    "You are the AI billing assistant for a billing management application.",
    "Answer the user's questions using ONLY the aggregated billing data provided below.",
    "All figures are already aggregated (per-currency; no personal, customer, or invoice-level data is available to you).",
    "If the user asks for something not present here (a specific customer, invoice, or note), briefly explain that you only have aggregated data.",
    "Never invent numbers that are not in the data. Be concise and helpful.",
    "",
    "Workspace billing data (aggregated, all-time):",
    snapshot,
  ].join("\n");
}
