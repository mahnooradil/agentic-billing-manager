import type { Metadata } from "next";
import { Boxes } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";

export const metadata: Metadata = { title: "Platforms" };

export default function PlatformsPage() {
  return (
    <PageWrapper>
      <PageHeader
        title="Platforms"
        description="Connect and manage the platforms you are billed on."
      />
      <EmptyState
        icon={Boxes}
        title="No platforms connected"
        description="Platform connections will be available in an upcoming phase."
      />
    </PageWrapper>
  );
}
