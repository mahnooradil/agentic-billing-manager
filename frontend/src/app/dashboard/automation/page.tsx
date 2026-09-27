import type { Metadata } from "next";

import { AutomationView } from "@/components/automation/automation-view";

export const metadata: Metadata = { title: "Automation" };

export default function AutomationPage() {
  return <AutomationView />;
}
