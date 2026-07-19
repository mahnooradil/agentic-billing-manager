import { Router } from "express";
import healthRoutes from "@/routes/health.routes";
import authRoutes from "@/routes/auth.routes";
import platformRoutes from "@/routes/platform.routes";
import dashboardRoutes from "@/routes/dashboard.routes";
import billingRoutes from "@/routes/billing.routes";
import aiSettingsRoutes from "@/routes/ai-settings.routes";

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

export default router;
