/**
 * Platform summary tool — Phase 11.
 *
 * Read-only agent tool returning aggregate platform counts (no names or details
 * beyond counts). Mirrors the dashboard stats query.
 */
import { Platform } from "@/models/platform.model";
import type { AssistantTool } from "@/services/ai/tools/types";

export interface PlatformSummary {
  totalPlatforms: number;
  activePlatforms: number;
  inactivePlatforms: number;
}

async function runPlatformSummary(): Promise<PlatformSummary> {
  const [totalPlatforms, activePlatforms, inactivePlatforms] = await Promise.all([
    Platform.countDocuments(),
    Platform.countDocuments({ status: "Active" }),
    Platform.countDocuments({ status: "Inactive" }),
  ]);
  return { totalPlatforms, activePlatforms, inactivePlatforms };
}

export const platformSummaryTool: AssistantTool<PlatformSummary> = {
  name: "get_platform_summary",
  description:
    "Aggregate platform counts: total, active, and inactive platforms in the workspace.",
  run: runPlatformSummary,
};
