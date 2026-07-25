"use client";

/**
 * Persistent AI chat conversation store.
 *
 * The assistant's transcript survives page navigation, refresh, and the browser
 * session — it is only cleared when the user explicitly starts a new chat.
 * Follows the project's external-store convention (`useSyncExternalStore`, no
 * extra package), mirroring the auth/session store.
 *
 * SSR-safe: the server snapshot is always the stable empty conversation, and
 * hydration from localStorage happens on `subscribe` (after mount) so the first
 * client render matches the server and never mismatches.
 *
 * Shape is keyed by conversation id so multiple conversations can be added later
 * without changing consumers.
 */
import type { ChatMessage } from "@/services/types/ai";

const STORAGE_KEY = "billing.ai.chat.v1";
/** Bounded so a long conversation can never bloat localStorage. */
const MAX_MESSAGES = 200;

export interface ChatState {
  conversationId: string;
  messages: ChatMessage[];
}

const EMPTY: ChatState = { conversationId: "default", messages: [] };

let state: ChatState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Keeps only well-formed messages (defensive against corrupted storage). */
function sanitize(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (m): m is ChatMessage =>
        Boolean(m) &&
        typeof m === "object" &&
        (m as ChatMessage).role !== undefined &&
        ((m as ChatMessage).role === "user" ||
          (m as ChatMessage).role === "assistant") &&
        typeof (m as ChatMessage).content === "string"
    )
    .slice(-MAX_MESSAGES);
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        conversationId: state.conversationId,
        messages: state.messages,
      })
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
    const parsed = JSON.parse(raw) as Partial<ChatState> | null;
    const messages = sanitize(parsed?.messages);
    if (messages.length > 0) {
      state = {
        conversationId:
          typeof parsed?.conversationId === "string"
            ? parsed.conversationId
            : "default",
        messages,
      };
      emit();
    }
  } catch {
    /* corrupted storage — start clean */
  }
}

export const chatStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    // Hydrate after mount so the first client render matches the server.
    hydrate();
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): ChatState {
    return state;
  },
  getServerSnapshot(): ChatState {
    return EMPTY;
  },
  /** Replaces the conversation (used after each turn). */
  setMessages(messages: ChatMessage[]): void {
    state = { ...state, messages: messages.slice(-MAX_MESSAGES) };
    persist();
    emit();
  },
  /** Appends one message to the conversation. */
  append(message: ChatMessage): void {
    state = {
      ...state,
      messages: [...state.messages, message].slice(-MAX_MESSAGES),
    };
    persist();
    emit();
  },
  /** Clears the conversation (explicit "New Chat" only). */
  clear(): void {
    state = { conversationId: "default", messages: [] };
    persist();
    emit();
  },
};
