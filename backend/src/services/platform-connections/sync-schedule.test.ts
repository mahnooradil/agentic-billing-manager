import { describe, expect, it } from "vitest";

import {
  DEFAULT_BILLING_SYNC_INTERVAL_MINUTES,
  DEFAULT_EMAIL_SYNC_INTERVAL_MINUTES,
  getEffectiveSyncIntervalMinutes,
  isSyncDue,
} from "@/services/platform-connections/sync-schedule";

describe("sync-schedule — per-connection sync-frequency overrides", () => {
  describe("getEffectiveSyncIntervalMinutes", () => {
    it("falls back to the given default when no override is set", () => {
      expect(
        getEffectiveSyncIntervalMinutes({ syncIntervalMinutes: undefined }, DEFAULT_EMAIL_SYNC_INTERVAL_MINUTES)
      ).toBe(60);
    });

    it("uses the connection's own override when set", () => {
      expect(
        getEffectiveSyncIntervalMinutes({ syncIntervalMinutes: 15 }, DEFAULT_EMAIL_SYNC_INTERVAL_MINUTES)
      ).toBe(15);
    });
  });

  describe("isSyncDue", () => {
    it("a never-synced connection is always due", () => {
      expect(isSyncDue({ syncIntervalMinutes: undefined, lastSyncAt: undefined }, 60)).toBe(true);
    });

    it("is NOT due when less time than the default interval has passed", () => {
      const now = new Date("2026-01-01T12:00:00Z");
      const lastSyncAt = new Date("2026-01-01T11:30:00Z"); // 30 min ago
      expect(isSyncDue({ syncIntervalMinutes: undefined, lastSyncAt }, 60, now)).toBe(false);
    });

    it("is due once the default interval has fully elapsed", () => {
      const now = new Date("2026-01-01T12:00:00Z");
      const lastSyncAt = new Date("2026-01-01T11:00:00Z"); // exactly 60 min ago
      expect(isSyncDue({ syncIntervalMinutes: undefined, lastSyncAt }, 60, now)).toBe(true);
    });

    it("a 15-minute override is due sooner than the 60-minute default would be", () => {
      const now = new Date("2026-01-01T12:00:00Z");
      const lastSyncAt = new Date("2026-01-01T11:45:00Z"); // 15 min ago
      expect(isSyncDue({ syncIntervalMinutes: 15, lastSyncAt }, DEFAULT_EMAIL_SYNC_INTERVAL_MINUTES, now)).toBe(
        true
      );
      // Without the override, the same 15-minute gap would NOT be due yet.
      expect(isSyncDue({ syncIntervalMinutes: undefined, lastSyncAt }, DEFAULT_EMAIL_SYNC_INTERVAL_MINUTES, now)).toBe(
        false
      );
    });

    it("a 1440-minute (daily) override delays an otherwise-due billing-sync connection", () => {
      const now = new Date("2026-01-01T12:00:00Z");
      const lastSyncAt = new Date("2026-01-01T06:00:00Z"); // 6h ago — due under the default
      expect(
        isSyncDue({ syncIntervalMinutes: undefined, lastSyncAt }, DEFAULT_BILLING_SYNC_INTERVAL_MINUTES, now)
      ).toBe(true);
      expect(
        isSyncDue({ syncIntervalMinutes: 1440, lastSyncAt }, DEFAULT_BILLING_SYNC_INTERVAL_MINUTES, now)
      ).toBe(false);
    });
  });
});
