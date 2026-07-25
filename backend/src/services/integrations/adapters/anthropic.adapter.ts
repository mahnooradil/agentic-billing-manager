/** Anthropic adapter (Phase F9.1). Verifies an API key via the Models endpoint. */
import type { ProviderAdapter } from "@/services/integrations/types";
import { verifyViaGet } from "@/services/integrations/verify-helpers";

export const anthropicAdapter: ProviderAdapter = {
  platform: "Anthropic",
  authType: "api_key",
  verify: (credential, deps) =>
    verifyViaGet({
      url: "https://api.anthropic.com/v1/models",
      headers: {
        "x-api-key": credential,
        "anthropic-version": "2023-06-01",
      },
      deps,
    }),
  requirements: {
    guidance:
      "Anthropic (Claude) connects with a secret API key. You enter it in a secure form; it is verified against Anthropic, encrypted at rest, and never shown again.",
    fields: [
      {
        name: "apiKey",
        label: "API key",
        type: "password",
        required: true,
        placeholder: "sk-ant-…",
        help: "Create a key in the Anthropic Console.",
        helpUrl: "https://console.anthropic.com/settings/keys",
      },
    ],
  },
};
