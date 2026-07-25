/**
 * Static catalog of supported platforms (Phase F8). The single source of truth
 * for how each platform is presented (label, category, monogram, brand-tinted
 * badge, and its default connection method). Adding a platform later is one
 * entry here plus the matching backend enum — no redesign.
 *
 * Icons render as monograms (the project forbids <img>), with LITERAL Tailwind
 * classes so the JIT scanner keeps them.
 */
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
    badge: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    connectionType: "oauth",
  },
  {
    key: "PayPal",
    label: "PayPal",
    category: "Payments",
    monogram: "P",
    badge: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    connectionType: "oauth",
  },
  {
    key: "Fiverr",
    label: "Fiverr",
    category: "Freelance",
    monogram: "F",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    connectionType: "oauth",
  },
  {
    key: "Upwork",
    label: "Upwork",
    category: "Freelance",
    monogram: "U",
    badge: "bg-green-500/10 text-green-600 dark:text-green-400",
    connectionType: "oauth",
  },
  {
    key: "OpenAI",
    label: "OpenAI",
    category: "AI Providers",
    monogram: "AI",
    badge: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
    connectionType: "api_key",
  },
  {
    key: "Anthropic",
    label: "Anthropic",
    category: "AI Providers",
    monogram: "A",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    connectionType: "api_key",
  },
  {
    key: "Gemini",
    label: "Google Gemini",
    category: "AI Providers",
    monogram: "G",
    badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    connectionType: "api_key",
  },
  {
    key: "OpenRouter",
    label: "OpenRouter",
    category: "AI Providers",
    monogram: "OR",
    badge: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
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
    badge: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    connectionType: connection.connectionType,
  };
}
