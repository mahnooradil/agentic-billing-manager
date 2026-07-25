/** OpenRouter adapter (Phase F9.1). Verifies an API key via the key-info endpoint,
 *  which also returns a non-secret label used as the account identifier. */
import type { ProviderAdapter } from "@/services/integrations/types";
import { verifyViaGet } from "@/services/integrations/verify-helpers";

export const openrouterAdapter: ProviderAdapter = {
  platform: "OpenRouter",
  authType: "api_key",
  verify: (credential, deps) =>
    verifyViaGet({
      url: "https://openrouter.ai/api/v1/key",
      headers: { Authorization: `Bearer ${credential}` },
      deps,
      onOk: (data) => {
        const label = (data as { data?: { label?: string } } | null)?.data
          ?.label;
        return typeof label === "string" && label.trim()
          ? { accountIdentifier: label.trim() }
          : undefined;
      },
    }),
  requirements: {
    guidance:
      "OpenRouter connects with a secret API key. You enter it in a secure form; it is verified against OpenRouter, encrypted at rest, and never shown again.",
    fields: [
      {
        name: "apiKey",
        label: "API key",
        type: "password",
        required: true,
        placeholder: "sk-or-…",
        help: "Create a key in your OpenRouter account.",
        helpUrl: "https://openrouter.ai/keys",
      },
    ],
  },
};
