"use client";

import * as React from "react";
import { createFrontendClient } from "@pipedream/sdk/browser";

import { ApiError } from "@/services/api/client";
import { createPipedreamConnectToken } from "@/services/connections/platform-connections.service";

export interface PipedreamConnectTarget {
  nameSlug: string;
  name: string;
}

/**
 * Wraps Pipedream's browser Connect popup for one page: mints a Connect
 * token, opens the popup for a given app, and on success hands the verified
 * Pipedream account id to `onConnected` (which does whatever this app needs —
 * usually POST /platform-connections/pipedream). Extracted out of
 * platforms-view.tsx so the Settings "Email accounts" tab can trigger the
 * exact same flow for a fixed app (Gmail/Outlook) instead of duplicating it.
 *
 * Tracks one in-flight connection at a time via `connectingSlug`, keyed by
 * `nameSlug` — clicking the same trigger again while it's connecting cancels
 * it (a manual escape hatch, since Pipedream's SDK doesn't reliably fire
 * `onError` for every way a user can back out of the popup). Window-focus,
 * tab-visibility, and a hard timeout all finish it too, so it never gets
 * stuck if every popup-side signal is missed.
 */
export function usePipedreamConnect(
  onConnected: (app: PipedreamConnectTarget, accountId: string) => Promise<void> | void,
  onError: (message: string) => void
) {
  const [connectingSlug, setConnectingSlug] = React.useState<string | null>(null);
  const cleanupRef = React.useRef<Map<string, () => void>>(new Map());

  React.useEffect(() => {
    const cleanups = cleanupRef.current;
    return () => {
      for (const cleanup of cleanups.values()) cleanup();
      cleanups.clear();
    };
  }, []);

  /** Clears any in-flight connection without waiting for its own timeout —
   *  for callers reacting to page-level signals (e.g. a bfcache pageshow). */
  const clearAll = React.useCallback(() => {
    for (const cleanup of cleanupRef.current.values()) cleanup();
    cleanupRef.current.clear();
    setConnectingSlug(null);
  }, []);

  const connect = React.useCallback(
    async (app: PipedreamConnectTarget) => {
      if (connectingSlug === app.nameSlug) {
        cleanupRef.current.get(app.nameSlug)?.();
        cleanupRef.current.delete(app.nameSlug);
        setConnectingSlug(null);
        return;
      }

      setConnectingSlug(app.nameSlug);
      const finish = () => {
        cleanupRef.current.get(app.nameSlug)?.();
        cleanupRef.current.delete(app.nameSlug);
        setConnectingSlug((current) => (current === app.nameSlug ? null : current));
      };

      try {
        const tokenRes = await createPipedreamConnectToken();
        const pd = createFrontendClient();
        pd.connectAccount({
          app: app.nameSlug,
          token: tokenRes.data.token,
          onSuccess: async (account: { id: string }) => {
            try {
              await onConnected(app, account.id);
            } catch (error) {
              onError(
                error instanceof ApiError ? error.message : "Could not finalize the connection."
              );
            } finally {
              finish();
            }
          },
          onError: (err: { message?: string }) => {
            onError(err?.message ?? "The connection was cancelled.");
            finish();
          },
        });

        const handleReturn = () => setTimeout(finish, 1000);
        const handleVisibility = () => {
          if (document.visibilityState === "visible") handleReturn();
        };
        window.addEventListener("focus", handleReturn);
        document.addEventListener("visibilitychange", handleVisibility);
        const hardTimeout = setTimeout(finish, 45_000);

        cleanupRef.current.set(app.nameSlug, () => {
          window.removeEventListener("focus", handleReturn);
          document.removeEventListener("visibilitychange", handleVisibility);
          clearTimeout(hardTimeout);
        });
      } catch (error) {
        onError(error instanceof ApiError ? error.message : "Could not start the connection.");
        finish();
      }
    },
    [connectingSlug, onConnected, onError]
  );

  return { connectingSlug, connect, clearAll };
}
