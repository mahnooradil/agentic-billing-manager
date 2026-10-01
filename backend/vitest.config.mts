import path from "path";

import { defineConfig } from "vitest/config";

/**
 * Vitest config. Tests never touch the real Atlas database — `src/test/setup.ts`
 * spins up an in-memory MongoDB (mongodb-memory-server) per test run and
 * points the app's shared mongoose connection at that instead. `env` below
 * supplies the minimum config the app reads at import time (JWT_SECRET etc.)
 * so importing app code doesn't throw before a test even runs.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-only-jwt-secret-never-used-outside-ci",
      JWT_EXPIRES_IN: "1d",
      // Fake — the real Anthropic client is always mocked in tests that
      // need one (see ai-invoice-extractor.test.ts); this only exists so
      // `isAiExtractionConfigured()`/`getClient()`'s presence check passes.
      ANTHROPIC_API_KEY: "test-only-anthropic-key-never-used-outside-ci",
      // Fake — AI_ENCRYPTION_KEY is now REQUIRED (WP-7 hardening, see
      // utils/crypto.ts); this only exists so `assertEncryptionKeyConfigured()`/
      // `deriveKey()`'s presence check passes in tests that encrypt/decrypt.
      AI_ENCRYPTION_KEY: "test-only-encryption-key-never-used-outside-ci",
    },
  },
});
