import { describe, it, expect, afterEach, vi } from "vitest";
import { todayIso, localIsoDate } from "./local-date";

const realDTF = Intl.DateTimeFormat;

function pretendZone(timeZone: string) {
  // A plain function, not an arrow -- todayInZone calls this with `new`.
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locale?: any, options?: any) {
    if (options === undefined && locale === undefined) {
      return { resolvedOptions: () => ({ timeZone }) } as any;
    }
    return new realDTF(locale, options);
  } as any);
}

afterEach(() => vi.restoreAllMocks());

describe("client-side today", () => {
  // 2026-03-10T02:00Z is still the evening of March 9th in New York. The old
  // `new Date().toISOString().slice(0, 10)` answered "2026-03-10" here, which
  // is what defaulted an evening food log, weigh-in or injury date to
  // tomorrow and broke every "is this today?" comparison after about 7pm.
  const evening = new Date("2026-03-10T02:00:00Z");

  it("gives the athlete's local day, not the UTC day", () => {
    pretendZone("America/New_York");
    expect(todayIso(evening)).toBe("2026-03-09");
    expect(evening.toISOString().slice(0, 10)).toBe("2026-03-10");
  });

  it("agrees with UTC where the zone does", () => {
    pretendZone("UTC");
    expect(todayIso(evening)).toBe("2026-03-10");
  });

  it("handles a zone already into the next day", () => {
    pretendZone("Asia/Tokyo");
    expect(todayIso(new Date("2026-03-09T20:00:00Z"))).toBe("2026-03-10");
  });

  it("buckets an arbitrary instant into the local day too", () => {
    pretendZone("America/Los_Angeles");
    expect(localIsoDate(new Date("2026-07-04T03:30:00Z"))).toBe("2026-07-03");
  });
});
