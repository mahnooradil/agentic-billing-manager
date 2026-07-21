/**
 * Lightweight typed event bus — Phase F1.
 *
 * A tiny in-process pub/sub that decouples event producers (controllers,
 * webhooks, future connectors) from event consumers (the Recommendation Engine
 * now; Notification/Alert/LangGraph/Automation engines later). Handlers are
 * fire-and-forget and isolated: a throwing subscriber can never break the
 * emitter or the request that triggered the event.
 *
 * This is intentionally minimal (no external deps). A future realtime/queue
 * phase can replace the internals without changing this public surface.
 */
import type {
  DomainEvent,
  DomainEventType,
  EventHandler,
  EventMap,
} from "@/services/events/types";

class EventBus {
  private readonly handlers = new Map<DomainEventType, Set<EventHandler>>();

  /** Subscribe to an event type. Returns an unsubscribe function. */
  subscribe<K extends keyof EventMap>(
    type: K,
    handler: (event: EventMap[K]) => void
  ): () => void {
    const set = this.handlers.get(type) ?? new Set<EventHandler>();
    set.add(handler as EventHandler);
    this.handlers.set(type, set);
    return () => set.delete(handler as EventHandler);
  }

  /** Emit an event to all subscribers. Subscriber errors are isolated. */
  emit(event: DomainEvent): void {
    const set = this.handlers.get(event.type);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(event);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[event-bus] handler for "${event.type}" failed: ${message}`);
      }
    }
  }
}

/** Process-wide singleton bus. */
export const eventBus = new EventBus();

/**
 * Minimal helper for producers. Controllers call ONLY this (not any engine),
 * keeping trigger points to a single decoupled line that future event sources
 * can reuse verbatim.
 */
export function emitBusinessDataChanged(input: {
  source: string;
  action: string;
  triggeredBy?: string;
}): void {
  eventBus.emit({
    type: "business.data.changed",
    source: input.source,
    action: input.action,
    triggeredBy: input.triggeredBy,
    at: new Date(),
  });
}
