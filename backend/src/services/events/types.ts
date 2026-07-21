/**
 * Domain event types — the contract for the internal event bus (Phase F1).
 *
 * The event bus is the decoupling seam between "something happened" (emitted by
 * controllers / webhooks / future connectors) and "engines that react to it"
 * (the Recommendation Engine now; Notification/Alert/LangGraph/Automation engines
 * later). Controllers depend ONLY on these types + the bus — never on an engine.
 */

/** Where a business-data change originated. Open-ended for future sources. */
export type EventSource =
  | "billing"
  | "platform"
  | "webhook"
  | "connector"
  | "scheduler"
  | (string & {});

/** The kind of change. Open-ended for future actions. */
export type EventAction = "create" | "update" | "delete" | (string & {});

/** Emitted whenever meaningful business data changes. */
export interface BusinessDataChangedEvent {
  type: "business.data.changed";
  source: EventSource;
  action: EventAction;
  /** User whose AI settings should drive any AI work (if applicable). */
  triggeredBy?: string;
  at: Date;
}

/** Emitted by the Recommendation Engine after a refresh completes. */
export interface RecommendationsUpdatedEvent {
  type: "recommendations.updated";
  summary: {
    created: number;
    updated: number;
    autoCompleted: number;
    active: number;
  };
  at: Date;
}

/** Union of all domain events. Extend this as new events are introduced. */
export type DomainEvent = BusinessDataChangedEvent | RecommendationsUpdatedEvent;

export type DomainEventType = DomainEvent["type"];

/**
 * Maps each event type to its concrete payload, so `subscribe(type, handler)`
 * narrows the handler's event precisely. Add an entry per new event.
 */
export interface EventMap {
  "business.data.changed": BusinessDataChangedEvent;
  "recommendations.updated": RecommendationsUpdatedEvent;
}

/** A subscriber handler for a specific event type. */
export type EventHandler<E extends DomainEvent = DomainEvent> = (
  event: E
) => void;
