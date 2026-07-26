/**
 * Custom tool dispatcher for the Billing Advisor Agent (Managed Agents).
 *
 * Every tool here is read-only / metadata-only — none of them ever receive,
 * store, or return a credential. Connecting a platform for real still goes
 * through the existing, already-secure Connections panel (Platforms page) —
 * these tools only let the agent explain what's needed and point the user
 * there, never collect the value itself.
 */
import { TOOL_REGISTRY } from "@/services/ai/tools";
import {
  searchSupportedPlatforms,
  getConnectionRequirements,
} from "@/services/integrations/capability-resolver";

/** Executes a custom tool by name. Throws on an unrecognized tool name. */
export async function executeCustomTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "get_analytics_summary":
    case "get_platform_summary": {
      const tool = TOOL_REGISTRY.find((t) => t.name === name);
      if (!tool) throw new Error(`Unknown tool: ${name}`);
      return tool.run();
    }
    case "search_supported_platforms": {
      const query = typeof input.query === "string" ? input.query : "";
      return searchSupportedPlatforms(query);
    }
    case "get_connection_requirements": {
      const platform = typeof input.platform === "string" ? input.platform : "";
      if (!platform) throw new Error("A platform name is required.");
      return getConnectionRequirements(platform);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
