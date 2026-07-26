import { Router } from "express";

import { agentChat, resetAgentChat } from "@/controllers/agent-chat.controller";
import { authenticate } from "@/middlewares/auth.middleware";
import { validate } from "@/middlewares/validate";
import { agentChatSchema } from "@/validators/agent-chat.validator";

const router = Router();

// All agent chat endpoints require a valid Bearer token.
router.use(authenticate);

router.post("/", validate(agentChatSchema), agentChat);
router.delete("/", resetAgentChat);

export default router;
