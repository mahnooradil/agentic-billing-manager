import type { Metadata } from "next";

import { BillingView } from "@/components/billing/billing-view";

export const metadata: Metadata = { title: "Invoices" };

export default function BillingPage() {
  return <BillingView />;
}
