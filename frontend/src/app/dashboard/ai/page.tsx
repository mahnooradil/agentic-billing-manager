import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";

export const metadata: Metadata = { title: "AI Assistant" };

export default function AiAssistantPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="AI Assistant"
        description="Ask questions and get insights about your billing and usage."
      />
      <EmptyState
        icon={Sparkles}
        title="AI assistant coming soon"
        description="The AI assistant will be available in a later phase."
      />
    </PageWrapper>
  );
}
