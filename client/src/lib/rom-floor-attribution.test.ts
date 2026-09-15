import { describe, it, expect } from "vitest";
import { implausibleRangeOfMotion, traceSpanAlongLift } from "./bar-tracking";
import captures from "./__fixtures__/walkout-captures.json";

const HEIGHT_IN = 75;
const BENCH = "horizontal_press_or_row";

// A RANGE OF MOTION UNDER THE FLOOR HAS TWO CAUSES AND THEY NEED DIFFERENT ANSWERS.
//
// The floor branch told every athlete the same thing: the camera's real-world scale was misread.
// That is the actionable half of the message -- it sends them to re-film -- and for one of the
// two causes it is false, so it sends them to re-film a setup that was fine.
//
// Three real bench captures are the ones that were being misdiagnosed. They reported 7 to 9cm
// per rep and their traces span 30, 36 and 53cm; a bench press travels about 40 and returns to
// the same place each rep, so those spans are what a CORRECT scale looks like. Segmentation cut
// roughly one rep's worth of travel into fourteen to nineteen pieces.
describe("what a too-short range of motion is blamed on", () => {
  it("blames the scale when the whole take shrank along with the reps", () => {
    // A badly wrong scale takes the span down with it: 4cm per rep over a 10cm set, against a
    // 15cm floor. Nothing about that take covered a plausible distance.
    const problem = implausibleRangeOfMotion(4, HEIGHT_IN, BENCH, 10);
    expect(problem).not.toBeNull();
    expect(problem).toContain("scale was misread");
  });

  it("points at split reps when the take covered a plausible distance", () => {
    // The shape of the three real captures: 7cm per rep, 36cm across the set.
    const problem = implausibleRangeOfMotion(7, HEIGHT_IN, BENCH, 36);
    expect(problem).not.toBeNull();
    expect(problem).toContain("reps being split");
    expect(problem).not.toContain("scale was misread");
  });

  // The claim is hedged on purpose -- see the branch's own comment. A moderately wrong scale can
  // land on this side of the split too, so the message says which cause is more likely and that
  // re-filming may not help, rather than asserting one it cannot establish from a single number.
  it("does not promise the camera was set up correctly", () => {
    const problem = implausibleRangeOfMotion(7, HEIGHT_IN, BENCH, 36)!;
    expect(problem).toContain("may not change it");
    expect(problem).not.toContain("scale is fine");
  });

  // Without the span there is nothing to tell the two apart, so the old attribution stands. A
  // caller that cannot supply it is no worse off than it was before this existed.
  it("keeps the old attribution when no span is available", () => {
    const problem = implausibleRangeOfMotion(7, HEIGHT_IN, BENCH);
    expect(problem).toContain("scale was misread");
  });

  it("still says nothing about a range of motion that is fine", () => {
    expect(implausibleRangeOfMotion(40, HEIGHT_IN, BENCH, 45)).toBeNull();
  });

  // The ceiling branch is untouched: a take that travelled too FAR is a scale failure either
  // way, because a correct scale cannot produce it however the reps were cut.
  it("leaves the ceiling branch blaming the scale", () => {
    const problem = implausibleRangeOfMotion(277, HEIGHT_IN, BENCH, 593);
    expect(problem).toContain("scale was misread");
  });
});

describe("traceSpanAlongLift", () => {
  it("measures a real stored trace end to end", () => {
    const squat = (captures as { setId: number; barPathTrace: { y: number }[] }[]).find(
      (c) => c.setId === 11945,
    )!;
    // Stored traces are in centimetres, so this comes back in them too.
    expect(traceSpanAlongLift(squat.barPathTrace)).toBeGreaterThan(50);
  });

  it("returns nothing for a trace with no points rather than zero", () => {
    expect(traceSpanAlongLift([])).toBeNull();
  });
});
