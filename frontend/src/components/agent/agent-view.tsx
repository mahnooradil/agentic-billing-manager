"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BotMessageSquare,
  Loader2,
  Mic,
  Plug,
  Send,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AiRecommendations } from "@/components/ai/ai-recommendations";
import { EmptyState } from "@/components/common/empty-state";
import { FormAlert } from "@/components/common/form-alert";
import { PageWrapper } from "@/components/common/page-wrapper";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api/client";
import { sendAgentMessage } from "@/services/agent/agent-chat.service";
import { agentChatStore } from "@/services/agent/agent-chat-store";
import { getMyCredits } from "@/services/credits/credits.service";
import type { ConnectPlatformAction } from "@/services/types/agent";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis";

/** One-tap starter questions that showcase the agent's real tool-use. */
const SUGGESTED_PROMPTS = [
  "What's my total spend?",
  "How many platforms do I have connected?",
  "Can I connect Shopify?",
  "What platforms can you connect for me?",
];

/**
 * Billing Agent — a real Claude Managed Agent (not the plain AI Assistant
 * chat). It can read live billing/platform data via tools and explain how to
 * connect new platforms. Conversation memory lives server-side in the
 * agent's own session; the client only ever sends the latest message and
 * keeps a local transcript (separate storage from the AI Assistant) purely
 * for display continuity across refreshes.
 */
export function AgentView() {
  const router = useRouter();
  const { messages } = React.useSyncExternalStore(
    agentChatStore.subscribe,
    agentChatStore.getSnapshot,
    agentChatStore.getServerSnapshot
  );
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Credit balance — refetched after every turn (consumption is only known
  // server-side, after the turn completes) via a reload-key bump rather than
  // computed locally, so it never drifts from the real ledger.
  const [credits, setCredits] = React.useState<number | null>(null);
  const [creditsReloadKey, setCreditsReloadKey] = React.useState(0);

  React.useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const response = await getMyCredits();
        if (ignore) return;
        setCredits(response.data.balance);
      } catch {
        // Non-critical — the balance pill just stays hidden on failure.
      }
    })();
    return () => {
      ignore = true;
    };
  }, [creditsReloadKey]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  const outOfCredits = credits !== null && credits <= 0;

  const sendText = async (raw: string) => {
    const text = raw.trim();
    if (!text || sending || outOfCredits) return;

    agentChatStore.append({ role: "user", content: text });
    setInput("");
    setError(null);
    setSending(true);

    try {
      const response = await sendAgentMessage(text);
      agentChatStore.append(response.data.message);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to reach the agent. Please try again."
      );
    } finally {
      setSending(false);
      setCreditsReloadKey((key) => key + 1);
    }
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

  const handleConnectAction = (action: ConnectPlatformAction) => {
    const params = new URLSearchParams({
      connect: action.platform,
      source: action.source,
      label: action.displayName,
    });
    router.push(`/dashboard/platforms?${params.toString()}`);
  };

  const isEmpty = messages.length === 0;

  return (
    <PageWrapper>
      {/* Hero */}
      <div className="rounded-2xl bg-brand-gradient p-6 text-primary-foreground sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                <BotMessageSquare className="size-5" />
              </span>
              <p className="text-xs font-semibold tracking-[0.18em] text-white/70 uppercase">
                Billing Advisor Agent
              </p>
              <span className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[0.65rem] font-medium">
                <span className="size-1.5 rounded-full bg-emerald-300" />
                Active
              </span>
              {credits !== null ? (
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-medium",
                    outOfCredits ? "bg-red-500/30" : "bg-white/15"
                  )}
                >
                  {Math.max(0, credits)} credit{credits === 1 ? "" : "s"} left
                </span>
              ) : null}
            </div>
            <h1 className="font-heading text-2xl font-semibold text-balance sm:text-3xl">
              Meet your Billing Agent
            </h1>
            <p className="max-w-lg text-sm text-white/80 italic">
              &ldquo;I don&apos;t guess your numbers — I go look them up.&rdquo;
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {ttsSupported ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleVoiceReplies}
                aria-pressed={voiceReplies}
                className="border-white/30 bg-white/10 text-primary-foreground hover:bg-white/20 hover:text-primary-foreground"
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
          </div>
        </div>
      </div>

      <Card className="flex flex-1 flex-col p-0">
        <div
          ref={scrollRef}
          className="flex max-h-[60vh] min-h-80 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6"
        >
          {isEmpty && !sending ? (
            <div className="m-auto flex flex-col items-center gap-4">
              <EmptyState
                icon={BotMessageSquare}
                title="Ask your Billing Agent anything"
                description="It can read your real billing and platform data, and explain how to connect new platforms — try one of these to see it in action."
              />
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={outOfCredits}
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
                    "flex flex-col gap-2",
                    message.role === "user" ? "items-end" : "items-start"
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
                  {message.action ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleConnectAction(message.action!)}
                    >
                      <Plug />
                      Connect {message.action.displayName} now
                    </Button>
                  ) : null}
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
          {outOfCredits ? (
            <FormAlert
              variant="error"
              message="You've used all your credits. Add more credits to keep chatting with the Billing Advisor."
              className="mb-3"
            />
          ) : null}
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={listening ? "Listening…" : "Ask your agent…"}
              disabled={sending || outOfCredits}
              aria-label="Message"
            />
            {micSupported ? (
              <Button
                type="button"
                variant={listening ? "destructive" : "outline"}
                size="icon"
                onClick={handleMicClick}
                disabled={sending || outOfCredits}
                aria-pressed={listening}
                aria-label={listening ? "Stop voice input" : "Start voice input"}
                title={listening ? "Stop voice input" : "Speak your message"}
              >
                {listening ? <Square className="animate-pulse" /> : <Mic />}
              </Button>
            ) : null}
            <Button type="submit" disabled={sending || outOfCredits || !input.trim()}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              Send
            </Button>
          </form>
        </div>
      </Card>

      <AiRecommendations />
    </PageWrapper>
  );
}
