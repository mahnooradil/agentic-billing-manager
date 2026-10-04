import { Router } from "express";

import { listAuditLog } from "@/controllers/audit-log.controller";
import { authenticate } from "@/middlewares/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/", listAuditLog);

export default router;
