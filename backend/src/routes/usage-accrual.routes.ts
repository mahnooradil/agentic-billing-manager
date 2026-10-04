import { Router } from "express";

import { listUsageAccruals } from "@/controllers/usage-accrual.controller";
import { authenticate } from "@/middlewares/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/", listUsageAccruals);

export default router;
