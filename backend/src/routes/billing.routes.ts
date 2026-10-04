import { Router } from "express";

import {
  listBillingRecords,
  getBillingStats,
  exportBillingRecords,
  importBillingRecords,
  getDuplicateCandidates,
  getBillingRecord,
  createBillingRecord,
  updateBillingRecord,
  deleteBillingRecord,
  mergeBillingRecords,
  unmergeBillingRecord,
  dismissDuplicateCandidate,
} from "@/controllers/billing.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import {
  createBillingSchema,
  updateBillingSchema,
  importBillingSchema,
  mergeBillingSchema,
} from "@/validators/billing.validator";

const router = Router();

// All billing endpoints require a valid Bearer token.
router.use(authenticate);

router.get("/", listBillingRecords);
// Static paths must be registered before the "/:id" param route.
router.get("/stats", getBillingStats);
router.get("/export", exportBillingRecords);
router.get("/duplicate-candidates", getDuplicateCandidates);
router.post("/import", validate(importBillingSchema), importBillingRecords);
router.post("/", validate(createBillingSchema), createBillingRecord);
router.get("/:id", getBillingRecord);
router.put("/:id", validate(updateBillingSchema), updateBillingRecord);
router.delete("/:id", deleteBillingRecord);
router.post("/:id/merge", validate(mergeBillingSchema), mergeBillingRecords);
router.post("/:id/unmerge", unmergeBillingRecord);
router.post("/:id/dismiss-duplicate", dismissDuplicateCandidate);

export default router;
