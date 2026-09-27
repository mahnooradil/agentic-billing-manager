/**
 * Stripe Events webhook (`POST /api/stripe/webhook`, mounted directly in
 * app.ts — NOT behind `authenticate`, since Stripe has no Bearer token to
 * send; the signed payload is the trust boundary instead). Mirrors
 * services/slack's webhook controller: ack fast, process after.
 */
import { asyncHandler } from "@/utils/asyncHandler";
import { AppError } from "@/utils/appError";
import {
  isStripeConfigured,
  verifyWebhookEvent,
  handleCheckoutCompleted,
} from "@/services/payments/stripe-checkout.service";

/** POST /api/stripe/webhook — body is the RAW request bytes (see app.ts). */
export const stripeWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers["stripe-signature"] as string | undefined;
  if (!isStripeConfigured() || !signature) {
    throw new AppError("Stripe isn't configured on this server.", 503);
  }

  let event;
  try {
    event = verifyWebhookEvent(req.body as Buffer, signature);
  } catch {
    throw new AppError("Invalid signature", 401);
  }

  // ACK immediately — Stripe retries on anything but a fast 2xx, and
  // granting credits can wait a beat longer than that.
  res.status(200).send();

  if (event.type === "checkout.session.completed") {
    void handleCheckoutCompleted(event).catch(() => {
      // Best-effort — nothing left to respond to; a missed grant here would
      // need a manual reconciliation, same as any other webhook failure.
    });
  }
});
