import { describe, it, expect } from "vitest";
import { assessSubjectFacing, cameraViewMismatch, type Landmark } from "./pose-tracking";
import { expectedCameraView, filmGuidanceForExercise } from "./exercise-camera-profile";

// Landmark indices used by assessSubjectFacing: shoulders 11/12, hips 23/24.
function pose(shoulderSpread: number, torsoLength = 0.4): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  lm[11] = { x: -shoulderSpread / 2, y: 0, z: 0, visibility: 1 };
  lm[12] = { x: shoulderSpread / 2, y: 0, z: 0, visibility: 1 };
  lm[23] = { x: -0.05, y: torsoLength, z: 0, visibility: 1 };
  lm[24] = { x: 0.05, y: torsoLength, z: 0, visibility: 1 };
  return lm;
}

describe("assessSubjectFacing", () => {
  it("reads a body squared up to the lens as facing the camera", () => {
    // Biacromial breadth is comfortably wider than shoulder-to-hip when facing the lens.
    expect(assessSubjectFacing(pose(0.45, 0.4))).toBe("facing_camera");
  });

  it("reads a body turned side-on as side-on", () => {
    // One shoulder behind the other, so they collapse together while the torso keeps its length.
    expect(assessSubjectFacing(pose(0.05, 0.4))).toBe("side_on");
  });

  it("does not force a call on a body between the two", () => {
    expect(assessSubjectFacing(pose(0.2, 0.4))).toBe("oblique");
  });

  it("says unknown rather than guessing when the landmarks are missing", () => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
    expect(assessSubjectFacing(lm)).toBe("unknown");
  });
});

describe("cameraViewMismatch", () => {
  // The case that matters: filming a squat from the front does not make bar drift noisy, it
  // makes it invisible, because the drift points straight at the lens.
  it("flags a side-view lift filmed from the front", () => {
    expect(cameraViewMismatch("facing_camera", "side")).toContain("side view");
  });

  it("flags a front-view lift filmed from the side", () => {
    expect(cameraViewMismatch("side_on", "front")).toContain("front or back");
  });

  it("stays quiet when the footage matches the lift", () => {
    expect(cameraViewMismatch("side_on", "side")).toBeNull();
    expect(cameraViewMismatch("facing_camera", "front")).toBeNull();
  });

  it("stays quiet when either view works, or nothing is known", () => {
    expect(cameraViewMismatch("facing_camera", "either")).toBeNull();
    expect(cameraViewMismatch("side_on", null)).toBeNull();
    expect(cameraViewMismatch("unknown", "side")).toBeNull();
    expect(cameraViewMismatch("oblique", "side")).toBeNull();
  });
});

describe("expectedCameraView", () => {
  it("puts the barbell lifts on a side view", () => {
    for (const name of ["Back Squat", "Bench Press", "Deadlift", "Overhead Press", "Power Clean"]) {
      expect(expectedCameraView(name), name).toBe("side");
    }
  });

  it("puts the lifts that hide a limb behind a limb on a front view", () => {
    for (const name of ["Cable Fly", "Arnold Press", "Sumo Deadlift", "Hex Bar Deadlift"]) {
      expect(expectedCameraView(name), name).toBe("front");
    }
  });

  it("returns null for a lift with no guidance rather than guessing side", () => {
    expect(expectedCameraView("Some Brand New Lift")).toBeNull();
  });

  // The classification is parsed from prose, which is exactly the sort of thing that breaks
  // quietly, so every entry is checked rather than a sample.
  it("classifies every lift that has guidance, and never disagrees with its own text", () => {
    const names = [
      "Back Squat", "Box Squat", "Front Squat", "Overhead Squat", "Goblet Squat", "Leg Press",
      "Deadlift", "Sumo Deadlift", "Hex Bar Deadlift", "Romanian Deadlift", "Rack Pull",
      "Bench Press", "Incline Dumbbell Press", "Overhead Press", "Push Press", "Split Jerk",
      "Pendlay Row", "Bent-Over Row", "Pull-Up", "Chin-Up", "Barbell Curl", "Cable Fly",
      "Arnold Press", "Power Clean", "Snatch", "Hang Clean", "Standing Calf Raise",
    ];
    for (const name of names) {
      const view = expectedCameraView(name);
      const text = filmGuidanceForExercise(name)!.view;
      expect(view, name).not.toBeNull();
      if (view === "front") {
        expect(text, name).toMatch(/FRONT|Directly in front/);
      } else if (view === "side") {
        expect(text.toLowerCase(), name).toContain("side");
      }
    }
  });
});
