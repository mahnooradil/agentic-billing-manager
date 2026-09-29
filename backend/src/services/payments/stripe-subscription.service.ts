/**
 * Stripe Subscription Checkout + webhook handling — Task 10 (the actual
 * "plan tier payment gate" the roadmap means by "Stripe, minimum
 * production-grade"; distinct from stripe-checkout.service.ts's existing
 * one-time "Buy Credits" flow, which this file reuses the Stripe client and
 * event-dedup helpers from but otherwise doesn't touch).
 *
 * The organization's `planTier` is written in exactly ONE place in this
 * whole codebase after this file lands: `applySubscriptionEvent` below,
 * driven only by a verified Stripe webhook. `plan.controller.ts`'s
 * `updateMyPlan` no longer sets a paid tier directly — see that file.
 */
import Stripe from "stripe";

import { env, isProduction } from "@/config/env";
import { AppError } from "@/utils/appError";
import { Organization, type OrganizationDocument } from "@/models/organization.model";
import {
  Subscription,
  ACTIVE_SUBSCRIPTION_STATUSES,
  type SubscriptionStatus,
} from "@/models/subscription.model";
import { StripeProcessedEvent } from "@/models/stripe-processed-event.model";
import { planTierForStripePrice, type PlanTier } from "@/config/plans";
import { upsertNotification } from "@/services/notification/notification-engine";

let client: Stripe | null = null;

/** True when subscription checkout is actually usable — the base Stripe
 *  config plus BOTH plan-tier Price ids (a checkout with no known Price to
 *  sell isn't meaningfully "configured"). */
export function isSubscriptionCheckoutConfigured(): boolean {
  return Boolean(
    env.stripeSecretKey &&
      env.stripeWebhookSecret &&
      env.stripePricePro &&
      env.stripePriceBusiness
  );
}

/**
 * Refuses to boot with a LIVE Stripe secret key outside production — a
 * misconfigured `.env` (e.g. a live key pasted into a local/staging
 * environment) would otherwise let real charges happen against test/dev
 * data. Called once at server startup (see server.ts); throws rather than
 * warns, since "accidentally charge a real card in dev" is not a risk
 * worth a mere log line.
 */
export function assertNoLiveStripeKeyOutsideProduction(): void {
  if (!env.stripeSecretKey) return;
  if (!isProduction && env.stripeSecretKey.startsWith("sk_live_")) {
    throw new Error(
      "STRIPE_SECRET_KEY looks like a LIVE key (sk_live_...) but NODE_ENV is not " +
        "'production'. Refusing to start — use a test key (sk_test_...) outside " +
        "production, or set NODE_ENV=production if this really is production."
    );
  }
}

function getClient(): Stripe {
  if (!env.stripeSecretKey) {
    throw new AppError("Payments aren't configured on this server yet.", 503);
  }
  if (!client) client = new Stripe(env.stripeSecretKey);
  return client;
}

export interface SubscriptionCheckoutResult {
  url: string;
}

/** Creates (or reuses) a Stripe Customer for this organization, then a
 *  recurring Checkout Session for the requested paid tier. Free is never
 *  passed here — it has no Price, see plan.controller.ts. */
export async function createSubscriptionCheckoutSession(
  organization: OrganizationDocument,
  userEmail: string,
  tier: Extract<PlanTier, "Pro" | "Business">
): Promise<SubscriptionCheckoutResult> {
  if (!isSubscriptionCheckoutConfigured()) {
    throw new AppError("Plan checkout isn't configured on this server yet.", 503);
  }

  const priceId = tier === "Pro" ? env.stripePricePro : env.stripePriceBusiness;
  const stripe = getClient();

  let customerId = organization.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: { organizationId: organization._id.toString() },
    });
    customerId = customer.id;
    organization.stripeCustomerId = customerId;
    await organization.save();
  }

  const baseUrl = env.corsOrigin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    // Carried onto the actual Subscription object Stripe creates (not just
    // this Checkout Session) — the subscription.created/updated webhook
    // reads it directly, so applying an event never depends on a separate
    // customer-id lookup.
    subscription_data: {
      metadata: { organizationId: organization._id.toString() },
    },
    success_url: `${baseUrl}/dashboard/plan?checkout=success`,
    cancel_url: `${baseUrl}/dashboard/plan?checkout=cancel`,
  });

  if (!session.url) {
    throw new AppError("Stripe didn't return a checkout URL. Please try again.", 502);
  }
  return { url: session.url };
}

/** Claims a Stripe event id — returns false if it's already been processed
 *  (a redelivery). Shared with the credit-purchase flow's identical
 *  StripeProcessedEvent collection — one dedup ledger for every Stripe
 *  event type this app handles, not a second parallel one. */
async function claimEvent(eventId: string): Promise<boolean> {
  try {
    await StripeProcessedEvent.create({ eventId });
    return true;
  } catch {
    return false;
  }
}

/** True when the Stripe status means the org should actually receive the
 *  tier's benefits right now. */
function isEntitled(status: SubscriptionStatus): boolean {
  return ACTIVE_SUBSCRIPTION_STATUSES.includes(status);
}

/**
 * Applies a `customer.subscription.created`/`.updated`/`.deleted` event.
 * Idempotent (guarded by the same event-id ledger every Stripe handler in
 * this app uses) AND tolerant of out-of-order delivery: an event older
 * than the record's own `lastEventAt` is ignored outright, per Task 10's
 * own acceptance criterion ("out-of-order subscription.updated resolved by
 * comparing created").
 */
export async function applySubscriptionEvent(event: Stripe.Event): Promise<void> {
  const claimed = await claimEvent(event.id);
  if (!claimed) return;

  const subscription = event.data.object as Stripe.Subscription;
  const organizationId = subscription.metadata?.organizationId;
  if (!organizationId) return;

  const organization = await Organization.findById(organizationId);
  if (!organization) return;

  const eventCreatedAt = new Date(event.created * 1000);
  const existing = await Subscription.findOne({ organization: organization._id });
  if (existing && existing.lastEventAt >= eventCreatedAt) {
    // A redelivered or genuinely out-of-order (older) event — the current
    // record already reflects equal-or-newer information. Never regress.
    return;
  }

  const item = subscription.items.data[0];
  const priceId = item?.price.id ?? "";
  const planTier = planTierForStripePrice(priceId, {
    pro: env.stripePricePro,
    business: env.stripePriceBusiness,
  });

  const status = subscription.status as SubscriptionStatus;
  const currentPeriodEnd = new Date((item?.current_period_end ?? subscription.created) * 1000);

  if (event.type === "customer.subscription.deleted" || !planTier) {
    // Deleted, or a Price we don't recognize (e.g. the product was
    // reconfigured in Stripe) — never leave an org entitled to a tier this
    // server can't account for. Revert to Free and record the terminal
    // status for support/history purposes.
    await Subscription.updateOne(
      { organization: organization._id },
      {
        $set: {
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: String(subscription.customer),
          stripePriceId: priceId,
          planTier: existing?.planTier ?? "Free",
          status: "canceled",
          currentPeriodEnd,
          cancelAtPeriodEnd: false,
          lastEventAt: eventCreatedAt,
        },
      },
      { upsert: true }
    );
    organization.planTier = "Free";
    await organization.save();
    return;
  }

  await Subscription.updateOne(
    { organization: organization._id },
    {
      $set: {
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: String(subscription.customer),
        stripePriceId: priceId,
        planTier,
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        lastEventAt: eventCreatedAt,
      },
    },
    { upsert: true, setDefaultsOnInsert: true }
  );

  // The org is only actually entitled to the paid tier while Stripe
  // reports an active/trialing status — a lapsed payment (past_due/unpaid)
  // keeps the Subscription record (for support/history and so a later
  // recovery event can resume it) but the ORGANIZATION drops back to Free
  // immediately, rather than silently keeping paid features during a
  // billing problem.
  organization.planTier = isEntitled(status) ? planTier : "Free";
  await organization.save();
}

/**
 * Cancels an organization's active Stripe subscription, if it has one —
 * called from `plan.controller.ts`'s `updateMyPlan` when a client
 * self-service-downgrades to Free, so they actually stop being billed
 * instead of silently continuing to pay Stripe while this app already
 * thinks they're on Free. The resulting `customer.subscription.deleted`
 * webhook is what actually updates the `Subscription` record — this call
 * only ever talks to Stripe, never writes local state itself, so the
 * webhook stays the single writer per this file's own docstring. A no-op,
 * not an error, when there is nothing to cancel (Free orgs that never
 * subscribed, or one already canceled).
 */
export async function cancelActiveSubscription(organization: OrganizationDocument): Promise<void> {
  if (!env.stripeSecretKey) return;
  const existing = await Subscription.findOne({ organization: organization._id });
  if (!existing || !isEntitled(existing.status)) return;

  const stripe = getClient();
  await stripe.subscriptions.cancel(existing.stripeSubscriptionId).catch((error: unknown) => {
    // Best-effort from the caller's perspective (a downgrade request should
    // still succeed locally even if Stripe is briefly unreachable) — but
    // genuinely log it, since an uncanceled Stripe subscription left behind
    // here means the customer keeps being charged for a tier they just
    // downgraded away from in this app.
    console.error(
      `[stripe] failed to cancel subscription ${existing.stripeSubscriptionId} for org ${organization._id.toString()}:`,
      error instanceof Error ? error.message : String(error)
    );
  });
}

/**
 * `invoice.payment_failed` — Stripe's own subscription status (handled via
 * `applySubscriptionEvent` above) is the actual source of truth for
 * whether the org keeps its paid tier; this handler exists purely to
 * surface a user-facing warning the moment a charge fails, rather than the
 * customer only finding out once the tier has already silently dropped.
 * Best-effort: a missed notification is not a correctness issue.
 */
export async function notifySubscriptionPaymentFailed(event: Stripe.Event): Promise<void> {
  const claimed = await claimEvent(event.id);
  if (!claimed) return;

  const invoice = event.data.object as Stripe.Invoice;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const organization = await Organization.findOne({ stripeCustomerId: customerId });
  if (!organization) return;

  await upsertNotification(organization._id.toString(), {
    signature: "system:subscription-payment-failed",
    category: "billing",
    severity: "critical",
    title: "A subscription payment failed",
    message:
      "Your last payment for this workspace's plan didn't go through. Update your payment method to avoid losing paid-tier features.",
  }).catch(() => {
    // Best-effort — see the function's own docstring.
  });
}
