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
  /** Executes the tool and returns aggregated, PII-free data for ONE user.
   *  `input` carries the tool's own call arguments (e.g. a custom date
   *  range) — optional so tools with no parameters are unaffected. */
  run: (userId: string, input?: Record<string, unknown>) => Promise<TResult>;
}
