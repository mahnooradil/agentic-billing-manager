/**
 * Converts a Mongoose SenderProfile document into the shape returned to API
 * clients. Single source of truth for "what a sender's trust profile looks
 * like on the wire" — mirrors billing.serializer.ts's own convention.
 */
import type { SenderProfileDocument } from "@/models/sender-profile.model";

export interface PublicSenderProfile {
  id: string;
  domain: string;
  trust: string;
  confirmedInvoiceCount: number;
  falsePositiveCount: number;
  manuallySet: boolean;
  lastEvaluatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicSenderProfile(profile: SenderProfileDocument): PublicSenderProfile {
  return {
    id: profile._id.toString(),
    domain: profile.domain,
    trust: profile.trust,
    confirmedInvoiceCount: profile.confirmedInvoiceCount,
    falsePositiveCount: profile.falsePositiveCount,
    manuallySet: profile.manuallySet,
    lastEvaluatedAt: profile.lastEvaluatedAt,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}
