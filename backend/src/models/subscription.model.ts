/**
 * Subscription model — Task 10 (Stripe, minimum production-grade). Tracks
 * the CURRENT state of an organization's paid plan-tier subscription,
 * mirrored from Stripe's own `customer.subscription.*` events — never
 * written directly by any client-facing route (see plan.controller.ts's
 * `updateMyPlan`, which only ever allows a downgrade to Free, and
 * `services/payments/stripe-subscription.service.ts`, the only writer of
 * this model). One row per organization: this represents "the subscription
 * this org currently has," not a historical log — Stripe's own dashboard
 * and the `StripeProcessedEvent`-guarded webhook history are the audit
 * trail for what happened over time.
 */
import { Schema, model, type HydratedDocument, type Model, type Types } from "mongoose";

import { PLAN_TIERS, type PlanTier } from "@/config/plans";

/** Mirrors Stripe's own `Subscription.status` values — see
 *  https://docs.stripe.com/api/subscriptions/object#subscription_object-status.
 *  Kept as the same strings Stripe uses (not remapped to app-specific
 *  names) so a webhook payload's `status` field can be stored verbatim. */
export const SUBSCRIPTION_STATUSES = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** A subscription status that means "this org should actually receive the
 *  tier's benefits right now" — everything else (past_due/unpaid/canceled/
 *  incomplete/paused) means the tier should NOT be granted, even though the
 *  Subscription record itself is kept for history/support purposes. */
export const ACTIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "active",
  "trialing",
];

export interface ISubscription {
  /** Owning organization — every query MUST be scoped by this. One
   *  subscription record per org (see the unique index below). */
  organization: Types.ObjectId;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripePriceId: string;
  /** The plan tier this Stripe Price maps to (config/plans.ts's
   *  STRIPE_PRICE_TO_TIER) — denormalized so a query never needs to also
   *  hold the price-id-to-tier map in memory. */
  planTier: PlanTier;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  /** True when the customer has scheduled a cancellation for the end of
   *  the current period (Stripe's own `cancel_at_period_end`) — the tier
   *  still applies until `currentPeriodEnd`, this is just a heads-up. */
  cancelAtPeriodEnd: boolean;
  /** The most recent Stripe event's own `created` timestamp actually
   *  applied to this record — the out-of-order-event guard (Task 10's own
   *  acceptance criterion: "out-of-order subscription.updated resolved by
   *  comparing created"). A webhook delivered out of order, older than
   *  this, is ignored rather than overwriting newer state with stale data. */
  lastEventAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type SubscriptionDocument = HydratedDocument<ISubscription>;
type SubscriptionModel = Model<ISubscription>;

const subscriptionSchema = new Schema<ISubscription, SubscriptionModel>(
  {
    organization: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    stripeSubscriptionId: {
      type: String,
      required: true,
      trim: true,
    },
    stripeCustomerId: {
      type: String,
      required: true,
      trim: true,
    },
    stripePriceId: {
      type: String,
      required: true,
      trim: true,
    },
    planTier: {
      type: String,
      enum: PLAN_TIERS,
      required: true,
    },
    status: {
      type: String,
      enum: { values: SUBSCRIPTION_STATUSES, message: "Invalid subscription status" },
      required: true,
    },
    currentPeriodEnd: {
      type: Date,
      required: true,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    lastEventAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// One subscription record per organization.
subscriptionSchema.index({ organization: 1 }, { unique: true });
// One organization per Stripe subscription id (the reverse direction —
// never two orgs somehow claiming the same Stripe subscription).
subscriptionSchema.index({ stripeSubscriptionId: 1 }, { unique: true });

export const Subscription = model<ISubscription, SubscriptionModel>(
  "Subscription",
  subscriptionSchema
);
