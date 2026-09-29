import { Router } from "express";

import { getMyPlan, updateMyPlan, createPlanCheckout } from "@/controllers/plan.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import { updatePlanSchema, createPlanCheckoutSchema } from "@/validators/plan.validator";

const router = Router();

router.use(authenticate);

router.get("/", getMyPlan);
router.put("/", validate(updatePlanSchema), updateMyPlan);
router.post("/checkout", validate(createPlanCheckoutSchema), createPlanCheckout);

export default router;
