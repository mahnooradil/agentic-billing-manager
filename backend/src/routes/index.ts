import { Router } from "express";
import healthRoutes from "@/routes/health.routes";

/**
 * Root API router. All feature routers are mounted here so the
 * app entry point stays clean. New routes get added in later phases.
 */
const router = Router();

router.use("/health", healthRoutes);

export default router;
