/**
 * Agent tool contract — Phase 11 (first read-only tool layer).
 *
 * A "tool" is a named, self-describing, read-only function that returns
 * aggregated (PII-free) data about the workspace. In this phase the tools are
 * run deterministically to ground the AI chat. The SAME interface is what a
 * future LangGraph agent's Tool-Calling node will iterate over and invoke by
 * name — so the abstraction is built once here and reused later.
 */
export interface AssistantTool<TResult = unknown> {
  /** Stable identifier a future agent will call the tool by. */
  name: string;
  /** Human/LLM-readable description of what the tool returns. */
  description: string;
  /** Executes the tool and returns aggregated, PII-free data for ONE
   *  organization — WP-7's org-id consolidation (flow/04 §8): the caller
   *  (managed-agent.service.ts) already resolved `organizationId` once per
   *  chat turn from the live request, so every tool invoked during that
   *  turn uses that SAME value, instead of each tool independently
   *  re-deriving it from a bare userId via `getOrganizationIdForUser` (which
   *  reads `User.activeOrganizationId` fresh each time — a real, if
   *  previously theoretical, risk if the user switches workspaces mid-turn).
   *  `input` carries the tool's own call arguments (e.g. a custom date
   *  range) — optional so tools with no parameters are unaffected. */
  run: (organizationId: string, input?: Record<string, unknown>) => Promise<TResult>;
}
