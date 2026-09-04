import { describe, it, expect } from "vitest";
import {
  derivePrivacyTier,
  videoRetentionDaysForTier,
  TIER1_VIDEO_RETENTION_DAYS,
  TIER2_VIDEO_RETENTION_DAYS,
  GUARDIAN_NOTICE_LIVE,
} from "./privacy-tiers";

// Fixed reference date so a boundary test means the same thing every run.
const ASOF = new Date("2026-06-15T12:00:00Z");

describe("derivePrivacyTier", () => {
  it("puts a young child in tier 1", () => {
    expect(derivePrivacyTier("2020-01-01", ASOF)).toBe("tier1_under13");
  });

  it("keeps a 12-year-old in tier 1 the day before their 13th birthday", () => {
    expect(derivePrivacyTier("2013-06-16", ASOF)).toBe("tier1_under13");
  });

  it("moves them to tier 2 on their 13th birthday itself", () => {
    expect(derivePrivacyTier("2013-06-15", ASOF)).toBe("tier2_teen_13_17");
  });

  it("keeps a 17-year-old in tier 2 the day before their 18th birthday", () => {
    expect(derivePrivacyTier("2008-06-16", ASOF)).toBe("tier2_teen_13_17");
  });

  it("moves them to tier 3 on their 18th birthday itself", () => {
    expect(derivePrivacyTier("2008-06-15", ASOF)).toBe("tier3_adult_18plus");
  });

  it("puts a clear adult in tier 3", () => {
    expect(derivePrivacyTier("1990-03-02", ASOF)).toBe("tier3_adult_18plus");
  });

  it("handles the birthday month boundary in both directions", () => {
    // Birthday later this month -- not yet 13.
    expect(derivePrivacyTier("2013-06-30", ASOF)).toBe("tier1_under13");
    // Birthday earlier this month -- already 13.
    expect(derivePrivacyTier("2013-06-01", ASOF)).toBe("tier2_teen_13_17");
    // Birthday next month -- not yet 13.
    expect(derivePrivacyTier("2013-07-01", ASOF)).toBe("tier1_under13");
    // Birthday last month -- already 13.
    expect(derivePrivacyTier("2013-05-31", ASOF)).toBe("tier2_teen_13_17");
  });

  it("accepts a Date as well as an ISO string", () => {
    expect(derivePrivacyTier(new Date("2013-06-15T00:00:00Z"), ASOF)).toBe("tier2_teen_13_17");
    expect(derivePrivacyTier(new Date("2013-06-16T00:00:00Z"), ASOF)).toBe("tier1_under13");
  });

  it("reads a date-only string as UTC, so a birthday is not shifted by the host time zone", () => {
    // A bare YYYY-MM-DD parses as UTC midnight, and the comparison is
    // entirely in UTC getters -- so this holds wherever the test runs.
    expect(derivePrivacyTier("2013-06-15", new Date("2026-06-15T00:00:00Z"))).toBe("tier2_teen_13_17");
    expect(derivePrivacyTier("2013-06-15", new Date("2026-06-15T23:59:59Z"))).toBe("tier2_teen_13_17");
  });

  it("handles a Feb 29 birthday in a non-leap year without slipping a tier early", () => {
    // Turns 13 in 2025, a non-leap year. On Feb 28 they are still 12.
    expect(derivePrivacyTier("2012-02-29", new Date("2025-02-28T12:00:00Z"))).toBe("tier1_under13");
    expect(derivePrivacyTier("2012-02-29", new Date("2025-03-01T12:00:00Z"))).toBe("tier2_teen_13_17");
  });

  it("treats a future date of birth as tier 1 rather than throwing", () => {
    expect(derivePrivacyTier("2030-01-01", ASOF)).toBe("tier1_under13");
  });
});

describe("videoRetentionDaysForTier", () => {
  it("purges under-13 footage soonest", () => {
    expect(videoRetentionDaysForTier("tier1_under13")).toBe(TIER1_VIDEO_RETENTION_DAYS);
  });

  it("gives teens a longer window", () => {
    expect(videoRetentionDaysForTier("tier2_teen_13_17")).toBe(TIER2_VIDEO_RETENTION_DAYS);
  });

  it("never auto-purges an adult's footage", () => {
    expect(videoRetentionDaysForTier("tier3_adult_18plus")).toBeNull();
  });

  it("keeps the minor windows ordered and positive, so no tier retains longer than a laxer one", () => {
    expect(TIER1_VIDEO_RETENTION_DAYS).toBeGreaterThan(0);
    expect(TIER2_VIDEO_RETENTION_DAYS).toBeGreaterThan(TIER1_VIDEO_RETENTION_DAYS);
  });
});

describe("feature switches", () => {
  it("has the guardian-notice feature live", () => {
    expect(GUARDIAN_NOTICE_LIVE).toBe(true);
  });
});
