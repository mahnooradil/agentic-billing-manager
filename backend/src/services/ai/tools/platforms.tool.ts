/**
 * Platform summary tool — Phase 11, enriched 2026-08-20 with real connected
 * integrations (per the user's explicit request that the Billing Advisor
 * Agent know their actual connection/invoice details, not just counts).
 *
 * Read-only agent tool covering TWO distinct concepts this app has:
 *  - `Platform` — a manually-created billing category a `Billing` record can
 *    attach to (Platforms page's "Your platforms").
 *  - `PlatformConnection` — a real connected account (Gmail, GitHub, Stripe,
 *    etc. via Pipedream or a native adapter; "Connected platforms"/
 *    Integrations). This is almost always what a user means by "how many
 *    platforms have I connected."
 */
import { Platform } from "@/models/platform.model";
import { PlatformConnection } from "@/models/platform-connection.model";
import { getOrganizationIdForUser } from "@/services/organizations/membership-lookup.service";
import type { AssistantTool } from "@/services/ai/tools/types";

export interface PlatformSummary {
  totalPlatforms: number;
  activePlatforms: number;
  inactivePlatforms: number;
  /** Real connected accounts (status: "connected") — Gmail, GitHub, Stripe, etc. */
  connectedIntegrationsCount: number;
  /** Display names of every connected integration, e.g. ["Gmail", "GitHub"]. */
  connectedIntegrationNames: string[];
  /** Embedded directly in the tool result (not just this file's comments) so
   *  the model reads the disambiguation regardless of how its own system
   *  prompt phrases "platform" — observed live that without this, a question
   *  like "how many platforms have I connected" got answered from
   *  `totalPlatforms` (wrong) instead of `connectedIntegrationsCount` (right). */
  note: string;
}

const DISAMBIGUATION_NOTE =
  "'connectedIntegrationsCount'/'connectedIntegrationNames' = real connected accounts (Gmail, GitHub, Stripe, etc. via Pipedream or native OAuth/API-key) — this is what the user means by 'platforms I've connected' or 'integrations'. 'totalPlatforms'/'activePlatforms'/'inactivePlatforms' are a SEPARATE concept: manually-created billing categories a Billing record can attach to — do NOT use these to answer a 'connected' question.";

async function runPlatformSummary(userId: string): Promise<PlatformSummary> {
  const organizationId = await getOrganizationIdForUser(userId);
  if (!organizationId) {
    return {
      totalPlatforms: 0,
      activePlatforms: 0,
      inactivePlatforms: 0,
      connectedIntegrationsCount: 0,
      connectedIntegrationNames: [],
      note: DISAMBIGUATION_NOTE,
    };
  }

  const [totalPlatforms, activePlatforms, inactivePlatforms, connections] = await Promise.all([
    Platform.countDocuments({ organization: organizationId }),
    Platform.countDocuments({ organization: organizationId, status: "Active" }),
    Platform.countDocuments({ organization: organizationId, status: "Inactive" }),
    PlatformConnection.find({ organization: organizationId, status: "connected" }).select(
      "displayName"
    ),
  ]);
  return {
    totalPlatforms,
    activePlatforms,
    inactivePlatforms,
    connectedIntegrationsCount: connections.length,
    connectedIntegrationNames: connections.map((c) => c.displayName),
    note: DISAMBIGUATION_NOTE,
  };
}

export const platformSummaryTool: AssistantTool<PlatformSummary> = {
  name: "get_platform_summary",
  description:
    "Aggregate platform counts (total/active/inactive manually-created billing platforms) AND the user's real connected integrations (e.g. Gmail, GitHub, Stripe) with their display names — use this for 'how many platforms have I connected' style questions.",
  run: runPlatformSummary,
};
