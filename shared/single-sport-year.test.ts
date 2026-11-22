import { describe, expect, it } from "vitest";
import { singleSportNote, windowMonths } from "./single-sport-year";

const TODAY = "2027-06-15";

describe("year-round single sport", () => {
  it("the window is the last 12 calendar months including this one", () => {
    const w = windowMonths(TODAY);
    expect(w).toHaveLength(12);
    expect(w[0]).toBe("2026-07");
    expect(w[11]).toBe("2027-06");
  });

  it("notes one sport over more than 8 months", () => {
    // 40 weeks from 2026-08-01 covers Aug..May = 10 months.
    const note = singleSportNote([{ sport: "Baseball", startDate: "2026-08-01", totalWeeks: 40 }], TODAY);
    expect(note).toMatchObject({ sport: "Baseball", months: 10 });
  });

  it("says nothing at 8 months or fewer", () => {
    expect(singleSportNote([{ sport: "Baseball", startDate: "2026-10-01", totalWeeks: 30 }], TODAY)).toBeNull();
  });

  it("says nothing when a second sport was assigned in the window", () => {
    const spans = [
      { sport: "Baseball", startDate: "2026-08-01", totalWeeks: 40 },
      { sport: "Football", startDate: "2026-09-01", totalWeeks: 4 },
    ];
    expect(singleSportNote(spans, TODAY)).toBeNull();
  });

  it("ignores a program with no sport tag, and counts a moved day", () => {
    const spans = [
      { sport: null, startDate: "2026-08-01", totalWeeks: 52 },
      { sport: "baseball", startDate: "2026-07-01", totalWeeks: 4, latestOverride: "2027-05-30" },
    ];
    expect(singleSportNote(spans, TODAY)?.months).toBe(11);
  });
});
