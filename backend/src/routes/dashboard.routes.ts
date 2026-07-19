import { Router } from "express";

import { getDashboardStats } from "@/controllers/dashboard.controller";
import { authenticate } from "@/middlewares/auth.middleware";

const router = Router();

// All dashboard endpoints require a valid Bearer token.
router.use(authenticate);

router.get("/stats", getDashboardStats);

export default router;
