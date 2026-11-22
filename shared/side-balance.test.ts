import { describe, expect, it } from "vitest";
import { SIDE_DIFFERENCE_GUIDE_SENTENCE, SIDE_DIFFERENCE_USUAL_GUIDE_PERCENT, setEffort, sideBalance } from "./side-balance";

/**
 * The two-sided check (Scott, 2026-11-22): "Right 18% below left", beside the usual guide of under
 * 10%. Display only. Logged numbers arrive as text, as they do from the analytics route.
 */
describe("side balance", () => {
  it("compares each side's best set, load x reps", () => {
    const b = sideBalance([
      { side: "left", reps: "10", weight: "50" },
      { side: "left", reps: "8", weight: "50" },
      { side: "right", reps: "82", weight: "5" },
    ]);
    expect(b?.sentence).toBe("Right 18% below left");
    expect(b?.lowerSide).toBe("right");
  });

  it("uses reps alone when no load was logged", () => {
    expect(setEffort({ side: "left", reps: "12" })).toBe(Number("12"));
    expect(sideBalance([{ side: "left", reps: "10" }, { side: "right", reps: "12" }])?.sentence).toBe(
      "Left 17% below right",
    );
  });

  it("reads even when the sides match", () => {
    expect(sideBalance([{ side: "left", reps: "10" }, { side: "right", reps: "10" }])?.sentence).toBe(
      "Left and right even",
    );
  });

  it("says nothing when a side has nothing logged, and counts sets with no side", () => {
    expect(sideBalance([{ side: "left", reps: "10" }])).toBeNull();
    const b = sideBalance([
      { side: "left", reps: "10" },
      { side: "right", reps: "9" },
      { side: null, reps: "20" },
    ]);
    expect(b?.setsWithoutSide).toBe(1);
  });

  it("states the usual guide and that it decides nothing", () => {
    expect(SIDE_DIFFERENCE_GUIDE_SENTENCE).toContain(`${SIDE_DIFFERENCE_USUAL_GUIDE_PERCENT}%`);
    expect(SIDE_DIFFERENCE_GUIDE_SENTENCE).toContain("never decides anything");
  });
});
