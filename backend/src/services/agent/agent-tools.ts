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
import { billingSearchTool } from "@/services/ai/tools/billing-search.tool";
import {
  runProposeUpdateBillingStatus,
  runProposeDeleteBillingRecord,
} from "@/services/ai/tools/billing-actions.tool";
import {
  searchSupportedPlatforms,
  getConnectionRequirements,
} from "@/services/integrations/capability-resolver";

/** Executes a custom tool by name, scoped to the calling user. Throws on an
 *  unrecognized tool name. */
export async function executeCustomTool(
  userId: string,
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "get_analytics_summary":
    case "get_platform_summary": {
      const tool = TOOL_REGISTRY.find((t) => t.name === name);
      if (!tool) throw new Error(`Unknown tool: ${name}`);
      return tool.run(userId, input);
    }
    case "search_billing_records":
      return billingSearchTool.run(userId, input);
    case "propose_update_billing_status":
      return runProposeUpdateBillingStatus(userId, input);
    case "propose_delete_billing_record":
      return runProposeDeleteBillingRecord(userId, input);
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
