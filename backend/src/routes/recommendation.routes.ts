import { Router } from "express";

import {
  listRecommendations,
  updateRecommendationStatus,
  refreshRecommendations,
} from "@/controllers/recommendation.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import { updateRecommendationStatusSchema } from "@/validators/recommendation.validator";

const router = Router();

// All recommendation endpoints require a valid Bearer token.
router.use(authenticate);

router.get("/", listRecommendations);
// Internal/ops trigger — not surfaced in the UI (static path before "/:id").
router.post("/refresh", refreshRecommendations);
router.patch(
  "/:id/status",
  validate(updateRecommendationStatusSchema),
  updateRecommendationStatus
);

export default router;
