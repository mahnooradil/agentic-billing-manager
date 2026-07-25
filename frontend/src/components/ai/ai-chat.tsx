"use client";

import * as React from "react";
import {
  Loader2,
  MessageSquarePlus,
  Mic,
  Send,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";

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
import { chatStore } from "@/services/ai/chat-store";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis";
import type { ChatMessage } from "@/services/types/ai";

/** One-tap starter questions shown in the empty state (Phase 11). */
const SUGGESTED_PROMPTS = [
  "What's my total spend?",
  "How many overdue invoices do I have?",
  "Which platform costs the most?",
  "Summarize my billing status",
];

/**
 * AI Assistant chat. The conversation is persisted client-side (chat store —
 * survives navigation, refresh, and the browser session) and only cleared via
 * an explicit "New Chat". Each send posts the full conversation to the
 * backend, which relays it to the user's configured provider and returns the
 * assistant reply, grounded server-side in the workspace's aggregated billing
 * data (Phase 11).
 */
export function AiChat() {
  const { messages } = React.useSyncExternalStore(
    chatStore.subscribe,
    chatStore.getSnapshot,
    chatStore.getServerSnapshot
  );
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Scrolls only the message list itself, never the surrounding page.
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const sendText = async (raw: string) => {
    const text = raw.trim();
    if (!text || sending) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    chatStore.append({ role: "user", content: text });
    setInput("");
    setError(null);
    setSending(true);

    try {
      const response = await sendChatMessage(nextMessages);
      chatStore.append(response.data.message);
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

  const handleNewChat = () => {
    if (sending) return;
    chatStore.clear();
    setError(null);
    setInput("");
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void sendText(input);
  };

  // ── Voice input: mic → live transcript into the input field. ──
  const {
    supported: micSupported,
    listening,
    start: startListening,
    stop: stopListening,
  } = useSpeechRecognition({
    onTranscript: (text) => setInput(text),
    onError: (message) => setError(message),
  });

  const handleMicClick = () => {
    if (listening) {
      stopListening();
      return;
    }
    setError(null);
    startListening();
  };

  // ── Voice output: read new assistant replies aloud when enabled. ──
  const { supported: ttsSupported, speaking, speak, cancel: cancelSpeech } =
    useSpeechSynthesis();
  const [voiceReplies, setVoiceReplies] = React.useState(false);
  // Baseline set once on mount so restored history is never read aloud.
  const spokenCountRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (spokenCountRef.current === null) spokenCountRef.current = messages.length;
  }, [messages.length]);

  React.useEffect(() => {
    if (!voiceReplies || spokenCountRef.current === null) return;
    if (messages.length <= spokenCountRef.current) return;
    const latest = messages[messages.length - 1];
    spokenCountRef.current = messages.length;
    if (latest?.role === "assistant") speak(latest.content);
  }, [messages, voiceReplies, speak]);

  const toggleVoiceReplies = () => {
    setVoiceReplies((value) => {
      const next = !value;
      if (!next) cancelSpeech();
      return next;
    });
  };

  const isEmpty = messages.length === 0;

  return (
    <PageWrapper>
      <PageHeader
        title="AI Assistant"
        description="Ask questions and get insights about your billing and usage."
        actions={
          <>
            {ttsSupported ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleVoiceReplies}
                aria-pressed={voiceReplies}
                title={
                  voiceReplies
                    ? "Voice replies on — click to mute"
                    : "Read replies aloud"
                }
              >
                {voiceReplies ? <Volume2 /> : <VolumeX />}
                {speaking ? "Speaking…" : voiceReplies ? "Voice on" : "Voice off"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleNewChat}
              disabled={sending || messages.length === 0}
            >
              <MessageSquarePlus />
              New Chat
            </Button>
          </>
        }
      />

      <Card className="flex flex-1 flex-col p-0">
        <div
          ref={scrollRef}
          className="flex max-h-[60vh] min-h-80 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6"
        >
          {isEmpty && !sending ? (
            <div className="m-auto flex flex-col items-center gap-4">
              <EmptyState
                icon={Sparkles}
                title="Ask about your billing data"
                description="The assistant can answer questions using your aggregated billing analytics — totals, overdue invoices, spend by platform, and more."
              />
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void sendText(prompt)}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
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
        </div>

        <div className="border-t p-4">
          {error ? (
            <FormAlert variant="error" message={error} className="mb-3" />
          ) : null}
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={listening ? "Listening…" : "Type your message…"}
              disabled={sending}
              aria-label="Message"
            />
            {micSupported ? (
              <Button
                type="button"
                variant={listening ? "destructive" : "outline"}
                size="icon"
                onClick={handleMicClick}
                disabled={sending}
                aria-pressed={listening}
                aria-label={listening ? "Stop voice input" : "Start voice input"}
                title={listening ? "Stop voice input" : "Speak your message"}
              >
                {listening ? (
                  <Square className="animate-pulse" />
                ) : (
                  <Mic />
                )}
              </Button>
            ) : null}
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
