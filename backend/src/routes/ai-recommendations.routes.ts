import { Router } from "express";

import { generateRecommendations } from "@/controllers/ai-recommendations.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import { aiRecommendationsSchema } from "@/validators/ai-recommendations.validator";

const router = Router();

// All AI recommendation endpoints require a valid Bearer token.
router.use(authenticate);

router.post("/", validate(aiRecommendationsSchema), generateRecommendations);

export default router;
