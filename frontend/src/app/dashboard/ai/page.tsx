import type { Metadata } from "next";

import { AiChat } from "@/components/ai/ai-chat";

export const metadata: Metadata = { title: "AI Assistant" };

export default function AiAssistantPage() {
  return <AiChat />;
}
