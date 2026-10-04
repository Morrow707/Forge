import { describe, expect, it } from "vitest";
import { learningStreakFromDays } from "./learning-streak";

const at = new Date("2026-10-04T15:00:00Z");

describe("the learning streak", () => {
  it("counts consecutive days ending today or yesterday", () => {
    expect(learningStreakFromDays(new Set(["2026-10-02", "2026-10-03", "2026-10-04"]), at)).toEqual({ current: 3, longest: 3, activeToday: true });
    expect(learningStreakFromDays(new Set(["2026-10-02", "2026-10-03"]), at)).toEqual({ current: 2, longest: 2, activeToday: false });
  });
  it("a gap of a day breaks it, and the best run is kept", () => {
    expect(learningStreakFromDays(new Set(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-02"]), at)).toEqual({ current: 0, longest: 3, activeToday: false });
    expect(learningStreakFromDays(new Set(), at)).toEqual({ current: 0, longest: 0, activeToday: false });
  });
});
