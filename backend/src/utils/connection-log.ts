/**
 * Safe connection lifecycle logging (UI-Agent.4).
 *
 * One structured line per connection event for operational visibility. Logs
 * ONLY non-secret fields — event, provider, connection id, status, reason,
 * (short) user id, timestamp. Any free-text is passed through the secret
 * redactor so a credential can never appear in a log, by construction.
 */
import { redactSecrets } from "@/utils/redact";

export interface ConnectionLogEntry {
  event: string;
  provider: string;
  connectionId?: string;
  status?: string;
  reason?: string;
  userId?: string;
  detail?: string;
}

/** Emits a single safe `[connection]` log line. Never logs a credential. */
export function logConnectionEvent(entry: ConnectionLogEntry): void {
  const parts = [
    `[connection] ${entry.event}`,
    `provider=${entry.provider}`,
    entry.connectionId ? `id=${entry.connectionId}` : "",
    entry.status ? `status=${entry.status}` : "",
    entry.reason ? `reason=${entry.reason}` : "",
    entry.userId ? `user=${entry.userId.slice(0, 8)}` : "",
    entry.detail ? `detail="${redactSecrets(entry.detail)}"` : "",
    `at=${new Date().toISOString()}`,
  ].filter(Boolean);
  console.log(parts.join(" "));
}
