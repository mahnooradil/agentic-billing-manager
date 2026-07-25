/** OpenAI adapter (Phase F9.1). Verifies an API key via the Models endpoint. */
import type { ProviderAdapter } from "@/services/integrations/types";
import { verifyViaGet } from "@/services/integrations/verify-helpers";

export const openaiAdapter: ProviderAdapter = {
  platform: "OpenAI",
  authType: "api_key",
  verify: (credential, deps) =>
    verifyViaGet({
      url: "https://api.openai.com/v1/models",
      headers: { Authorization: `Bearer ${credential}` },
      deps,
    }),
  requirements: {
    guidance:
      "OpenAI connects with a secret API key. You enter it in a secure form; it is verified against OpenAI, encrypted at rest, and never shown again.",
    fields: [
      {
        name: "apiKey",
        label: "API key",
        type: "password",
        required: true,
        placeholder: "sk-…",
        help: "Create a secret key in the OpenAI dashboard.",
        helpUrl: "https://platform.openai.com/api-keys",
      },
    ],
  },
};
