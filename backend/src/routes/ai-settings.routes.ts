import { Router } from "express";

import {
  getMyAiSettings,
  upsertAiSettings,
  deleteAiSettings,
} from "@/controllers/ai-settings.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import { upsertAiSettingsSchema } from "@/validators/ai-settings.validator";

const router = Router();

// All AI settings endpoints require a valid Bearer token.
router.use(authenticate);

router.get("/", getMyAiSettings);
router.put("/", validate(upsertAiSettingsSchema), upsertAiSettings);
router.delete("/", deleteAiSettings);

export default router;
