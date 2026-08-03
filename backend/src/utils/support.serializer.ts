import type {
  SupportCategory,
  SupportRequestDocument,
} from "@/models/support-request.model";

export interface PublicSupportRequest {
  id: string;
  category: SupportCategory;
  subject: string;
  message: string;
  priority: "standard" | "priority";
  status: "open" | "resolved";
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicSupportRequest(
  doc: SupportRequestDocument
): PublicSupportRequest {
  return {
    id: doc._id.toString(),
    // Falls back to "other" for requests submitted before categories existed.
    category: doc.category ?? "other",
    subject: doc.subject,
    message: doc.message,
    priority: doc.priority,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
