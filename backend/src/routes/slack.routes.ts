import { Router } from "express";

import {
  createSlackLinkCode,
  getSlackStatus,
  startSlackInstall,
} from "@/controllers/slack.controller";
import { authenticate } from "@/middlewares/auth.middleware";

const router = Router();

// The Events webhook (`/api/slack/events`) and the OAuth callback
// (`/api/slack/oauth/callback`) are both mounted separately in app.ts —
// neither can carry a Bearer token (Slack calls them directly), and the
// Events webhook additionally needs the RAW request body for signature
// verification, ahead of the global `express.json()` this router's parent
// chain sits behind.
router.use(authenticate);

router.get("/status", getSlackStatus);
router.get("/install", startSlackInstall);
router.post("/link-code", createSlackLinkCode);

export default router;
