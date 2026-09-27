/**
 * Read-only agent tool registry.
 *
 * The registry is the single list of tools the Billing Advisor Agent (Claude
 * Managed Agents) can call by name — `services/agent/agent-tools.ts` dispatches
 * an incoming `agent.custom_tool_use` event to whichever entry here matches
 * `event.name`. The tool's actual input schema (what parameters the model is
 * told it can pass) is registered against the persisted Agent in the Anthropic
 * Console, not here — this file only supplies the runtime that answers a call
 * once made.
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
