/**
 * User settings model — Phase F7 (pruned).
 *
 * One preferences document per user (`user` ref, unique) holding every
 * configurable, non-secret behavior of the application, grouped by domain
 * (general, notifications, appearance). Earlier fields (analytics thresholds,
 * automation, AI memory, recommendation tuning, workspace display name) were
 * removed — none of them were ever read by any backend logic; they were
 * placeholder scaffolding, not real settings a user should be asked to tune.
 * Profile identity (full name) now lives on the User model itself, edited via
 * `PATCH /api/auth/profile` — not here.
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

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

/** Where the app lands right after login. */
export const LANDING_PAGES = ["overview", "billing", "usage"] as const;
export type LandingPage = (typeof LANDING_PAGES)[number];

// ── Persisted shape ──
export interface IUserSettings {
  user: Types.ObjectId;
  general: {
    currency: string;
    dateFormat: DateFormat;
    timezone: string;
    language: Language;
    defaultLandingPage: LandingPage;
  };
  notifications: {
    enabled: boolean;
    billingAlerts: boolean;
    recommendationAlerts: boolean;
    usageAlerts: boolean;
    highSpendThreshold: number;
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
    defaultLandingPage: "overview",
  },
  notifications: {
    enabled: true,
    billingAlerts: true,
    recommendationAlerts: true,
    usageAlerts: true,
    highSpendThreshold: 60,
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
    defaultLandingPage: {
      type: String,
      enum: LANDING_PAGES,
      default: d.general.defaultLandingPage,
    },
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
