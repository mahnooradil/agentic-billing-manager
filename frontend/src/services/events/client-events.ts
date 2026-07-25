/**
 * Tiny client-side event emitter (Phase F2.1).
 *
 * Standalone (no imports from the API client or any store) so it can be the
 * decoupling seam between them without a circular dependency: the API client
 * PUBLISHES a `data:mutated` signal after a successful mutation, and the
 * Notification Store SUBSCRIBES to refresh instantly.
 *
 * This is deliberately transport-agnostic. A future WebSocket/SSE layer can emit
 * the same `notification:incoming` event and the UI/store react identically —
 * without any change to the Notification UI or Store.
 */
export type ClientEventType =
  | "data:mutated"
  | "notification:incoming"
  | "notification:open";

type Handler = () => void;

const handlers = new Map<ClientEventType, Set<Handler>>();

/** Subscribe to a client event. Returns an unsubscribe function. */
export function onClientEvent(type: ClientEventType, handler: Handler): () => void {
  const set = handlers.get(type) ?? new Set<Handler>();
  set.add(handler);
  handlers.set(type, set);
  return () => set.delete(handler);
}

/** Emit a client event. Subscriber errors are isolated. */
export function emitClientEvent(type: ClientEventType): void {
  const set = handlers.get(type);
  if (!set) return;
  for (const handler of set) {
    try {
      handler();
    } catch {
      /* never let one subscriber break the emit */
    }
  }
}
