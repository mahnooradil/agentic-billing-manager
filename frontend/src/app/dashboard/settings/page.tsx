import type { Metadata } from "next";

import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = { title: "Settings" };

/**
 * Settings page (Phase F7). A server component that keeps `metadata` and renders
 * the client `SettingsView`, which loads and persists every application
 * preference (General, AI, Notifications, Analytics, Automation, Memory,
 * Recommendations, Workspace, Appearance).
 */
export default function SettingsPage() {
  return <SettingsView />;
}
