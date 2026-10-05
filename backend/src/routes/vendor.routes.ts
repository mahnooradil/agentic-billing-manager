import { Router } from "express";

import {
  listPendingVendors,
  confirmVendor,
  rejectVendor,
  listVendorsDueForRating,
  rateVendor,
} from "@/controllers/vendor.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import { rateVendorSchema } from "@/validators/vendor.validator";

const router = Router();

router.use(authenticate);

router.get("/pending", listPendingVendors);
router.get("/due-for-rating", listVendorsDueForRating);
router.post("/:id/confirm", confirmVendor);
router.post("/:id/reject", rejectVendor);
router.post("/:id/rate", validate(rateVendorSchema), rateVendor);

export default router;
