import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import type Stripe from "stripe";

import { env } from "@/config/env";
import { Organization } from "@/models/organization.model";
import { Subscription } from "@/models/subscription.model";
import { Notification } from "@/models/notification.model";
import {
  applySubscriptionEvent,
  notifySubscriptionPaymentFailed,
  assertNoLiveStripeKeyOutsideProduction,
} from "@/services/payments/stripe-subscription.service";

const PRICE_PRO = "price_test_pro";
const PRICE_BUSINESS = "price_test_business";

/**
 * Task 10's own acceptance test matrix: new subscription, upgrade,
 * downgrade with proration, cancel-at-period-end, immediate cancel,
 * payment failure, duplicate webhook, out-of-order webhook. Every event is
 * a realistic, hand-built `Stripe.Event`-shaped fixture — no live Stripe
 * account exists in this environment (confirmed: `STRIPE_SECRET_KEY` is
 * unset), so `applySubscriptionEvent`/`notifySubscriptionPaymentFailed` are
 * exercised directly against already-parsed events, the same object shape
 * the webhook controller hands them after signature verification — that
 * verification step itself is Stripe SDK code, not ours, and isn't
 * re-tested here.
 *
 * "refund" (the matrix's 9th scenario) is NOT covered — no `charge.
 * refunded`/subscription-refund handling exists in this codebase yet for
 * either the credit-purchase flow or this one; disclosed as a real,
 * deliberate gap, not silently skipped.
 */
describe("Stripe subscription webhook handling (Task 10)", () => {
  beforeAll(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake_for_tests");
    (env as unknown as { stripeSecretKey: string }).stripeSecretKey = "sk_test_fake_for_tests";
    (env as unknown as { stripePricePro: string }).stripePricePro = PRICE_PRO;
    (env as unknown as { stripePriceBusiness: string }).stripePriceBusiness = PRICE_BUSINESS;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  async function createOrg() {
    return Organization.create({ name: "Test Org", stripeCustomerId: `cus_${Date.now()}` });
  }

  let eventCounter = 0;
  function subscriptionEvent(
    type: Stripe.Event["type"],
    organizationId: string,
    overrides: {
      priceId?: string;
      status?: string;
      cancelAtPeriodEnd?: boolean;
      subscriptionId?: string;
      createdAt?: Date;
      currentPeriodEnd?: Date;
    } = {}
  ): Stripe.Event {
    eventCounter++;
    const subscriptionId = overrides.subscriptionId ?? `sub_test_${organizationId}`;
    const priceId = overrides.priceId ?? PRICE_PRO;
    const status = overrides.status ?? "active";
    const currentPeriodEnd = overrides.currentPeriodEnd ?? new Date(Date.now() + 30 * 86_400_000);

    return {
      id: `evt_test_${eventCounter}`,
      object: "event",
      type,
      created: Math.floor((overrides.createdAt ?? new Date()).getTime() / 1000),
      data: {
        object: {
          id: subscriptionId,
          object: "subscription",
          customer: "cus_test",
          status,
          cancel_at_period_end: overrides.cancelAtPeriodEnd ?? false,
          created: Math.floor(Date.now() / 1000),
          metadata: { organizationId },
          items: {
            data: [
              {
                price: { id: priceId },
                current_period_end: Math.floor(currentPeriodEnd.getTime() / 1000),
              },
            ],
          },
        },
      },
    } as unknown as Stripe.Event;
  }

  it("new subscription: creates a Subscription record and grants the tier", async () => {
    const org = await createOrg();
    const event = subscriptionEvent("customer.subscription.created", org._id.toString());

    await applySubscriptionEvent(event);

    const sub = await Subscription.findOne({ organization: org._id });
    expect(sub?.planTier).toBe("Pro");
    expect(sub?.status).toBe("active");

    const reloaded = await Organization.findById(org._id);
    expect(reloaded?.planTier).toBe("Pro");
  });

  it("upgrade: a later subscription.updated with a different price switches the tier", async () => {
    const org = await createOrg();
    await applySubscriptionEvent(
      subscriptionEvent("customer.subscription.created", org._id.toString(), {
        createdAt: new Date(Date.now() - 60_000),
      })
    );

    await applySubscriptionEvent(
      subscriptionEvent("customer.subscription.updated", org._id.toString(), {
        priceId: PRICE_BUSINESS,
        createdAt: new Date(),
      })
    );

    const reloaded = await Organization.findById(org._id);
    expect(reloaded?.planTier).toBe("Business");
    const sub = await Subscription.findOne({ organization: org._id });
    expect(sub?.planTier).toBe("Business");
  });

  it("downgrade with proration: Stripe's own price/period-end change is reflected as-is (no local proration math)", async () => {
    const org = await createOrg();
    await applySubscriptionEvent(
      subscriptionEvent("customer.subscription.created", org._id.toString(), {
        priceId: PRICE_BUSINESS,
        createdAt: new Date(Date.now() - 60_000),
      })
    );

    const newPeriodEnd = new Date(Date.now() + 15 * 86_400_000);
    await applySubscriptionEvent(
      subscriptionEvent("customer.subscription.updated", org._id.toString(), {
        priceId: PRICE_PRO,
        currentPeriodEnd: newPeriodEnd,
        createdAt: new Date(),
      })
    );

    const reloaded = await Organization.findById(org._id);
    expect(reloaded?.planTier).toBe("Pro");
    const sub = await Subscription.findOne({ organization: org._id });
    // Stripe timestamps are always whole seconds — compare with the same
    // second-level rounding the service itself applies, not sub-second
    // precision the real API would never actually send.
    expect(sub?.currentPeriodEnd.getTime()).toBe(Math.floor(newPeriodEnd.getTime() / 1000) * 1000);
  });

  it("cancel-at-period-end: tier is kept until the period actually ends", async () => {
    const org = await createOrg();
    await applySubscriptionEvent(
      subscriptionEvent("customer.subscription.created", org._id.toString(), {
        createdAt: new Date(Date.now() - 60_000),
      })
    );

    await applySubscriptionEvent(
      subscriptionEvent("customer.subscription.updated", org._id.toString(), {
        cancelAtPeriodEnd: true,
        createdAt: new Date(),
      })
    );

    const reloaded = await Organization.findById(org._id);
    // Still Pro — status is still "active", only a future intent to cancel.
    expect(reloaded?.planTier).toBe("Pro");
    const sub = await Subscription.findOne({ organization: org._id });
    expect(sub?.cancelAtPeriodEnd).toBe(true);
    expect(sub?.status).toBe("active");
  });

  it("immediate cancel: subscription.deleted reverts the org to Free right away", async () => {
    const org = await createOrg();
    await applySubscriptionEvent(
      subscriptionEvent("customer.subscription.created", org._id.toString(), {
        createdAt: new Date(Date.now() - 60_000),
      })
    );

    await applySubscriptionEvent(
      subscriptionEvent("customer.subscription.deleted", org._id.toString(), {
        status: "canceled",
        createdAt: new Date(),
      })
    );

    const reloaded = await Organization.findById(org._id);
    expect(reloaded?.planTier).toBe("Free");
    const sub = await Subscription.findOne({ organization: org._id });
    expect(sub?.status).toBe("canceled");
  });

  it("payment failure: past_due status immediately drops the org to Free (Subscription record kept for recovery)", async () => {
    const org = await createOrg();
    await applySubscriptionEvent(
      subscriptionEvent("customer.subscription.created", org._id.toString(), {
        createdAt: new Date(Date.now() - 60_000),
      })
    );

    await applySubscriptionEvent(
      subscriptionEvent("customer.subscription.updated", org._id.toString(), {
        status: "past_due",
        createdAt: new Date(),
      })
    );

    const reloaded = await Organization.findById(org._id);
    expect(reloaded?.planTier).toBe("Free");
    const sub = await Subscription.findOne({ organization: org._id });
    expect(sub?.status).toBe("past_due");
    expect(sub?.planTier).toBe("Pro"); // the record remembers what tier to resume if payment recovers

    // A retry that succeeds (status back to active) resumes the tier.
    await applySubscriptionEvent(
      subscriptionEvent("customer.subscription.updated", org._id.toString(), {
        status: "active",
        createdAt: new Date(Date.now() + 1000),
      })
    );
    const recovered = await Organization.findById(org._id);
    expect(recovered?.planTier).toBe("Pro");
  });

  it("invoice.payment_failed sends exactly one notification per event, even if delivered twice", async () => {
    const org = await createOrg();
    const invoiceEvent = {
      id: "evt_invoice_failed_1",
      object: "event",
      type: "invoice.payment_failed",
      created: Math.floor(Date.now() / 1000),
      data: { object: { customer: org.stripeCustomerId } },
    } as unknown as Stripe.Event;

    await notifySubscriptionPaymentFailed(invoiceEvent);
    // A Stripe redelivery of the exact same event id.
    await notifySubscriptionPaymentFailed(invoiceEvent);

    const notifications = await Notification.find({
      organization: org._id,
      category: "billing",
    });
    expect(notifications).toHaveLength(1);
  });

  it("duplicate webhook: the exact same event id applied twice only takes effect once", async () => {
    const org = await createOrg();
    const event = subscriptionEvent("customer.subscription.created", org._id.toString());

    await applySubscriptionEvent(event);
    // Stripe redelivers the identical event (same id) — a real, common case.
    await applySubscriptionEvent(event);

    const count = await Subscription.countDocuments({ organization: org._id });
    expect(count).toBe(1);
  });

  it("out-of-order webhook: an older event delivered after a newer one is ignored, never regresses state", async () => {
    const org = await createOrg();
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);

    // The NEWER event (an upgrade to Business) arrives and is applied first.
    await applySubscriptionEvent(
      subscriptionEvent("customer.subscription.created", org._id.toString(), {
        priceId: PRICE_BUSINESS,
        createdAt: now,
      })
    );

    // An OLDER event (still reporting Pro) is delivered late, after the
    // newer one already landed — must not revert the org back to Pro.
    await applySubscriptionEvent(
      subscriptionEvent("customer.subscription.updated", org._id.toString(), {
        priceId: PRICE_PRO,
        createdAt: earlier,
      })
    );

    const reloaded = await Organization.findById(org._id);
    expect(reloaded?.planTier).toBe("Business");
  });

  it("an unrecognized Stripe Price (e.g. the product was reconfigured) never leaves the org entitled to an unknown tier", async () => {
    const org = await createOrg();
    await applySubscriptionEvent(
      subscriptionEvent("customer.subscription.created", org._id.toString(), {
        priceId: "price_totally_unknown",
        createdAt: new Date(),
      })
    );

    const reloaded = await Organization.findById(org._id);
    expect(reloaded?.planTier).toBe("Free");
  });
});

describe("assertNoLiveStripeKeyOutsideProduction (Task 10)", () => {
  it("throws when a live key is set outside production", () => {
    (env as unknown as { stripeSecretKey: string }).stripeSecretKey = "sk_live_realkey";
    expect(() => assertNoLiveStripeKeyOutsideProduction()).toThrow(/LIVE key/);
  });

  it("does not throw for a test key", () => {
    (env as unknown as { stripeSecretKey: string }).stripeSecretKey = "sk_test_fakekey";
    expect(() => assertNoLiveStripeKeyOutsideProduction()).not.toThrow();
  });

  it("does not throw when no key is set at all (feature simply unconfigured)", () => {
    (env as unknown as { stripeSecretKey: string }).stripeSecretKey = "";
    expect(() => assertNoLiveStripeKeyOutsideProduction()).not.toThrow();
  });
});
