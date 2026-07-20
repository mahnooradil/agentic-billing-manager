"use client";

import * as React from "react";
import { Loader2, Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { FormAlert } from "@/components/common/form-alert";
import { PageHeader } from "@/components/common/page-header";
import { PageWrapper } from "@/components/common/page-wrapper";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api/client";
import { sendChatMessage } from "@/services/ai/ai-chat.service";
import type { ChatMessage } from "@/services/types/ai";

/**
 * AI Assistant chat. Messages live in component state only (no persistence).
 * Each send posts the full conversation to the backend, which relays it to the
 * user's configured provider and returns the assistant reply.
 */
export function AiChat() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const endRef = React.useRef<HTMLDivElement>(null);

  // Keep the latest message in view. No state update → effect-safe.
  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setSending(true);

    try {
      const response = await sendChatMessage(nextMessages);
      setMessages((prev) => [...prev, response.data.message]);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to get a response. Please try again."
      );
    } finally {
      setSending(false);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <PageWrapper>
      <PageHeader
        title="AI Assistant"
        description="Ask questions and get insights about your billing and usage."
      />

      <Card className="flex flex-1 flex-col p-0">
        <div className="flex max-h-[60vh] min-h-80 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
          {isEmpty && !sending ? (
            <div className="m-auto">
              <EmptyState
                icon={Sparkles}
                title="Start a conversation"
                description="Ask the assistant anything to get started."
              />
            </div>
          ) : (
            <>
              {messages.map((message, index) => (
                <div
                  key={`${index}-${message.role}`}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              {sending ? (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Thinking…
                  </div>
                </div>
              ) : null}
            </>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t p-4">
          {error ? (
            <FormAlert variant="error" message={error} className="mb-3" />
          ) : null}
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Type your message…"
              disabled={sending}
              aria-label="Message"
            />
            <Button type="submit" disabled={sending || !input.trim()}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              Send
            </Button>
          </form>
        </div>
      </Card>
    </PageWrapper>
  );
}
