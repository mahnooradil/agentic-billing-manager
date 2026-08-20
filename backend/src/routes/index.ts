import { Router } from "express";
import healthRoutes from "@/routes/health.routes";
import authRoutes from "@/routes/auth.routes";
import platformRoutes from "@/routes/platform.routes";
import dashboardRoutes from "@/routes/dashboard.routes";
import billingRoutes from "@/routes/billing.routes";
import analyticsRoutes from "@/routes/analytics.routes";
import recommendationRoutes from "@/routes/recommendation.routes";
import notificationRoutes from "@/routes/notification.routes";
import userSettingsRoutes from "@/routes/user-settings.routes";
import platformConnectionRoutes from "@/routes/platform-connection.routes";
import agentChatRoutes from "@/routes/agent-chat.routes";
import planRoutes from "@/routes/plan.routes";
import supportRoutes from "@/routes/support.routes";
import creditsRoutes from "@/routes/credits.routes";
import organizationRoutes from "@/routes/organization.routes";
import invitationRoutes from "@/routes/invitation.routes";

/**
 * Root API router. All feature routers are mounted here so the
 * app entry point stays clean. New routes get added in later phases.
 */
const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/platforms", platformRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/billing", billingRoutes);
// "/webhooks" (Phase 8C) was removed entirely — it had no per-user concept (a
// single shared secret, no owning user on the ingested records) and predates
// the data-isolation fix. No frontend ever called it. Rebuild with a real
// per-user design (e.g. a per-user webhook token) if this is needed again.
router.use("/analytics", analyticsRoutes);
router.use("/recommendations", recommendationRoutes);
router.use("/notifications", notificationRoutes);
router.use("/settings", userSettingsRoutes);
router.use("/platform-connections", platformConnectionRoutes);
router.use("/agent/chat", agentChatRoutes);
router.use("/plan", planRoutes);
router.use("/support", supportRoutes);
router.use("/credits", creditsRoutes);
router.use("/organization", organizationRoutes);
router.use("/invitations", invitationRoutes);

export default router;
