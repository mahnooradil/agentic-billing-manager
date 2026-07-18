/**
 * Centralized, typed access to environment variables.
 * Loaded once at startup so the rest of the app never touches `process.env`.
 */
import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5000),
  // Comma-separated list of allowed origins for CORS (e.g. the frontend URL).
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
} as const;

export const isProduction = env.nodeEnv === "production";
