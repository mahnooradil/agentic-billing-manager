/**
 * Analytics service — typed wrapper over the backend analytics endpoint. Goes
 * through the shared authenticated `api` client (Bearer token + central 401
 * handling), so there is no duplicated fetch logic here.
 */
import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type {
  AnalyticsOverviewData,
  AnalyticsRange,
} from "@/services/types/analytics";

/** GET /analytics/overview?range=… */
export function getAnalyticsOverview(
  range: AnalyticsRange
): Promise<ApiSuccess<AnalyticsOverviewData>> {
  return api.get<ApiSuccess<AnalyticsOverviewData>>(
    `/analytics/overview?range=${encodeURIComponent(range)}`
  );
}
