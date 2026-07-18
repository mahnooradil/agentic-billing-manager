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
  // MongoDB Atlas connection string. Presence is validated at connect time
  // (see config/database.ts) so startup can fail gracefully with a clear error.
  mongoUri: process.env.MONGODB_URI ?? "",
} as const;

export const isProduction = env.nodeEnv === "production";
