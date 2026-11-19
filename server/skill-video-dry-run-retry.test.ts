import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ db: {} }));
const { msUntilAfterQuotaReset } = await import("./skill-video-dry-run-once");

// The skill-drill dry run that YouTube refused on 2026-11-19 retries just after the daily quota
// resets (midnight Pacific, 08:00 UTC), not on the next deploy.
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
// 23:30 to 08:15 the next morning.
const MINUTES_FROM_2330_TO_0815 = 8 * 60 + 45;
const HOURS_IN_DAY = 24;

describe("the retry after YouTube's quota resets", () => {
  it("waits until 08:15 UTC the next morning when the evening run was refused", () => {
    const at = new Date("2026-11-19T23:30:00Z");
    expect(msUntilAfterQuotaReset(at)).toBe(MINUTES_FROM_2330_TO_0815 * MINUTE);
  });

  it("goes to the next day when 08:15 has already passed today", () => {
    const at = new Date("2026-11-19T08:15:00Z");
    expect(msUntilAfterQuotaReset(at)).toBe(HOURS_IN_DAY * HOUR);
  });
});
