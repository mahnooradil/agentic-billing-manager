/**
 * Stripe Checkout — the "Buy more credits" flow. A hosted Checkout Session
 * (not embedded Elements) keeps card data entirely off this server; this
 * service only ever creates a session and hands back its URL. The actual
 * credit grant happens in `handleCheckoutCompleted`, driven by the webhook
 * (services/../controllers/stripe-webhook.controller.ts) once Stripe
 * confirms payment — never optimistically on session creation.
 */
import Stripe from "stripe";

import { env } from "@/config/env";
import { AppError } from "@/utils/appError";
import { CREDIT_PACKAGES, findCreditPackage, creditsForPackage } from "@/config/credit-packages";
import { grantCredits } from "@/services/credits/credit-ledger.service";
import { StripeProcessedEvent } from "@/models/stripe-processed-event.model";
import type { OrganizationDocument } from "@/models/organization.model";

let client: Stripe | null = null;

/** True when Stripe is configured on this server (both the API key and the
 *  webhook secret — a checkout session with no way to ever confirm payment
 *  isn't meaningfully "configured"). */
export function isStripeConfigured(): boolean {
  return Boolean(env.stripeSecretKey && env.stripeWebhookSecret);
}

/** Lazily constructs the Stripe client — never at import time. */
function getClient(): Stripe {
  if (!isStripeConfigured()) {
    throw new AppError("Buying credits isn't configured on this server yet.", 503);
  }
  if (!client) client = new Stripe(env.stripeSecretKey);
  return client;
}

export interface CheckoutSessionResult {
  url: string;
}

/** Creates (or reuses) a Stripe Customer for this organization, then a
 *  one-time Checkout Session for the requested credit package. */
export async function createCheckoutSession(
  organization: OrganizationDocument,
  userEmail: string,
  packageId: string
): Promise<CheckoutSessionResult> {
  const pkg = findCreditPackage(packageId);
  if (!pkg) {
    throw new AppError("Unknown credit package.", 400);
  }

  const stripe = getClient();
  const credits = creditsForPackage(pkg.priceUsd);

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
    mode: "payment",
    customer: customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(pkg.priceUsd * 100),
          product_data: {
            name: `${credits.toLocaleString()} Billing Advisor credits`,
          },
        },
      },
    ],
    // "credits" was folded into the merged "billing" Settings tab (Billing &
    // Plan + Credits) during the UI redesign — this must point there now.
    success_url: `${baseUrl}/dashboard/plan?checkout=success`,
    cancel_url: `${baseUrl}/dashboard/plan?checkout=cancel`,
    metadata: {
      organizationId: organization._id.toString(),
      credits: String(credits),
      packageId: pkg.id,
    },
  });

  if (!session.url) {
    throw new AppError("Stripe didn't return a checkout URL. Please try again.", 502);
  }
  return { url: session.url };
}

/** Verifies + parses a webhook payload against the raw request bytes.
 *  Throws if the signature doesn't check out (wrong secret, tampered body,
 *  or expired timestamp) — the caller (the webhook controller) treats that
 *  as a 401, same trust boundary as Slack's `verifySlackSignature`. */
export function verifyWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
  return getClient().webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
}

/** Claims a Stripe event id — returns false if it's already been processed
 *  (a redelivery), same idiom as Slack's event dedup. */
async function claimEvent(eventId: string): Promise<boolean> {
  try {
    await StripeProcessedEvent.create({ eventId });
    return true;
  } catch {
    return false;
  }
}

/** Grants the credits a completed Checkout Session paid for. Idempotent —
 *  safe to call more than once for the same event (only the first call
 *  through the dedup guard actually grants). Never throws: a malformed or
 *  already-claimed event is simply ignored, matching the webhook's
 *  "ack fast, best-effort process" pattern (see the controller). */
export async function handleCheckoutCompleted(event: Stripe.Event): Promise<void> {
  const claimed = await claimEvent(event.id);
  if (!claimed) return;

  const session = event.data.object as Stripe.Checkout.Session;
  const organizationId = session.metadata?.organizationId;
  const credits = Number(session.metadata?.credits);
  if (!organizationId || !Number.isFinite(credits) || credits <= 0) return;

  await grantCredits(organizationId, credits, "credit_purchase", "purchase");
}

export { CREDIT_PACKAGES };
