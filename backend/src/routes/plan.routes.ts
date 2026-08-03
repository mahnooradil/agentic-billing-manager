import { Router } from "express";

import { getMyPlan, updateMyPlan } from "@/controllers/plan.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import { updatePlanSchema } from "@/validators/plan.validator";

const router = Router();

router.use(authenticate);

router.get("/", getMyPlan);
router.put("/", validate(updatePlanSchema), updateMyPlan);

export default router;
