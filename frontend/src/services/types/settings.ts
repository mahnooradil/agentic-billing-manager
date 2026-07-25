/**
 * User settings (preferences) types — mirror the backend `/settings` contract
 * (Phase F7). The AI PROVIDER config (provider/model/key/temperature/maxTokens)
 * is a separate concern and lives in `types/ai.ts`; this file is the non-secret
 * application preferences.
 */
export const DATE_FORMATS = ["ISO", "US", "EU", "LONG"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const LANGUAGES = [
  "en-US",
  "en-GB",
  "es-ES",
  "fr-FR",
  "de-DE",
  "ar-SA",
  "ur-PK",
] as const;
export type Language = (typeof LANGUAGES)[number];

export const SETTINGS_ANALYTICS_RANGES = ["all", "3m", "6m", "12m"] as const;
export type SettingsAnalyticsRange = (typeof SETTINGS_ANALYTICS_RANGES)[number];

export const RECOMMENDATION_FOCUSES = ["all", "overdue", "spend"] as const;
export type RecommendationFocus = (typeof RECOMMENDATION_FOCUSES)[number];

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

export interface GeneralSettings {
  currency: string;
  dateFormat: DateFormat;
  timezone: string;
  language: Language;
}

export interface NotificationSettings {
  enabled: boolean;
  billingAlerts: boolean;
  recommendationAlerts: boolean;
  usageAlerts: boolean;
  highSpendThreshold: number;
}

export interface AnalyticsSettings {
  defaultRange: SettingsAnalyticsRange;
  trendMonths: number;
  concentrationThreshold: number;
  highCostThreshold: number;
  growthAlertThreshold: number;
}

export interface AutomationSettings {
  enabled: boolean;
  autoApprove: boolean;
}

export interface MemorySettings {
  enabled: boolean;
  maxRecall: number;
  summarizeTrigger: number;
  keepRecent: number;
}

export interface RecommendationSettings {
  maxCount: number;
  defaultFocus: RecommendationFocus;
}

export interface WorkspaceSettings {
  displayName: string;
}

export interface AppearanceSettings {
  theme: Theme;
}

export interface UserSettings {
  general: GeneralSettings;
  notifications: NotificationSettings;
  analytics: AnalyticsSettings;
  automation: AutomationSettings;
  memory: MemorySettings;
  recommendations: RecommendationSettings;
  workspace: WorkspaceSettings;
  appearance: AppearanceSettings;
}

/** The wire object also carries id + timestamps (null before first save). */
export interface UserSettingsResource extends UserSettings {
  id: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Any subset of settings may be sent; the backend deep-merges. */
export type UpdateUserSettingsPayload = {
  [K in keyof UserSettings]?: Partial<UserSettings[K]>;
};

/** Response `data` shape for the settings endpoints. */
export interface UserSettingsData {
  settings: UserSettingsResource;
}

/** Strips the id/timestamp metadata, leaving just the settings groups. */
export function toUserSettings(resource: UserSettingsResource): UserSettings {
  return {
    general: resource.general,
    notifications: resource.notifications,
    analytics: resource.analytics,
    automation: resource.automation,
    memory: resource.memory,
    recommendations: resource.recommendations,
    workspace: resource.workspace,
    appearance: resource.appearance,
  };
}

/** Client-side defaults, mirroring the backend `DEFAULT_USER_SETTINGS`. Used so
 *  the preferences store / formatters have sensible values before load. */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  general: { currency: "USD", dateFormat: "ISO", timezone: "UTC", language: "en-US" },
  notifications: {
    enabled: true,
    billingAlerts: true,
    recommendationAlerts: true,
    usageAlerts: true,
    highSpendThreshold: 60,
  },
  analytics: {
    defaultRange: "all",
    trendMonths: 12,
    concentrationThreshold: 40,
    highCostThreshold: 25,
    growthAlertThreshold: 20,
  },
  automation: { enabled: true, autoApprove: false },
  memory: { enabled: true, maxRecall: 12, summarizeTrigger: 24, keepRecent: 12 },
  recommendations: { maxCount: 8, defaultFocus: "all" },
  workspace: { displayName: "" },
  appearance: { theme: "system" },
};
