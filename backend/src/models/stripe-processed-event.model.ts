/**
 * Records every Stripe webhook event id this server has already handled.
 * Stripe can occasionally redeliver an event (network issues, or its own
 * retry policy on a slow/non-2xx response) — without this, the SAME
 * `checkout.session.completed` event could grant credits twice for one
 * payment. Mirrors services/slack's `SlackProcessedEvent` exactly, including
 * the Mongo TTL index (nothing else ever reads this collection, so letting
 * MongoDB expire rows itself is the simplest correct option) — sized to
 * Stripe's documented retry window (up to a few days) rather than Slack's
 * few-minute one, since a missed dedup here is a real double-charge.
 */
import { Schema, model, type HydratedDocument, type Model } from "mongoose";

const PROCESSED_EVENT_TTL_SECONDS = 3 * 24 * 60 * 60;

export interface IStripeProcessedEvent {
  eventId: string;
  receivedAt: Date;
}

export type StripeProcessedEventDocument = HydratedDocument<IStripeProcessedEvent>;
type StripeProcessedEventModel = Model<IStripeProcessedEvent>;

const stripeProcessedEventSchema = new Schema<IStripeProcessedEvent, StripeProcessedEventModel>({
  eventId: {
    type: String,
    required: true,
    unique: true,
  },
  receivedAt: {
    type: Date,
    required: true,
    default: Date.now,
    expires: PROCESSED_EVENT_TTL_SECONDS,
  },
});

export const StripeProcessedEvent = model<IStripeProcessedEvent, StripeProcessedEventModel>(
  "StripeProcessedEvent",
  stripeProcessedEventSchema
);
