/**
 * Static, app-wide metadata used across the UI (branding, titles, footer).
 * No secrets, no environment access — pure presentation constants.
 */
export const siteConfig = {
  name: "Billing Manager",
  shortName: "BM",
  description:
    "Agentic AI-Based Intelligent Billing Manager — unified billing, usage, and AI insights.",
  version: "0.1.0",
} as const;
