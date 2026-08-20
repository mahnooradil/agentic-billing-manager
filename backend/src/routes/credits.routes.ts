import { Router } from "express";

import { getMyCredits } from "@/controllers/credits.controller";
import { authenticate } from "@/middlewares/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/", getMyCredits);

export default router;
