import type { Metadata } from "next";

import { AgentView } from "@/components/agent/agent-view";

export const metadata: Metadata = { title: "AI Assistant" };

export default function BillingAgentPage() {
  return <AgentView />;
}
