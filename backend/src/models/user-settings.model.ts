/**
 * User settings model — Phase F7.
 *
 * One preferences document per user (`user` ref, unique) holding every
 * configurable, non-secret behavior of the application, grouped by domain
 * (general, notifications, analytics, automation, memory, recommendations,
 * workspace, appearance). The AI PROVIDER configuration (provider, model,
 * encrypted key, temperature, max tokens) lives separately in the AiSettings
 * model — this document intentionally never stores secrets.
 *
 * Design notes:
 *  - Every field carries a schema default, and `DEFAULT_USER_SETTINGS` is the
 *    single source of truth for those defaults. The serializer merges a stored
 *    (possibly partial/older) document over these defaults, so the API always
 *    returns a complete, well-formed settings object.
 *  - Enum tuples are exported as `const` + derived types so validators and
 *    serializers share one source of truth.
 */
import {
  Schema,
  model,
  type HydratedDocument,
  type Model,
  type Types,
} from "mongoose";

// ── Enum tuples (single source of truth for schema + validators + UI) ──
export const DATE_FORMATS = ["ISO", "US", "EU", "LONG"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/** Locale codes used for number/date formatting; labelled by language in the UI.
 *  Persisted for the localization roadmap; not necessarily consumed yet. */
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

// ── Persisted shape ──
export interface IUserSettings {
  user: Types.ObjectId;
  general: {
    currency: string;
    dateFormat: DateFormat;
    timezone: string;
    language: Language;
  };
  notifications: {
    enabled: boolean;
    billingAlerts: boolean;
    recommendationAlerts: boolean;
    usageAlerts: boolean;
    highSpendThreshold: number;
  };
  analytics: {
    defaultRange: SettingsAnalyticsRange;
    trendMonths: number;
    concentrationThreshold: number;
    highCostThreshold: number;
    growthAlertThreshold: number;
  };
  automation: {
    enabled: boolean;
    autoApprove: boolean;
  };
  memory: {
    enabled: boolean;
    maxRecall: number;
    summarizeTrigger: number;
    keepRecent: number;
  };
  recommendations: {
    maxCount: number;
    defaultFocus: RecommendationFocus;
  };
  workspace: {
    displayName: string;
  };
  appearance: {
    theme: Theme;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The default value of every preference. Single source of truth: the schema
 * defaults below reference these, and the serializer merges stored values over
 * this object so responses are always complete.
 */
export const DEFAULT_USER_SETTINGS: Omit<
  IUserSettings,
  "user" | "createdAt" | "updatedAt"
> = {
  general: {
    currency: "USD",
    dateFormat: "ISO",
    timezone: "UTC",
    language: "en-US",
  },
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
  automation: {
    enabled: true,
    autoApprove: false,
  },
  memory: {
    enabled: true,
    maxRecall: 12,
    summarizeTrigger: 24,
    keepRecent: 12,
  },
  recommendations: {
    maxCount: 8,
    defaultFocus: "all",
  },
  workspace: {
    displayName: "",
  },
  appearance: {
    theme: "system",
  },
};

export type UserSettingsDocument = HydratedDocument<IUserSettings>;
type UserSettingsModel = Model<IUserSettings>;

const d = DEFAULT_USER_SETTINGS;

// Subdocuments use `_id: false` — they are value objects, not entities.
const generalSchema = new Schema<IUserSettings["general"]>(
  {
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
      default: d.general.currency,
    },
    dateFormat: { type: String, enum: DATE_FORMATS, default: d.general.dateFormat },
    timezone: {
      type: String,
      trim: true,
      maxlength: 64,
      default: d.general.timezone,
    },
    language: { type: String, enum: LANGUAGES, default: d.general.language },
  },
  { _id: false }
);

const notificationsSchema = new Schema<IUserSettings["notifications"]>(
  {
    enabled: { type: Boolean, default: d.notifications.enabled },
    billingAlerts: { type: Boolean, default: d.notifications.billingAlerts },
    recommendationAlerts: {
      type: Boolean,
      default: d.notifications.recommendationAlerts,
    },
    usageAlerts: { type: Boolean, default: d.notifications.usageAlerts },
    highSpendThreshold: {
      type: Number,
      min: 1,
      max: 100,
      default: d.notifications.highSpendThreshold,
    },
  },
  { _id: false }
);

const analyticsSchema = new Schema<IUserSettings["analytics"]>(
  {
    defaultRange: {
      type: String,
      enum: SETTINGS_ANALYTICS_RANGES,
      default: d.analytics.defaultRange,
    },
    trendMonths: { type: Number, min: 1, max: 36, default: d.analytics.trendMonths },
    concentrationThreshold: {
      type: Number,
      min: 1,
      max: 100,
      default: d.analytics.concentrationThreshold,
    },
    highCostThreshold: {
      type: Number,
      min: 1,
      max: 100,
      default: d.analytics.highCostThreshold,
    },
    growthAlertThreshold: {
      type: Number,
      min: 1,
      max: 100,
      default: d.analytics.growthAlertThreshold,
    },
  },
  { _id: false }
);

const automationSchema = new Schema<IUserSettings["automation"]>(
  {
    enabled: { type: Boolean, default: d.automation.enabled },
    autoApprove: { type: Boolean, default: d.automation.autoApprove },
  },
  { _id: false }
);

const memorySchema = new Schema<IUserSettings["memory"]>(
  {
    enabled: { type: Boolean, default: d.memory.enabled },
    maxRecall: { type: Number, min: 1, max: 100, default: d.memory.maxRecall },
    summarizeTrigger: {
      type: Number,
      min: 2,
      max: 200,
      default: d.memory.summarizeTrigger,
    },
    keepRecent: { type: Number, min: 1, max: 100, default: d.memory.keepRecent },
  },
  { _id: false }
);

const recommendationsSchema = new Schema<IUserSettings["recommendations"]>(
  {
    maxCount: { type: Number, min: 1, max: 20, default: d.recommendations.maxCount },
    defaultFocus: {
      type: String,
      enum: RECOMMENDATION_FOCUSES,
      default: d.recommendations.defaultFocus,
    },
  },
  { _id: false }
);

const workspaceSchema = new Schema<IUserSettings["workspace"]>(
  {
    displayName: {
      type: String,
      trim: true,
      maxlength: 80,
      default: d.workspace.displayName,
    },
  },
  { _id: false }
);

const appearanceSchema = new Schema<IUserSettings["appearance"]>(
  { theme: { type: String, enum: THEMES, default: d.appearance.theme } },
  { _id: false }
);

const userSettingsSchema = new Schema<IUserSettings, UserSettingsModel>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      unique: true, // one settings document per user
    },
    general: { type: generalSchema, default: () => ({}) },
    notifications: { type: notificationsSchema, default: () => ({}) },
    analytics: { type: analyticsSchema, default: () => ({}) },
    automation: { type: automationSchema, default: () => ({}) },
    memory: { type: memorySchema, default: () => ({}) },
    recommendations: { type: recommendationsSchema, default: () => ({}) },
    workspace: { type: workspaceSchema, default: () => ({}) },
    appearance: { type: appearanceSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const UserSettings = model<IUserSettings, UserSettingsModel>(
  "UserSettings",
  userSettingsSchema
);
