import { Router } from "express";

import {
  getMySettings,
  updateMySettings,
} from "@/controllers/user-settings.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import { updateUserSettingsSchema } from "@/validators/user-settings.validator";

const router = Router();

// All settings endpoints require a valid Bearer token.
router.use(authenticate);

router.get("/", getMySettings);
router.put("/", validate(updateUserSettingsSchema), updateMySettings);

export default router;
