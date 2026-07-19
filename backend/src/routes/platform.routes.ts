import { Router } from "express";

import {
  listPlatforms,
  getPlatform,
  createPlatform,
  updatePlatform,
  deletePlatform,
} from "@/controllers/platform.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import {
  createPlatformSchema,
  updatePlatformSchema,
} from "@/validators/platform.validator";

const router = Router();

// All platform endpoints require a valid Bearer token.
router.use(authenticate);

router.get("/", listPlatforms);
router.post("/", validate(createPlatformSchema), createPlatform);
router.get("/:id", getPlatform);
router.put("/:id", validate(updatePlatformSchema), updatePlatform);
router.delete("/:id", deletePlatform);

export default router;
