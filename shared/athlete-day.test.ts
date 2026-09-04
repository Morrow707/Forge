import { describe, expect, it } from "vitest";
import { shiftIsoDate, todayInZone, utcToday } from "./athlete-day";

describe("todayInZone", () => {
  // 2026-01-06T02:30:00Z is still 2026-01-05 across the Americas -- the
  // exact case that made an evening check-in file under tomorrow.
  const lateUtcEvening = new Date("2026-01-06T02:30:00Z");

  it("gives the local date, not the UTC one, for an evening in the Americas", () => {
    expect(utcToday(lateUtcEvening)).toBe("2026-01-06");
    expect(todayInZone("America/Los_Angeles", lateUtcEvening)).toBe("2026-01-05");
    expect(todayInZone("America/New_York", lateUtcEvening)).toBe("2026-01-05");
  });

  it("gives tomorrow's date for a zone already ahead of UTC", () => {
    const morningUtc = new Date("2026-01-05T22:00:00Z");
    expect(todayInZone("Asia/Tokyo", morningUtc)).toBe("2026-01-06");
    expect(todayInZone("Pacific/Auckland", morningUtc)).toBe("2026-01-06");
  });

  it("agrees with UTC for a zone at zero offset", () => {
    expect(todayInZone("UTC", lateUtcEvening)).toBe("2026-01-06");
  });

  it("falls back to UTC rather than throwing on a missing or unusable zone", () => {
    expect(todayInZone(null, lateUtcEvening)).toBe("2026-01-06");
    expect(todayInZone(undefined, lateUtcEvening)).toBe("2026-01-06");
    expect(todayInZone("", lateUtcEvening)).toBe("2026-01-06");
    expect(todayInZone("Mars/Olympus_Mons", lateUtcEvening)).toBe("2026-01-06");
  });

  it("tracks a daylight-saving change rather than a fixed offset", () => {
    // US DST ended 2025-11-02. 06:30Z is 23:30 the previous day at -07:00
    // and 01:30 the same day at -08:00.
    expect(todayInZone("America/Los_Angeles", new Date("2025-11-01T06:30:00Z"))).toBe("2025-10-31");
    expect(todayInZone("America/Los_Angeles", new Date("2025-11-03T06:30:00Z"))).toBe("2025-11-02");
  });
});

describe("shiftIsoDate", () => {
  it("moves whole calendar days in both directions", () => {
    expect(shiftIsoDate("2026-01-05", -1)).toBe("2026-01-04");
    expect(shiftIsoDate("2026-01-05", 1)).toBe("2026-01-06");
    expect(shiftIsoDate("2026-01-05", 0)).toBe("2026-01-05");
  });

  it("crosses month, year and leap-day boundaries", () => {
    expect(shiftIsoDate("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftIsoDate("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftIsoDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftIsoDate("2025-12-31", 1)).toBe("2026-01-01");
  });

  it("spans the windows the ACWR calculation actually uses", () => {
    expect(shiftIsoDate("2026-01-05", -6)).toBe("2025-12-30");
    expect(shiftIsoDate("2026-01-05", -27)).toBe("2025-12-09");
  });
});
