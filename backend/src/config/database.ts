/**
 * Centralized MongoDB (Mongoose) connection management.
 *
 * Responsibilities:
 *  - Connect to MongoDB using production-ready options.
 *  - Emit clear, reusable log messages on state changes.
 *  - Surface connection failures so the caller can exit gracefully.
 *  - Expose an explicit disconnect for graceful shutdown.
 *
 * No schemas, models, or collections are defined here — connection only.
 */
import mongoose from "mongoose";

import { env, isProduction } from "@/config/env";

/**
 * Reusable log messages for database lifecycle events.
 * Centralized so there are no duplicated / magic strings across the codebase.
 */
export const DB_LOG_MESSAGES = {
  connected: "✅ Database Connected — MongoDB connection established.",
  disconnected: "⚠️  Database Disconnected — MongoDB connection lost.",
  reconnected: "🔄 Database Reconnected — MongoDB connection restored.",
  connectionFailed: "❌ Connection Failed — could not connect to MongoDB.",
} as const;

/**
 * Production-ready Mongoose connection options.
 * Only current, non-deprecated options are used.
 */
const CONNECTION_OPTIONS: mongoose.ConnectOptions = {
  // Fail fast if no server is reachable instead of hanging indefinitely.
  serverSelectionTimeoutMS: 10_000,
  // Close idle sockets after inactivity.
  socketTimeoutMS: 45_000,
  // Connection pool sizing for concurrent workloads.
  maxPoolSize: 10,
  minPoolSize: 2,
  // Skip automatic index builds in production for predictable startup/perf.
  autoIndex: !isProduction,
};

/** Tracks whether listeners have been registered to avoid duplicate handlers. */
let listenersRegistered = false;

/** Attaches connection lifecycle listeners exactly once. */
function registerConnectionListeners(): void {
  if (listenersRegistered) return;

  const { connection } = mongoose;

  connection.on("connected", () => console.log(DB_LOG_MESSAGES.connected));
  connection.on("disconnected", () => console.warn(DB_LOG_MESSAGES.disconnected));
  connection.on("reconnected", () => console.log(DB_LOG_MESSAGES.reconnected));
  connection.on("error", (error: Error) =>
    console.error(DB_LOG_MESSAGES.connectionFailed, error.message)
  );

  listenersRegistered = true;
}

/**
 * Connects to MongoDB.
 * Throws on failure so the bootstrap layer can log and exit gracefully.
 */
export async function connectDatabase(): Promise<void> {
  if (!env.mongoUri) {
    throw new Error(
      "MONGODB_URI is not defined. Set it in backend/.env (see .env.example)."
    );
  }

  // Return early if already connected (readyState 1 = connected).
  if (mongoose.connection.readyState === 1) return;

  // Reject queries against undefined paths — safer defaults.
  mongoose.set("strictQuery", true);

  registerConnectionListeners();

  try {
    await mongoose.connect(env.mongoUri, CONNECTION_OPTIONS);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${DB_LOG_MESSAGES.connectionFailed} ${message}`);
    // Re-throw so the caller decides how to exit.
    throw error;
  }
}

/** Gracefully closes the MongoDB connection (used during shutdown). */
export async function disconnectDatabase(): Promise<void> {
  // readyState 0 = disconnected — nothing to close.
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
}
