"use client";

/**
 * Persistent conversation store for the Billing Agent page — completely
 * separate from the AI Assistant's chat store (`services/ai/chat-store.ts`).
 * These are two different conversations with two different backends; keeping
 * separate storage keys means clearing one never touches the other.
 *
 * Same external-store pattern as chat-store.ts (`useSyncExternalStore`, no
 * extra package, SSR-safe hydration-after-mount).
 */
import type { AgentChatMessage } from "@/services/types/agent";

const STORAGE_KEY = "billing.agent.chat.v1";
/** Bounded so a long conversation can never bloat localStorage. */
const MAX_MESSAGES = 200;

export interface AgentChatState {
  messages: AgentChatMessage[];
}

const EMPTY: AgentChatState = { messages: [] };

let state: AgentChatState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Keeps only well-formed messages (defensive against corrupted storage). */
function sanitize(value: unknown): AgentChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (m): m is AgentChatMessage =>
        Boolean(m) &&
        typeof m === "object" &&
        (m as AgentChatMessage).role !== undefined &&
        ((m as AgentChatMessage).role === "user" ||
          (m as AgentChatMessage).role === "assistant") &&
        typeof (m as AgentChatMessage).content === "string"
    )
    .slice(-MAX_MESSAGES);
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ messages: state.messages })
    );
  } catch {
    /* storage full / unavailable — the in-memory conversation still works */
  }
}

/** Loads the stored conversation once, after mount. */
function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<AgentChatState> | null;
    const messages = sanitize(parsed?.messages);
    if (messages.length > 0) {
      state = { messages };
      emit();
    }
  } catch {
    /* corrupted storage — start clean */
  }
}

export const agentChatStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    hydrate();
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): AgentChatState {
    return state;
  },
  getServerSnapshot(): AgentChatState {
    return EMPTY;
  },
  /** Appends one message to the conversation. */
  append(message: AgentChatMessage): void {
    state = { messages: [...state.messages, message].slice(-MAX_MESSAGES) };
    persist();
    emit();
  },
  /** Clears the local transcript (paired with a server-side session reset). */
  clear(): void {
    state = { messages: [] };
    persist();
    emit();
  },
};
