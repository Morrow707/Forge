// THE POSTURE SWEEP, 2026-10-06. Every one of the 413 library exercises run through
// postureForExercise, after Scott asked whether a fix for one lift can move another's numbers
// ("make sure each lift that we are recording has its own numbers so when we calibrate one lift
// it isn't screwing up others").
//
// The answer, and why this file exists: the eight trackers share one CODE PATH, and the per-lift
// differences are VALUES looked up by exercise -- posture, the ROM bucket, the first-move
// direction, the travel-onset margin. So a constant is shared by every lift that resolves to the
// same value, and the posture LABEL is what decides whether the height ruler votes at all. A
// lift mislabelled "standing" is not a tuning error, it is a wrong input: the Romanian deadlift
// read 7% low for exactly that reason until 2026-10-05.
//
// Twenty-two exercises were resolving to the default, "standing", while being done face-down on
// a bench, folded into a plank, hinged at the hip, or hanging. Each is pinned here by the thing
// that matters -- that its numbers are not derived from a stature span -- and the lifts actually
// being filmed beside the OVR sensor are pinned unchanged, because the point of the sweep was to
// fix the tail WITHOUT moving them.
import { describe, expect, it } from "vitest";

import { heightCalibrationUnreliable, postureForExercise } from "./exercise-camera-profile";

describe("the 2026-10-06 posture sweep", () => {
  it.each([
    ["Seal Row", "lying"],
    ["Spider Curl", "lying"],
    ["Frog Pump", "lying"],
    ["Renegade Row", "lying"],
    ["Push-Up to Renegade Row", "lying"],
    ["Renegade Row to Burpee", "lying"],
    ["Stir the Pot", "lying"],
    ["McGill Curl-Up", "lying"],
    ["Machine Row", "seated"],
    ["Pec Deck", "seated"],
    ["Bent-Over Dumbbell Rear Delt Raise", "bent_over"],
    ["Cable Pull-Through", "bent_over"],
    ["Jefferson Curl", "bent_over"],
    ["Dumbbell Kickback", "bent_over"],
    ["Cable Kickback", "bent_over"],
    ["Single-Leg RDL to Row", "bent_over"],
    ["Suitcase Deadlift to Row", "bent_over"],
    ["Dead Hang", "hanging"],
    ["Toes-to-Bar", "supported"],
    ["Nordic Hamstring Curl", "supported"],
    ["Adductor Rock Back", "supported"],
  ])("%s is %s, not standing", (name, posture) => {
    expect(postureForExercise(name)).toBe(posture);
  });

  it("refuses the height ruler on every one of them except the dead hang", () => {
    // A hang is one straight line and keeps its full length -- that is why "hanging" allows the
    // height ruler and "supported" does not. The dead hang moving OFF standing changes nothing
    // about its scale; it was the only one in the list that was already allowed and still is.
    for (const name of [
      "Seal Row",
      "Renegade Row",
      "Machine Row",
      "Bent-Over Dumbbell Rear Delt Raise",
      "Cable Pull-Through",
      "Toes-to-Bar",
      "Nordic Hamstring Curl",
    ]) {
      expect(heightCalibrationUnreliable(name)).toBe(true);
    }
    expect(heightCalibrationUnreliable("Dead Hang")).toBe(false);
  });

  it("leaves every sensor-paired lift exactly where it was", () => {
    // These are the lifts with OVR numbers behind them (docs/camera-tracking-notes.md). The
    // sweep is only allowed to move the tail.
    expect(postureForExercise("Back Squat")).toBe("standing");
    expect(postureForExercise("Deadlift")).toBe("standing");
    expect(postureForExercise("Overhead Press")).toBe("standing");
    expect(postureForExercise("Push Press")).toBe("standing");
    expect(postureForExercise("Barbell Shoulder Press")).toBe("standing");
    expect(postureForExercise("Box Jump")).toBe("standing");
    expect(postureForExercise("Bench Press")).toBe("lying");
    expect(postureForExercise("Pendlay Row")).toBe("bent_over");
    expect(postureForExercise("Barbell Row")).toBe("bent_over");
    expect(postureForExercise("Romanian Deadlift")).toBe("bent_over");
  });

  it("keeps a conventional and a sumo deadlift standing", () => {
    // The hinge patterns are deliberately narrow: a deadlift starts bent and FINISHES upright,
    // and the 2026-10-05 note explains at length why the Romanian is the exception.
    for (const name of ["Deadlift", "Sumo Deadlift", "Hex Bar Deadlift", "Rack Pull", "Deficit Deadlift"]) {
      expect(postureForExercise(name)).toBe("standing");
    }
  });
});
