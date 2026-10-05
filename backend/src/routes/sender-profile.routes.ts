import { Router } from "express";

import {
  listSenderProfiles,
  suppressSenderProfile,
  restoreSenderProfile,
} from "@/controllers/sender-profile.controller";
import { authenticate } from "@/middlewares/auth.middleware";

const router = Router();

router.use(authenticate);

router.get("/", listSenderProfiles);
router.post("/:id/suppress", suppressSenderProfile);
router.post("/:id/restore", restoreSenderProfile);

export default router;
