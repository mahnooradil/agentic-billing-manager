import { Router } from "express";

import { ingestBillingWebhook } from "@/controllers/webhook.controller";
import { verifyWebhookSecret } from "@/middlewares/verifyWebhookSecret";
import { validate } from "@/middlewares/validate";
import { webhookBillingSchema } from "@/validators/webhook.validator";

const router = Router();

// Shared-secret verification runs before validation/processing.
router.post(
  "/billing",
  verifyWebhookSecret,
  validate(webhookBillingSchema),
  ingestBillingWebhook
);

export default router;
