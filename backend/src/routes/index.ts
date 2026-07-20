import { Router } from "express";
import healthRoutes from "@/routes/health.routes";
import authRoutes from "@/routes/auth.routes";
import platformRoutes from "@/routes/platform.routes";
import dashboardRoutes from "@/routes/dashboard.routes";
import billingRoutes from "@/routes/billing.routes";
import aiSettingsRoutes from "@/routes/ai-settings.routes";
import aiChatRoutes from "@/routes/ai-chat.routes";
import aiRecommendationsRoutes from "@/routes/ai-recommendations.routes";
import webhookRoutes from "@/routes/webhook.routes";
import analyticsRoutes from "@/routes/analytics.routes";

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
router.use("/ai/settings", aiSettingsRoutes);
router.use("/ai/chat", aiChatRoutes);
router.use("/ai/recommendations", aiRecommendationsRoutes);
router.use("/webhooks", webhookRoutes);
router.use("/analytics", analyticsRoutes);

export default router;
