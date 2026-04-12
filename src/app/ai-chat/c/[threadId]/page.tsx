"use client";

import { use } from "react";
import AIChatView from "@/components/AIChatView";

interface PageProps {
  params: Promise<{ threadId: string }>;
}

export default function ChatThreadPage({ params }: PageProps) {
  const { threadId } = use(params);
  return <AIChatView key={threadId} threadId={threadId} />;
}
