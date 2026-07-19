/**
 * Dashboard service — typed wrapper over the backend statistics endpoint. Goes
 * through the shared authenticated `api` client (Bearer token + central 401
 * handling), so there is no duplicated fetch logic here.
 */
import { api } from "@/services/api/client";
import type { ApiSuccess } from "@/services/types/api";
import type { DashboardStatsData } from "@/services/types/dashboard";

/** GET /dashboard/stats */
export function getDashboardStats(): Promise<ApiSuccess<DashboardStatsData>> {
  return api.get<ApiSuccess<DashboardStatsData>>("/dashboard/stats");
}
