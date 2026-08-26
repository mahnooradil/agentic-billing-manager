/**
 * Billing Agent chat types — deliberately separate from `services/types/ai.ts`
 * (the plain AI Assistant), since these two chats have different backends and
 * different response shapes (the agent can attach a `connect_platform` action).
 */
export type AgentChatRole = "user" | "assistant";

/**
 * Surfaced by the agent when it confirms a platform CAN be live-connected —
 * the chat UI renders this as a one-click deep link straight into the
 * existing, already-secure Connect flow on the Platforms page. Metadata only;
 * never a credential.
 */
export interface ConnectPlatformAction {
  type: "connect_platform";
  platform: string;
  displayName: string;
  source: "native" | "pipedream";
}

/** Surfaced when the agent has resolved a "mark as Paid/Pending/Overdue"
 *  request to one exact record. The agent never applies this itself — the
 *  chat UI renders a confirm button that calls the same `PUT /api/billing/:id`
 *  the Billing page's own edit form uses. */
export interface UpdateBillingStatusAction {
  type: "update_billing_status";
  billingId: string;
  customerName: string;
  invoiceNumber: string;
  currentStatus: string;
  newStatus: string;
}

/** Same confirm-first pattern, for a delete request — the confirm button
 *  calls the existing `DELETE /api/billing/:id`. */
export interface DeleteBillingRecordAction {
  type: "delete_billing_record";
  billingId: string;
  customerName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
}

export type AgentAction =
  | ConnectPlatformAction
  | UpdateBillingStatusAction
  | DeleteBillingRecordAction;

export interface AgentChatMessage {
  role: AgentChatRole;
  content: string;
  action?: AgentAction;
  /** Set client-side once the user confirms an update/delete action, so the
   *  button becomes a static "Done"/"Failed" state instead of being
   *  clickable again (a record can't be deleted twice). Never sent by the
   *  backend. */
  actionResult?: "done" | "error";
}

/** Response `data` shape for a Billing Agent chat turn. */
export interface AgentChatResponseData {
  message: AgentChatMessage;
}
