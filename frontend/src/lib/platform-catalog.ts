/**
 * Static catalog of supported platforms (Phase F8). The single source of truth
 * for how each platform is presented (label, category, monogram, badge, and
 * its default connection method). Adding a platform later is one entry here
 * plus the matching backend enum — no redesign.
 *
 * Icons render as monograms (the project forbids <img>). Every platform
 * shares the SAME neutral badge treatment (`MONOGRAM_BADGE` below) rather
 * than a distinct brand hue per platform — the black/white/one-accent
 * redesign intentionally drops the rainbow-of-8-hues per-brand tinting that
 * used to live on each catalog entry.
 */

/** One shared, neutral badge style for every platform monogram — no
 *  per-brand color. */
export const MONOGRAM_BADGE = "bg-secondary text-secondary-foreground";
import type {
  ConnectionPlatform,
  ConnectionType,
  PlatformConnection,
} from "@/services/types/platform-connections";

export type PlatformCategory =
  | "Payments"
  | "Freelance"
  | "AI Providers"
  | "Custom"
  | "Integration";

/** Presentation used by a connection card — built-in (catalog) or custom (derived). */
export interface CardMeta {
  key: string;
  label: string;
  category: PlatformCategory;
  monogram: string;
  /** Literal Tailwind classes for the monogram badge. */
  badge: string;
  connectionType: ConnectionType;
}

export interface PlatformMeta extends CardMeta {
  key: ConnectionPlatform;
  category: Exclude<PlatformCategory, "Custom">;
}

export const PLATFORM_CATALOG: PlatformMeta[] = [
  {
    key: "Stripe",
    label: "Stripe",
    category: "Payments",
    monogram: "S",
    badge: MONOGRAM_BADGE,
    connectionType: "oauth",
  },
  {
    key: "PayPal",
    label: "PayPal",
    category: "Payments",
    monogram: "P",
    badge: MONOGRAM_BADGE,
    connectionType: "oauth",
  },
  {
    key: "Fiverr",
    label: "Fiverr",
    category: "Freelance",
    monogram: "F",
    badge: MONOGRAM_BADGE,
    connectionType: "oauth",
  },
  {
    key: "Upwork",
    label: "Upwork",
    category: "Freelance",
    monogram: "U",
    badge: MONOGRAM_BADGE,
    connectionType: "oauth",
  },
  {
    key: "OpenAI",
    label: "OpenAI",
    category: "AI Providers",
    monogram: "AI",
    badge: MONOGRAM_BADGE,
    connectionType: "api_key",
  },
  {
    key: "Anthropic",
    label: "Anthropic",
    category: "AI Providers",
    monogram: "A",
    badge: MONOGRAM_BADGE,
    connectionType: "api_key",
  },
  {
    key: "Gemini",
    label: "Google Gemini",
    category: "AI Providers",
    monogram: "G",
    badge: MONOGRAM_BADGE,
    connectionType: "api_key",
  },
  {
    key: "OpenRouter",
    label: "OpenRouter",
    category: "AI Providers",
    monogram: "OR",
    badge: MONOGRAM_BADGE,
    connectionType: "api_key",
  },
];

export const PLATFORM_BY_KEY: Record<ConnectionPlatform, PlatformMeta> =
  PLATFORM_CATALOG.reduce(
    (acc, meta) => {
      acc[meta.key] = meta;
      return acc;
    },
    {} as Record<ConnectionPlatform, PlatformMeta>
  );

export const PLATFORM_CATEGORIES: PlatformCategory[] = [
  "Payments",
  "Freelance",
  "AI Providers",
];

/** Human label for a connection type. */
export const CONNECTION_TYPE_LABEL: Record<ConnectionType, string> = {
  oauth: "OAuth",
  api_key: "API Key",
  manual: "Manual",
};

/** Derives up to two initials from a name for the custom-platform monogram. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.map((p) => p[0]).join("");
  return (letters || name.trim()).slice(0, 2).toUpperCase() || "?";
}

/** Card presentation for a Pipedream-connected integration (no catalog entry). */
export function integrationCardMeta(connection: PlatformConnection): CardMeta {
  return {
    key: connection.platform,
    label: connection.displayName || connection.platform,
    category: "Integration",
    monogram: initialsOf(connection.displayName || connection.platform),
    badge: MONOGRAM_BADGE,
    connectionType: connection.connectionType,
  };
}
