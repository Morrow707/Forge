import { describe, it, expect } from "vitest";
import {
  ANVIL_WINDOW_CLOSES_MINUTES,
  ANVIL_WINDOW_OPENS_MINUTES,
  checkThatCounts,
  countsTowardBaseline,
  localMinutesFrom,
  windowLabelFor,
} from "./anvil-window";

const at = (h: number, m = 0) => h * 60 + m;

describe("the window labels and never refuses", () => {
  it("labels a check inside it", () => {
    expect(windowLabelFor(at(7, 12))).toBe("in_window");
    expect(windowLabelFor(ANVIL_WINDOW_OPENS_MINUTES)).toBe("in_window");
    expect(windowLabelFor(ANVIL_WINDOW_CLOSES_MINUTES)).toBe("in_window");
  });

  it("labels one outside it LATE, which is a label and not a refusal", () => {
    expect(windowLabelFor(ANVIL_WINDOW_OPENS_MINUTES - 1)).toBe("late");
    expect(windowLabelFor(ANVIL_WINDOW_CLOSES_MINUTES + 1)).toBe("late");
    expect(windowLabelFor(at(16, 30))).toBe("late");
    expect(windowLabelFor(at(2))).toBe("late");
    // There is no fourth outcome, and in particular no "refused". The whole point.
    expect(["in_window", "late", "practice"]).toContain(windowLabelFor(at(23, 59)));
  });

  it("calls a deliberate practice run practice, whatever the clock says", () => {
    expect(windowLabelFor(at(7), { practice: true })).toBe("practice");
    expect(windowLabelFor(at(22), { practice: true })).toBe("practice");
  });

  it("labels a nonsense clock reading LATE rather than throwing or trusting it", () => {
    for (const m of [-1, 24 * 60, Number.NaN, Infinity]) {
      expect(windowLabelFor(m)).toBe("late");
    }
  });

  it("lets only an in-window check into the baseline", () => {
    expect(countsTowardBaseline("in_window")).toBe(true);
    expect(countsTowardBaseline("late")).toBe(false);
    expect(countsTowardBaseline("practice")).toBe(false);
  });
});

describe("one attempt counts, and it is the FIRST", () => {
  const c = (takenAt: string, window: "in_window" | "late" | "practice" = "in_window") => ({
    takenAt,
    window,
  });

  it("takes the earliest in-window check, not the best and not the latest", () => {
    const day = [c("2026-11-07T08:30:00Z"), c("2026-11-07T06:05:00Z"), c("2026-11-07T07:40:00Z")];
    expect(checkThatCounts(day)?.takenAt).toBe("2026-11-07T06:05:00Z");
    // Best-of lets an athlete retake until they like the number, which turns a measurement into
    // a target. Latest does the same more slowly.
  });

  it("ignores late and practice runs entirely when choosing", () => {
    const day = [
      c("2026-11-07T05:00:00Z", "late"),
      c("2026-11-07T05:30:00Z", "practice"),
      c("2026-11-07T07:00:00Z"),
    ];
    expect(checkThatCounts(day)?.takenAt).toBe("2026-11-07T07:00:00Z");
  });

  it("returns null when the day has checks but none of them count", () => {
    // A real state, and distinct from "no checks at all". A fallback to the late one here is
    // exactly the mistimed-day-folded-into-a-normal that the window exists to prevent.
    expect(checkThatCounts([c("2026-11-07T16:00:00Z", "late")])).toBeNull();
    expect(checkThatCounts([])).toBeNull();
  });
});

describe("the local clock comes from the client", () => {
  it("reads minutes since local midnight", () => {
    const d = new Date(2026, 10, 7, 7, 12, 30);
    expect(localMinutesFrom(d)).toBe(at(7, 12));
  });

  it("is three hours wide and opens before a school lifting session", () => {
    expect(ANVIL_WINDOW_CLOSES_MINUTES - ANVIL_WINDOW_OPENS_MINUTES).toBe(180);
    expect(ANVIL_WINDOW_OPENS_MINUTES).toBeLessThan(at(6));
  });
});
