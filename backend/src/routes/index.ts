import { Router } from "express";
import healthRoutes from "@/routes/health.routes";
import authRoutes from "@/routes/auth.routes";
import platformRoutes from "@/routes/platform.routes";
import dashboardRoutes from "@/routes/dashboard.routes";

/**
 * Root API router. All feature routers are mounted here so the
 * app entry point stays clean. New routes get added in later phases.
 */
const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/platforms", platformRoutes);
router.use("/dashboard", dashboardRoutes);

export default router;
