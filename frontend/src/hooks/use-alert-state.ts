import * as React from "react";

export interface AlertState {
  type: "success" | "error";
  message: string;
  /** Optional field-level messages (e.g. backend validation errors). */
  details?: string[];
}

const SUCCESS_AUTO_DISMISS_MS = 2000;

/**
 * Local alert-banner state shared by settings tabs and CRUD views. Success
 * alerts (e.g. "Saved", "Invitation sent") auto-dismiss after 2s instead of
 * lingering until the user navigates away; error alerts stay until the next
 * action so there's time to read them.
 */
export function useAlertState<T extends AlertState = AlertState>() {
  const [alert, setAlert] = React.useState<T | null>(null);

  React.useEffect(() => {
    if (alert?.type !== "success") return;
    const timer = setTimeout(() => setAlert(null), SUCCESS_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [alert]);

  return [alert, setAlert] as const;
}
