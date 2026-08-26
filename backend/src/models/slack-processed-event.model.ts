/**
 * Records every Slack Events API `event_id` this server has already handled.
 * Slack retries delivery whenever it doesn't get a fast enough 200 (e.g. a
 * slow Agent turn, or a mid-deploy restart) — without this, the SAME message
 * could be replayed to the Billing Advisor Agent and double-charge credits.
 *
 * A real Mongo TTL index (not a manually-checked `expiresAt`, unlike
 * `Otp`) is used here on purpose: nothing else in the app ever reads this
 * collection, so there's no natural place for app-level cleanup — letting
 * MongoDB expire rows itself is the simplest correct option. Slack's own
 * retry window is a few minutes, so a wide margin is enough.
 */
import { Schema, model, type HydratedDocument, type Model } from "mongoose";

const PROCESSED_EVENT_TTL_SECONDS = 15 * 60;

export interface ISlackProcessedEvent {
  eventId: string;
  receivedAt: Date;
}

export type SlackProcessedEventDocument = HydratedDocument<ISlackProcessedEvent>;
type SlackProcessedEventModel = Model<ISlackProcessedEvent>;

const slackProcessedEventSchema = new Schema<ISlackProcessedEvent, SlackProcessedEventModel>({
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

export const SlackProcessedEvent = model<ISlackProcessedEvent, SlackProcessedEventModel>(
  "SlackProcessedEvent",
  slackProcessedEventSchema
);
