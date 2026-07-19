import { Router } from "express";

import {
  listBillingRecords,
  getBillingStats,
  getBillingRecord,
  createBillingRecord,
  updateBillingRecord,
  deleteBillingRecord,
} from "@/controllers/billing.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import {
  createBillingSchema,
  updateBillingSchema,
} from "@/validators/billing.validator";

const router = Router();

// All billing endpoints require a valid Bearer token.
router.use(authenticate);

router.get("/", listBillingRecords);
// Static path must be registered before the "/:id" param route.
router.get("/stats", getBillingStats);
router.post("/", validate(createBillingSchema), createBillingRecord);
router.get("/:id", getBillingRecord);
router.put("/:id", validate(updateBillingSchema), updateBillingRecord);
router.delete("/:id", deleteBillingRecord);

export default router;
