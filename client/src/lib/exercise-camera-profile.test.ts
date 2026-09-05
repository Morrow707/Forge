import { describe, it, expect } from "vitest";
import {
  postureForExercise,
  heightCalibrationUnreliable,
  calibrationRefusalReason,
  firstMoveForExercise,
  romBucketForExercise,
} from "./exercise-camera-profile";

describe("postureForExercise", () => {
  // The bug this table was built for. A seated athlete passes uprightEnough -- that check
  // compares the head-to-ankle segment's vertical component against its own length, and a
  // seated body is vertical -- while spanning only ~0.77 of standing height. Nothing else in
  // the pipeline catches the resulting ~30% scale error, because it is far too small to trip
  // implausibleRangeOfMotion.
  it.each([
    "Seated Cable Row",
    "Lat Pulldown",
    "Leg Press",
    "Leg Extension",
    "Machine Shoulder Press",
    "Machine Chest Press",
    "Barbell Shoulder Press",
    "Preacher Curl",
    "Concentration Curl",
    "Seated Calf Raise",
  ])("treats %s as seated, so height calibration is refused", (name) => {
    expect(postureForExercise(name)).toBe("seated");
    expect(heightCalibrationUnreliable(name)).toBe(true);
  });

  // Every one of these is a bench press performed lying on a bench, and not one of them
  // contains the word "bench" -- so the old /bench\s*press/ gate let all of them through.
  it.each(["Board Press", "Pin Press", "Spoto Press", "Larsen Press", "JM Press", "Tate Press"])(
    "treats %s as a lying bench variant",
    (name) => {
      expect(postureForExercise(name)).toBe("lying");
      expect(heightCalibrationUnreliable(name)).toBe(true);
    },
  );

  it.each([
    "Incline Dumbbell Press",
    "Chest-Supported Row",
    "Inverted Row",
    "Reverse Hyper",
    "Turkish Get-Up",
    "Decline Dumbbell Fly",
    "Dumbbell Pullover",
  ])("treats %s as lying", (name) => {
    expect(postureForExercise(name)).toBe("lying");
  });

  // The regression that matters most: the lifts that already produce trusted numbers must not
  // start refusing them. A bent-over row and an RDL fold the torso but the athlete is still
  // standing on their feet, and calibrateFromFrames takes a median across the take's frames --
  // the upright setup and lockout frames are what it calibrates from.
  it.each([
    "Back Squat",
    "Deadlift",
    "Pendlay Row",
    "Bent-Over Row",
    "Romanian Deadlift",
    "Overhead Press",
    "Push Press",
    "Power Clean",
    "Standing Calf Raise",
    "Barbell Curl",
  ])("leaves %s standing, so its numbers are unchanged", (name) => {
    expect(postureForExercise(name)).toBe("standing");
    expect(heightCalibrationUnreliable(name)).toBe(false);
  });

  it("keeps a strict dead hang usable and a bent-legged hang not", () => {
    expect(heightCalibrationUnreliable("Pull-Up")).toBe(false);
    expect(heightCalibrationUnreliable("Chin-Up")).toBe(false);
    // Ankles crossed on a dip, kneeling on an assisted pull-up platform.
    expect(postureForExercise("Dip")).toBe("supported");
    expect(postureForExercise("Assisted Pull-Up")).toBe("supported");
  });

  it("defaults an unknown exercise to standing rather than refusing it", () => {
    expect(postureForExercise("Some Brand New Lift")).toBe("standing");
    expect(postureForExercise(null)).toBe("standing");
  });

  it("gives a posture-specific reason and none for a standing lift", () => {
    expect(calibrationRefusalReason("seated")).toContain("seated");
    expect(calibrationRefusalReason("lying")).toContain("lying down");
    expect(calibrationRefusalReason("standing")).toBeNull();
    expect(calibrationRefusalReason("hanging")).toBeNull();
  });
});

describe("firstMoveForExercise", () => {
  // The taxonomy this replaces had no answer for anything typed Push or Press, which is every
  // one of these, and the native tracker passed no hint at all.
  it.each([
    ["Bench Press", "eccentric"],
    ["Close-Grip Bench Press", "eccentric"],
    ["Incline Dumbbell Press", "eccentric"],
    ["Overhead Press", "concentric"],
    ["Dumbbell Shoulder Press", "concentric"],
    ["Machine Chest Press", "concentric"],
    ["Push-Up", "eccentric"],
    ["Tricep Rope Pushdown", "concentric"],
  ])("%s starts %s", (name, expected) => {
    expect(firstMoveForExercise(name)).toBe(expected);
  });

  // The three the movementType taxonomy gets backwards.
  it("corrects the hang variants, which dip to the hang before they pull", () => {
    expect(firstMoveForExercise("Hang Clean")).toBe("eccentric");
    expect(firstMoveForExercise("Hang Snatch")).toBe("eccentric");
  });

  it("corrects a step-up, which drives up before it steps down", () => {
    expect(firstMoveForExercise("Dumbbell Box Step-Up")).toBe("concentric");
  });

  it("keeps the dip in a push press and split jerk as the first move", () => {
    expect(firstMoveForExercise("Push Press")).toBe("eccentric");
    expect(firstMoveForExercise("Split Jerk")).toBe("eccentric");
  });

  it("agrees with the taxonomy where the taxonomy was already right", () => {
    expect(firstMoveForExercise("Back Squat")).toBe("eccentric");
    expect(firstMoveForExercise("Deadlift")).toBe("concentric");
  });

  it("returns null for an unknown exercise instead of guessing", () => {
    expect(firstMoveForExercise("Some Brand New Lift")).toBeNull();
    expect(firstMoveForExercise(null)).toBeNull();
  });

  it("is case and spacing insensitive", () => {
    expect(firstMoveForExercise("  bench   press ")).toBe("eccentric");
  });
});

describe("romBucketForExercise", () => {
  it("gives a calf raise its own small-travel bucket", () => {
    expect(romBucketForExercise("Standing Calf Raise")).toBe("ankle_or_shrug");
    expect(romBucketForExercise("Barbell Shrug")).toBe("ankle_or_shrug");
  });

  it("lets an Olympic lift travel further than the athlete is tall", () => {
    expect(romBucketForExercise("Snatch")).toBe("olympic");
    expect(romBucketForExercise("Clean & Jerk")).toBe("olympic");
    expect(romBucketForExercise("Power Clean")).toBe("olympic");
  });

  // Both are overhead presses whose names end in "Press", so the old name mapping gave them the
  // horizontal ceiling of 0.5x height -- tighter than the 0.7x an overhead press legitimately
  // needs, so a real rep could be rejected as impossible.
  it("puts an Arnold and landmine press overhead rather than horizontal", () => {
    expect(romBucketForExercise("Arnold Press")).toBe("overhead_press");
    expect(romBucketForExercise("Landmine Press")).toBe("overhead_press");
  });

  it("keeps the four original buckets on the lifts that already used them", () => {
    expect(romBucketForExercise("Bench Press")).toBe("horizontal_press_or_row");
    expect(romBucketForExercise("Back Squat")).toBe("squat");
    expect(romBucketForExercise("Deadlift")).toBe("deadlift");
    expect(romBucketForExercise("Overhead Press")).toBe("overhead_press");
  });

  it("returns null when nothing is known, leaving the caller's own default", () => {
    expect(romBucketForExercise("Some Brand New Lift")).toBeNull();
  });
});
