import { Request, Response } from "express";
import { env } from "@/config/env";

/**
 * Health check controller.
 * Confirms the server is up — used by monitoring and deployment platforms.
 */
export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({
    success: true,
    data: {
      status: "ok",
      service: "billing-manager-backend",
      environment: env.nodeEnv,
      uptime: process.uptime(),
    },
  });
}
