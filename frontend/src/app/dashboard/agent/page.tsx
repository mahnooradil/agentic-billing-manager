import type { Metadata } from "next";

import { AgentView } from "@/components/agent/agent-view";

export const metadata: Metadata = { title: "Billing Agent" };

export default function BillingAgentPage() {
  return <AgentView />;
}
