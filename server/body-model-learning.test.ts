import { describe, it, expect } from "vitest";
import { learnFromTake, MAX_LIMB_HISTORY } from "./body-model-learning";
import { limbHasConverged } from "@shared/athlete-body-model";

describe("learning an athlete's skeleton from their own takes", () => {
  it("REFUSES a take whose scale came from the body itself", () => {
    // Learning a limb from a scale derived from a limb is circular, and the result would then
    // propagate to every future take wearing the authority of a measurement.
    expect(learnFromTake(null, { upperArm: 0.33 }, "shoulder_width")).toBeNull();
    expect(learnFromTake(null, { upperArm: 0.33 }, "height")).toBeNull();
    expect(learnFromTake(null, { upperArm: 0.33 }, null)).toBeNull();
  });

  it("accepts a ruler the body had no hand in", () => {
    for (const source of ["plate", "gravity", "grip_width"]) {
      expect(learnFromTake(null, { upperArm: 0.33 }, source)).not.toBeNull();
    }
  });

  it("converges across takes and only then serves as a ruler", () => {
    let model = learnFromTake(null, { upperArm: 0.33 }, "plate")!;
    expect(limbHasConverged(model.upperArm)).toBe(false);
    model = learnFromTake(model, { upperArm: 0.331 }, "plate")!;
    model = learnFromTake(model, { upperArm: 0.329 }, "plate")!;
    expect(limbHasConverged(model.upperArm)).toBe(true);
    expect(model.upperArm!.metres).toBeCloseTo(0.33, 3);
    expect(model.upperArm!.takes).toBe(3);
  });

  it("keeps the readings, because the fold is a median and a median needs voters", () => {
    let model = learnFromTake(null, { upperArm: 0.33 }, "plate")!;
    model = learnFromTake(model, { upperArm: 0.33 }, "plate")!;
    model = learnFromTake(model, { upperArm: 0.9 }, "plate")!;
    model = learnFromTake(model, { upperArm: 0.331 }, "plate")!;
    model = learnFromTake(model, { upperArm: 0.329 }, "plate")!;
    // The 0.9 is outvoted rather than permanently shifting the bone.
    expect(model.upperArm!.metres).toBeCloseTo(0.331, 2);
  });

  it("bounds the history rather than growing a column forever", () => {
    let model = learnFromTake(null, { upperArm: 0.33 }, "plate")!;
    for (let i = 0; i < MAX_LIMB_HISTORY + 10; i++) {
      model = learnFromTake(model, { upperArm: 0.33 }, "plate")!;
    }
    expect(model.history!.upperArm!.length).toBe(MAX_LIMB_HISTORY);
  });

  it("learns nothing from a take that measured nothing", () => {
    expect(learnFromTake(null, {}, "plate")).toBeNull();
    expect(learnFromTake(null, { upperArm: 0 }, "plate")).toBeNull();
    expect(learnFromTake(null, { upperArm: Number.NaN }, "plate")).toBeNull();
  });

  it("records which rulers taught each bone, so an estimate can be traced back", () => {
    let model = learnFromTake(null, { upperArm: 0.33 }, "plate")!;
    model = learnFromTake(model, { upperArm: 0.33 }, "gravity")!;
    expect(model.upperArm!.sources.sort()).toEqual(["gravity", "plate"]);
  });
});
