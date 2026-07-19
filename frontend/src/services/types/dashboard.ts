/**
 * Dashboard domain types shared between the service layer and the UI.
 * These mirror the backend's `/dashboard/stats` response contract.
 */
export interface DashboardStats {
  totalPlatforms: number;
  activePlatforms: number;
  inactivePlatforms: number;
}

/** Response `data` shape returned by the dashboard stats endpoint. */
export interface DashboardStatsData {
  stats: DashboardStats;
}
