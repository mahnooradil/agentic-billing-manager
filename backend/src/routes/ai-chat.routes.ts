import { Router } from "express";

import { chat } from "@/controllers/ai-chat.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import { chatSchema } from "@/validators/ai-chat.validator";

const router = Router();

// All AI chat endpoints require a valid Bearer token.
router.use(authenticate);

router.post("/", validate(chatSchema), chat);

export default router;
