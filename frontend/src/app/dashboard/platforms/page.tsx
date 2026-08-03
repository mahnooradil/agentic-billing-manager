import type { Metadata } from "next";

import { PlatformsView } from "@/components/platforms/platforms-view";

export const metadata: Metadata = { title: "Integrations" };

export default function PlatformsPage() {
  return <PlatformsView />;
}
