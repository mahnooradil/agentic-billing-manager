import { Router } from "express";

import { listPendingVendors, confirmVendor, rejectVendor } from "@/controllers/vendor.controller";
import { authenticate } from "@/middlewares/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/pending", listPendingVendors);
router.post("/:id/confirm", confirmVendor);
router.post("/:id/reject", rejectVendor);

export default router;
