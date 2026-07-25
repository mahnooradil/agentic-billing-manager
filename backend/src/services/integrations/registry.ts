/**
 * Provider adapter registry (Phase F9.1). The single lookup for provider
 * adapters. Adding a provider = one entry here (+ its adapter file) — the
 * controller, model, routes and UI never change. API-key providers ship with a
 * real `verify`; OAuth providers arrive in F9.2 (adapters gain an `oauth` flow).
 */
import type { ProviderAdapter } from "@/services/integrations/types";
import { openaiAdapter } from "@/services/integrations/adapters/openai.adapter";
import { anthropicAdapter } from "@/services/integrations/adapters/anthropic.adapter";
import { geminiAdapter } from "@/services/integrations/adapters/gemini.adapter";
import { openrouterAdapter } from "@/services/integrations/adapters/openrouter.adapter";

const adapters: Record<string, ProviderAdapter> = {
  [openaiAdapter.platform]: openaiAdapter,
  [anthropicAdapter.platform]: anthropicAdapter,
  [geminiAdapter.platform]: geminiAdapter,
  [openrouterAdapter.platform]: openrouterAdapter,
};

/** The adapter for a platform, or undefined if none is registered. */
export function getAdapter(platform: string): ProviderAdapter | undefined {
  return adapters[platform];
}

/** Case-insensitive adapter lookup (the AI may pass "openai"/"OpenAI"). */
export function findAdapter(platform: string): ProviderAdapter | undefined {
  const key = platform.trim().toLowerCase();
  return Object.values(adapters).find((a) => a.platform.toLowerCase() === key);
}

/** All registered native adapters (Capability Resolver enumerates these). */
export function listAdapters(): ProviderAdapter[] {
  return Object.values(adapters);
}

/** Platform keys that support real API-key verification today. */
export function apiKeyPlatforms(): string[] {
  return Object.values(adapters)
    .filter((a) => a.authType === "api_key" && typeof a.verify === "function")
    .map((a) => a.platform);
}
