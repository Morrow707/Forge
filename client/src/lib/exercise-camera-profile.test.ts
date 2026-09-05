import { describe, it, expect } from "vitest";
import {
  postureForExercise,
  heightCalibrationUnreliable,
  calibrationRefusalReason,
  firstMoveForExercise,
  romBucketForExercise,
  filmGuidanceForExercise,
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

describe("the movementType backstop", () => {
  // The name patterns are a list of spellings and the library keeps growing. Sweeping all 413
  // seeded exercises turned up a tail they missed: planks, bird dogs, bear crawls, ab-wheel
  // rollouts, superman holds and the whole floor-mobility section.
  it.each(["Plank", "Side Plank", "Weighted Plank", "Superman Hold", "Bird Dog", "Ab Wheel Rollout", "Glute Ham Raise", "Bear Crawl", "Quadruped Thoracic Rotation"])(
    "refuses %s on its name alone",
    (name) => {
      expect(heightCalibrationUnreliable(name)).toBe(true);
    },
  );

  it("folds an L-shaped hang differently from a straight one", () => {
    expect(postureForExercise("Hanging Leg Raise")).toBe("supported");
    expect(postureForExercise("Hanging Windshield Wiper")).toBe("supported");
    expect(postureForExercise("Pull-Up")).toBe("hanging");
  });

  // Refusing an isometric or a stretch costs nothing: neither has a rep or a range of motion.
  it.each(["Farmer's Hold", "Wall Sit", "Dead Hang", "Plate Pinch Hold"])(
    "refuses %s once its Isometric movementType is supplied",
    (name) => {
      expect(heightCalibrationUnreliable(name)).toBe(false);
      expect(heightCalibrationUnreliable(name, "Isometric")).toBe(true);
    },
  );

  it("refuses floor mobility work via its Mobility movementType", () => {
    expect(heightCalibrationUnreliable("Child's Pose", "Mobility")).toBe(true);
    expect(heightCalibrationUnreliable("Pigeon Stretch", "Mobility")).toBe(true);
  });

  // The backstop must not reach the lifts that carry real numbers today.
  it.each([["Back Squat", "Squat"], ["Deadlift", "Hinge"], ["Overhead Press", "Press"], ["Pendlay Row", "Pull"]])(
    "leaves %s measurable with its own movementType",
    (name, type) => {
      expect(heightCalibrationUnreliable(name, type)).toBe(false);
    },
  );
});

describe("filmable lifts the manual does not cover", () => {
  // Only 35 of the 54 currently video-eligible exercises appear in the execution manual, and 16
  // of the 19 missing ones are Olympic lifts.
  it("corrects the power hang variants, which had the same inversion as their siblings", () => {
    expect(firstMoveForExercise("Hang Power Clean")).toBe("eccentric");
    expect(firstMoveForExercise("Hang Power Snatch")).toBe("eccentric");
    // The two the manual does cover, for comparison.
    expect(firstMoveForExercise("Hang Clean")).toBe("eccentric");
    expect(firstMoveForExercise("Hang Snatch")).toBe("eccentric");
  });

  it("dips first on every jerk", () => {
    expect(firstMoveForExercise("Push Jerk")).toBe("eccentric");
    expect(firstMoveForExercise("Jerk Balance")).toBe("eccentric");
    expect(firstMoveForExercise("Snatch Balance")).toBe("eccentric");
  });

  it("pulls first when the bar starts at rest on the floor or on blocks", () => {
    for (const name of ["Block Clean", "Block Snatch", "Power Snatch", "Pause Clean", "Muscle Clean", "Muscle Snatch", "Clean High Pull", "Snatch-Grip High Pull"]) {
      expect(firstMoveForExercise(name)).toBe("concentric");
    }
  });

  it("covers every video-eligible barbell lift", () => {
    // Anything filmable and missing here falls back to the movementType taxonomy, which is what
    // got the hang variants backwards in the first place.
    for (const name of ["Trap Bar Squat", "Tall Clean", "Tall Snatch"]) {
      expect(firstMoveForExercise(name)).not.toBeNull();
    }
  });
});

describe("filmGuidanceForExercise", () => {
  it("carries the manual's own words for a lift it covers", () => {
    const squat = filmGuidanceForExercise("Back Squat");
    expect(squat?.view).toContain("side");
    expect(squat?.inFrame).toContain("plates");
    expect(squat?.oneRep).toContain("lockout");
  });

  // A generic "square to the side" would be actively wrong for these.
  it("keeps the front-view lifts on a front view", () => {
    expect(filmGuidanceForExercise("Cable Fly")?.view).toContain("FRONT");
    expect(filmGuidanceForExercise("Arnold Press")?.view).toContain("FRONT");
  });

  it("covers every video-eligible barbell lift, including the ones the manual skipped", () => {
    for (const name of ["Power Snatch", "Block Clean", "Hang Power Clean", "Push Jerk", "Tall Snatch", "Trap Bar Squat", "Muscle Clean", "Pause Clean", "Snatch Balance", "Jerk Balance"]) {
      const g = filmGuidanceForExercise(name);
      expect(g, name).not.toBeNull();
      expect(g!.oneRep.length).toBeGreaterThan(20);
    }
  });

  // Bar-path deviation and peak velocity both assume a straight vertical line, which a correct
  // clean or snatch deliberately is not.
  it("warns on every Olympic lift that its bar path is not a straight line", () => {
    for (const name of ["Power Snatch", "Block Snatch", "Hang Power Clean", "Tall Clean", "Clean High Pull"]) {
      expect(filmGuidanceForExercise(name)!.oneRep, name).toContain("does NOT travel a straight line");
    }
  });

  it("returns null rather than a generic instruction for an unknown lift", () => {
    expect(filmGuidanceForExercise("Some Brand New Lift")).toBeNull();
    expect(filmGuidanceForExercise(null)).toBeNull();
  });
});
