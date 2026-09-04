import { describe, it, expect } from "vitest";
import { jobLockKey, msUntilNextUtcHour } from "./job-lock";

describe("jobLockKey", () => {
  it("is stable for a given job name", () => {
    expect(jobLockKey("data-retention")).toBe(jobLockKey("data-retention"));
  });

  it("gives each job its own key", () => {
    const keys = new Set(
      ["reflection", "data-retention", "video-retention-cap-sweep", "stale-account-video-sweep"].map(jobLockKey),
    );
    expect(keys.size).toBe(4);
  });

  it("stays inside signed 64-bit range so Postgres bigint accepts it", () => {
    for (const name of ["reflection", "data-retention", "video-retention-cap-sweep", "stale-account-video-sweep"]) {
      const v = BigInt(jobLockKey(name));
      expect(v >= -(2n ** 63n)).toBe(true);
      expect(v <= 2n ** 63n - 1n).toBe(true);
    }
  });

  it("does not collide with the small integers claimRosterSeat locks on (coach IDs)", () => {
    for (const name of ["reflection", "data-retention", "video-retention-cap-sweep", "stale-account-video-sweep"]) {
      expect(Math.abs(Number(BigInt(jobLockKey(name))))).toBeGreaterThan(1_000_000);
    }
  });
});

describe("msUntilNextUtcHour", () => {
  it("waits until later today when the hour is still ahead", () => {
    const now = new Date("2026-09-04T06:00:00.000Z");
    expect(msUntilNextUtcHour(9, now)).toBe(3 * 60 * 60 * 1000);
  });

  it("rolls over to tomorrow when the hour has passed", () => {
    const now = new Date("2026-09-04T11:30:00.000Z");
    expect(msUntilNextUtcHour(9, now)).toBe(21.5 * 60 * 60 * 1000);
  });

  it("never returns zero, so a boot exactly on the hour does not fire immediately", () => {
    const now = new Date("2026-09-04T09:00:00.000Z");
    expect(msUntilNextUtcHour(9, now)).toBe(24 * 60 * 60 * 1000);
  });
});
