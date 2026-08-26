import { Router } from "express";

import { createSlackLinkCode } from "@/controllers/slack.controller";
import { authenticate } from "@/middlewares/auth.middleware";

const router = Router();

// The Events webhook (`/api/slack/events`) is mounted separately in app.ts —
// it needs the RAW request body for signature verification, so it must sit
// ahead of the global `express.json()` this router's parent chain sits behind.
router.use(authenticate);

router.post("/link-code", createSlackLinkCode);

export default router;
