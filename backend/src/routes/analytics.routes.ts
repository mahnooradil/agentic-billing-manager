import { Router } from "express";

import { getAnalyticsOverview } from "@/controllers/analytics.controller";
import { authenticate } from "@/middlewares/auth.middleware";

const router = Router();

// All analytics endpoints require a valid Bearer token.
router.use(authenticate);

router.get("/overview", getAnalyticsOverview);

export default router;
