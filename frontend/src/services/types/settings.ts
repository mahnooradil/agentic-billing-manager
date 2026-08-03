/**
 * User settings (preferences) types — mirror the backend `/settings` contract.
 * Only real, wired preferences live here (general formatting, notification
 * toggles, appearance). Profile identity (full name) is a separate concern —
 * see `services/types/auth.ts` + `PATCH /api/auth/profile`.
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

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

/** Where the app lands right after login. */
export const LANDING_PAGES = ["overview", "billing", "usage"] as const;
export type LandingPage = (typeof LANDING_PAGES)[number];

export const LANDING_PAGE_PATHS: Record<LandingPage, string> = {
  overview: "/dashboard/overview",
  billing: "/dashboard/billing",
  usage: "/dashboard/usage",
};

export interface GeneralSettings {
  currency: string;
  dateFormat: DateFormat;
  timezone: string;
  language: Language;
  defaultLandingPage: LandingPage;
}

export interface NotificationSettings {
  enabled: boolean;
  billingAlerts: boolean;
  recommendationAlerts: boolean;
  usageAlerts: boolean;
  highSpendThreshold: number;
}

export interface AppearanceSettings {
  theme: Theme;
}

export interface UserSettings {
  general: GeneralSettings;
  notifications: NotificationSettings;
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
    appearance: resource.appearance,
  };
}

/** Client-side defaults, mirroring the backend `DEFAULT_USER_SETTINGS`. Used so
 *  the preferences store / formatters have sensible values before load. */
export const DEFAULT_USER_SETTINGS: UserSettings = {
  general: {
    currency: "USD",
    dateFormat: "ISO",
    timezone: "UTC",
    language: "en-US",
    defaultLandingPage: "overview",
  },
  notifications: {
    enabled: true,
    billingAlerts: true,
    recommendationAlerts: true,
    usageAlerts: true,
    highSpendThreshold: 60,
  },
  appearance: { theme: "system" },
};
