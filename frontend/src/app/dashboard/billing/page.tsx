import type { Metadata } from "next";
import { CreditCard } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="Billing"
        description="Invoices, payment methods, and billing history."
      />
      <EmptyState
        icon={CreditCard}
        title="No billing data yet"
        description="Invoices and billing details will appear here in an upcoming phase."
      />
    </PageWrapper>
  );
}
