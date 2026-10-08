// THE EXPORT SAID "THE RULER UNCERTAINTIES THIS LIFT WAS HANDED". THE BLEND HAD USED OTHERS.
//
// shared/camera-tunables-by-lift.ts carries four scale-ruler uncertainties per filmable thing --
// heightRulerUncertainty, depthRulerUncertainty, depthRulerBias, ankle3DRulerUncertainty -- and
// until 2026-10-08 the ONLY four reads of those fields anywhere in the repo were the four that
// write them into the export (av-bar-tracker-dialog.tsx:2196-2199). The scale candidates were
// built from the module constants instead.
//
// So the download reported per-lift uncertainties that had decided nothing, and the registry's
// whole promise -- a number fitted on one movement never moves another movement's number -- was
// unmet for the four fields most directly about scale. The worst version of that is not the
// leak: it is that an entry in FITTED_OVERRIDES would have READ AS APPLIED, in the export,
// confirmed by the file, and not been. A fit you cannot see failing is worse than no fit.
//
// Nothing moves today. Every record still carries the shared value and FITTED_OVERRIDES is
// empty, which is exactly why this is the moment to wire it: the day one of these is fitted on a
// lift, it moves that lift and no other.
//
// Rule #2 is untouched. reconcileScaleEstimates stays ONE blend across every movement -- the
// mechanism is shared, and only the variances it is handed are the lift's own. That is the split
// CLAUDE.md settles in one sentence: a NUMBER somebody could fit from one take is per-lift, a
// RULE stays shared.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cameraTunablesFor } from "@shared/camera-tunables-by-lift";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const bar = read("client/src/components/av-bar-tracker-dialog.tsx");

const UNCERTAINTY_FIELDS = [
  "heightRulerUncertainty",
  "depthRulerUncertainty",
  "depthRulerBias",
  "ankle3DRulerUncertainty",
] as const;

describe("the blend is handed this lift's uncertainties", () => {
  it("the bar's height candidate takes its uncertainty from the lift's record", () => {
    expect(bar).toContain("uncertaintyFraction: scaleTunables.heightRulerUncertainty");
    // And not from the module constant, which is what it read before.
    expect(bar).not.toContain("uncertaintyFraction: HEIGHT_RULER_UNCERTAINTY");
  });

  it("the bar's depth candidate takes both its bias and its uncertainty from the record", () => {
    expect(bar).toContain("scaleTunables.depthRulerBias");
    expect(bar).toContain("uncertaintyFraction: scaleTunables.depthRulerUncertainty");
    expect(bar).not.toContain("/ DEPTH_RULER_BIAS,");
    expect(bar).not.toContain("uncertaintyFraction: DEPTH_RULER_UNCERTAINTY");
  });

  it("the record the blend reads is resolved from the exercise, not a default", () => {
    expect(bar).toContain(
      "const scaleTunables = cameraTunablesFor(exerciseName, romBucketForExercise(exerciseName)).values",
    );
  });

  it("EVERY ONE OF THE FOUR HAS A READ THAT IS NOT THE EXPORT", () => {
    // The shape of the original bug, stated as a rule: a registry field whose only consumer is
    // the line that reports it is decoration, and decoration that an export presents as fact.
    // ankle3DRulerUncertainty is the one still in that state and is named below rather than
    // quietly passing.
    const wired = ["heightRulerUncertainty", "depthRulerUncertainty", "depthRulerBias"];
    for (const field of wired) {
      const reads = (bar.match(new RegExp(`scaleTunables\\.${field}`, "g")) ?? []).length;
      expect(reads, `${field} is still only written to the export`).toBeGreaterThan(0);
    }
  });

  it("the registry still hands out a fresh record, so reading it cannot be a shared mutation", () => {
    // The blend now holds a reference to this record during a take. If cameraTunablesFor ever
    // returned a shared object, one take could move another lift's variances at runtime -- a
    // leak with no file to grep.
    const a = cameraTunablesFor("Back Squat", "squat").values;
    const b = cameraTunablesFor("Back Squat", "squat").values;
    expect(a).not.toBe(b);
    a.heightRulerUncertainty = 999;
    expect(cameraTunablesFor("Back Squat", "squat").values.heightRulerUncertainty).not.toBe(999);
    expect(cameraTunablesFor("Bench Press", "press").values.heightRulerUncertainty).not.toBe(999);
  });

  it("nothing moved: every lift still resolves the shared starting values", () => {
    // The commit is machinery, not a fit. FITTED_OVERRIDES is empty and these must still be the
    // numbers the module constants carry, or this changed a measurement while claiming not to.
    for (const [name, bucket] of [["Back Squat", "squat"], ["Bench Press", "press"], ["Romanian Deadlift", "hinge"]] as const) {
      const v = cameraTunablesFor(name, bucket as never).values;
      expect(v.heightRulerUncertainty).toBe(0.1);
      expect(v.depthRulerUncertainty).toBe(0.2);
      expect(v.depthRulerBias).toBe(0.9);
      expect(v.ankle3DRulerUncertainty).toBe(0.2);
    }
  });

  it("RECORDED, NOT FIXED: three rulers still cannot be handed their lift's number", () => {
    // Named so these read as known gaps rather than as something this commit covered.
    //
    // 1. av-jump and av-swing build a `height` candidate from the module constant and have no
    //    exercise-name prop at all, so they cannot resolve a record. The eight plyometrics are
    //    among the 54 and each HAS one; threading the identity in is its own change.
    // 2. ankle3DRulerUncertainty is baked into ankle-3d-ruler.ts's returned reading, and the
    //    ankle ruler is computed after the scale vote has already closed, so its uncertainty is
    //    inert whichever number it carries. Plumbing it before fixing that would be decoration
    //    on decoration.
    const jump = read("client/src/components/av-jump-tracker-dialog.tsx");
    const swing = read("client/src/components/av-swing-tracker-dialog.tsx");
    expect(jump).toContain("uncertaintyFraction: HEIGHT_RULER_UNCERTAINTY");
    expect(swing).toContain("uncertaintyFraction: HEIGHT_RULER_UNCERTAINTY");
    expect(read("client/src/lib/ankle-3d-ruler.ts")).toContain("uncertaintyFraction: ANKLE_3D_RULER_UNCERTAINTY");
    // When one of these is wired, its line here fails and gets deleted -- the list is meant to
    // shrink, which is how count-trim-never-empties-a-set.test.ts carries its own known list.
    expect(UNCERTAINTY_FIELDS.length).toBe(4);
  });
});
