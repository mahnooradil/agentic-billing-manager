import { Router } from "express";

import { previewInvitation, acceptInvitation } from "@/controllers/invitation.controller";
import { authenticate } from "@/middlewares/auth.middleware";

const router = Router();

// Public — no account needed yet to see what an invite link offers.
router.get("/:token", previewInvitation);
// Authenticated — for an email that already has an account.
router.post("/:token/accept", authenticate, acceptInvitation);

export default router;
