/**
 * Analytics service — typed wrapper over the backend analytics endpoint. Goes
 * through the shared authenticated `api` client (Bearer token + central 401
 * handling), so there is no duplicated fetch logic here.
 */
import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type {
  AdvancedAnalyticsData,
  AnalyticsOverviewData,
  AnalyticsRange,
  CustomAnalyticsRange,
} from "@/services/types/analytics";

/** Builds the `range` (+ `from`/`to` when custom) query string shared by
 *  both endpoints below. */
function rangeQuery(range: AnalyticsRange, custom?: CustomAnalyticsRange): string {
  const params = new URLSearchParams({ range });
  if (range === "custom") {
    if (custom?.from) params.set("from", custom.from);
    if (custom?.to) params.set("to", custom.to);
  }
  return params.toString();
}

/** GET /analytics/overview?range=… (custom adds &from=&to=) */
export function getAnalyticsOverview(
  range: AnalyticsRange,
  custom?: CustomAnalyticsRange
): Promise<ApiSuccess<AnalyticsOverviewData>> {
  return api.get<ApiSuccess<AnalyticsOverviewData>>(
    `/analytics/overview?${rangeQuery(range, custom)}`
  );
}

/** GET /analytics/advanced?range=… (F6 billing intelligence; custom adds &from=&to=) */
export function getAdvancedAnalytics(
  range: AnalyticsRange,
  custom?: CustomAnalyticsRange
): Promise<ApiSuccess<AdvancedAnalyticsData>> {
  return api.get<ApiSuccess<AdvancedAnalyticsData>>(
    `/analytics/advanced?${rangeQuery(range, custom)}`
  );
}
