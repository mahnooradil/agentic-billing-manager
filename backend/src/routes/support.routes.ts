import { Router } from "express";

import {
  createSupportRequestHandler,
  listSupportRequestsHandler,
} from "@/controllers/support.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import { createSupportRequestSchema } from "@/validators/support.validator";

const router = Router();

router.use(authenticate);

router.get("/", listSupportRequestsHandler);
router.post("/", validate(createSupportRequestSchema), createSupportRequestHandler);

export default router;
