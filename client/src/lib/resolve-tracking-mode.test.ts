import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveTrackingMode, trackerFromExercise } from "./resolve-tracking-mode";

// 2026-10-01: a "Medicine Ball Rotational Throw" beside the OVR was filmed by the BAR tracker,
// because the program exercise had been saved as "full" and the workout page routed on that
// alone. Four bar-path "reps" on a rotational throw, no med-ball number, against ten sensor
// throws. The tracker a coach's toggle would pick is the tracker that films the set.
describe("the tracker that films a set follows the exercise, not a stale generic level", () => {
  it("a generic saved level resolves from the name", () => {
    expect(resolveTrackingMode("full", { exerciseName: "Medicine Ball Rotational Throw" })).toBe("med_ball");
    expect(resolveTrackingMode("bar_path", { exerciseName: "Wall Ball" })).toBe("med_ball");
    expect(resolveTrackingMode("full", { exerciseName: "Kettlebell Swing" })).toBe("kb_swing");
    expect(resolveTrackingMode("full", { exerciseName: "Sled Push" })).toBe("horizontal_load");
    expect(resolveTrackingMode("full", { exerciseName: "Golf Swing" })).toBe("golf_swing");
    expect(resolveTrackingMode("full", { exerciseName: "Baseball-Style Rotational Med Ball Throw" })).toBe("med_ball");
  });

  it("the library's equipment catches a throw whose name never says ball", () => {
    expect(resolveTrackingMode("full", { exerciseName: "Rotational Scoop Toss", equipment: "Medicine Ball" })).toBe("med_ball");
    expect(trackerFromExercise({ exerciseName: "Back Squat", equipment: "Barbell" })).toBeNull();
  });

  it("a specific saved level is the coach's decision and stands; off stays off", () => {
    expect(resolveTrackingMode("jump", { exerciseName: "Med Ball Chest Pass" })).toBe("jump");
    expect(resolveTrackingMode("med_ball", { exerciseName: "Back Squat" })).toBe("med_ball");
    expect(resolveTrackingMode("none", { exerciseName: "Medicine Ball Slam" })).toBe("none");
  });

  it("a bar lift stays a bar lift, and a plyometric category is not read at capture time", () => {
    expect(resolveTrackingMode("full", { exerciseName: "Back Squat" })).toBe("full");
    expect(resolveTrackingMode("full", { exerciseName: "Jump Squat", equipment: "Barbell" })).toBe("full");
    expect(resolveTrackingMode("full", { exerciseName: "Kettlebell Snatch" })).toBe("full");
  });

  it("the toggle and the workout page both read the one resolver", () => {
    const toggle = readFileSync("client/src/components/video-tracking-toggle.tsx", "utf8");
    const workout = readFileSync("client/src/pages/workout.tsx", "utf8");
    expect(toggle).toMatch(/resolveTrackingMode\(/);
    expect(toggle).not.toMatch(/const MED_BALL_NAME_PATTERN/);
    expect(workout).toMatch(/trackingLevel:\s*\n?\s*kind === "exercise"\s*\n?\s*\? resolveTrackingMode\(/);
  });
});
