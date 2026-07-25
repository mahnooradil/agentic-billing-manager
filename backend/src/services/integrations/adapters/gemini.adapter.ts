/** Google Gemini adapter (Phase F9.1). Verifies an API key via the Models list. */
import type { ProviderAdapter } from "@/services/integrations/types";
import { verifyViaGet } from "@/services/integrations/verify-helpers";

export const geminiAdapter: ProviderAdapter = {
  platform: "Gemini",
  authType: "api_key",
  verify: (credential, deps) =>
    verifyViaGet({
      url: "https://generativelanguage.googleapis.com/v1beta/models",
      headers: { "x-goog-api-key": credential },
      deps,
    }),
  requirements: {
    guidance:
      "Google Gemini connects with a secret API key from Google AI Studio. You enter it in a secure form; it is verified against Google, encrypted at rest, and never shown again.",
    fields: [
      {
        name: "apiKey",
        label: "API key",
        type: "password",
        required: true,
        placeholder: "AIza… / AQ.…",
        help: "Create a key in Google AI Studio.",
        helpUrl: "https://aistudio.google.com/apikey",
      },
    ],
  },
};
