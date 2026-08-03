/** Support request types — backs the "Priority support" plan feature. */
export type SupportPriority = "standard" | "priority";
export type SupportStatus = "open" | "resolved";
export type SupportCategory =
  | "billing"
  | "technical"
  | "account"
  | "feature-request"
  | "other";

export interface SupportRequest {
  id: string;
  category: SupportCategory;
  subject: string;
  message: string;
  priority: SupportPriority;
  status: SupportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupportRequestPayload {
  category: SupportCategory;
  subject: string;
  message: string;
}

export interface SupportRequestListData {
  requests: SupportRequest[];
}

export interface SupportRequestData {
  request: SupportRequest;
}
