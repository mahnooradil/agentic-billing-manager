import { Router } from "express";

import { getMyCredits, createCreditsCheckoutSession } from "@/controllers/credits.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import { createCreditsCheckoutSchema } from "@/validators/credits.validator";

const router = Router();

router.use(authenticate);

router.get("/", getMyCredits);
router.post("/checkout", validate(createCreditsCheckoutSchema), createCreditsCheckoutSession);

export default router;
