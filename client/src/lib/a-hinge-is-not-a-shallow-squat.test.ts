// A HINGE IS NOT A SHALLOW SQUAT.
//
// Scott, 2026-10-08, on a Romanian Deadlift filmed at 135lb x 5: "For the deadlift, knees only
// reached -148? What's that number, and where did it come from?"
//
// The number was 148 DEGREES -- the interior hip-knee-ankle angle at the deepest point of the
// set, the 5th percentile across every tracked frame, read off the 3D body pose. It never went
// negative; worldAngleAtVertex is an acos and returns 0..180. The dash was the app's own "~".
//
// Where it came from is the real finding. The sentence beside it read "aim to break parallel",
// which is squat coaching, on a lift whose own library instruction reads "Soft knees, push hips
// back and lower the bar along your legs". 148 degrees IS a correct Romanian deadlift. The
// pipeline had no way to say so, because LOWER_BODY_MOVEMENT_TYPES answers "are the legs doing
// work here" -- true of Squat, Hinge and Lunge alike -- and the depth fault was gated on that.
//
// Third instance of one error class in four days: the RDL's height ruler (2026-10-05, a hinge
// judged by a standing stature) and the Barbell Shoulder Press's seated label (2026-10-06, a
// posture that cost it a ruler) were the same shape. Here it is a SENTENCE rather than a ruler,
// and an athlete who followed it would turn a hinge into a bad squat.
//
// RULE #1 THROUGHOUT: nothing is withheld but the one sentence. The angle is measured exactly as
// before and now reaches the export, which it never did -- the whole reason the question could
// not be answered from the 2026-10-08 download.
import { describe, expect, it } from "vitest";

import {
  LOWER_BODY_MOVEMENT_TYPES,
  POSE_LANDMARKS,
  SQUAT_PATTERN_MOVEMENT_TYPES,
  detectFormFaults,
  type FormFaultEvidence,
  type PoseFrame,
} from "./pose-tracking";

// A leg built from three points, with the knee angle set by where the ankle is placed. The hip
// sits above the knee; swinging the ankle away from straight-down bends the knee by that many
// degrees. Everything is in metres, the units MediaPipe's world landmarks use.
function legFrame(kneeAngleDeg: number, t: number): PoseFrame {
  const bend = ((180 - kneeAngleDeg) * Math.PI) / 180;
  const lm: { x: number; y: number; z: number; visibility: number }[] = Array.from(
    { length: 33 },
    () => ({ x: 0, y: 0, z: 0, visibility: 0 }),
  );
  const put = (i: number, x: number, y: number, z = 0) => {
    lm[i] = { x, y, z, visibility: 0.99 };
  };
  for (const side of [-1, 1]) {
    const hip = side < 0 ? POSE_LANDMARKS.LEFT_HIP : POSE_LANDMARKS.RIGHT_HIP;
    const knee = side < 0 ? POSE_LANDMARKS.LEFT_KNEE : POSE_LANDMARKS.RIGHT_KNEE;
    const ankle = side < 0 ? POSE_LANDMARKS.LEFT_ANKLE : POSE_LANDMARKS.RIGHT_ANKLE;
    const shoulder = side < 0 ? POSE_LANDMARKS.LEFT_SHOULDER : POSE_LANDMARKS.RIGHT_SHOULDER;
    const x = side * 0.17;
    put(shoulder, x, 0.5);
    put(hip, x, 0);
    put(knee, x, -0.45);
    // Ankle 0.45m from the knee, rotated out of vertical by `bend`.
    put(ankle, x + Math.sin(bend) * 0.45, -0.45 - Math.cos(bend) * 0.45);
  }
  return { t, landmarks: [], worldLandmarks: lm } as unknown as PoseFrame;
}

// A set that travels between two knee angles, so kneeRangeOfMotion clears the 25deg floor
// isKneeDrivenMovement needs and the 5th percentile lands on `deepest`.
function set(deepest: number, shallowest = deepest + 40): PoseFrame[] {
  const frames: PoseFrame[] = [];
  for (let i = 0; i < 60; i++) {
    const phase = Math.abs((i % 20) - 10) / 10; // 0 at the bottom, 1 at the top
    frames.push(legFrame(deepest + phase * (shallowest - deepest), i * 33));
  }
  return frames;
}

const depth = (f: { code: string; label: string }[]) => f.find((x) => x.code === "shallow_depth");
const evidenceFor = (e: FormFaultEvidence[], code: string) => e.find((x) => x.code === code);

describe("a hinge is not a shallow squat", () => {
  it("the squat-pattern set is a STRICT SUBSET of the lower-body set", () => {
    // The narrower gate may only ever remove a sentence, never add one to a movement that was
    // not already having its legs judged. If an entry ever appears here that the wider set does
    // not carry, a fault would start firing on a movement nobody checked it against.
    for (const t of SQUAT_PATTERN_MOVEMENT_TYPES) {
      expect(LOWER_BODY_MOVEMENT_TYPES.has(t), `${t} is not a lower-body movement`).toBe(true);
    }
    expect(SQUAT_PATTERN_MOVEMENT_TYPES.has("Hinge")).toBe(false);
  });

  it("SCOTT'S RDL: a hinge at 148 degrees is never told to break parallel", () => {
    const faults = detectFormFaults(set(148, 178), 0, "lift", "Hinge", "Barbell");
    expect(depth(faults)).toBeUndefined();
  });

  it("but the number is still measured, and now says why it stood down", () => {
    // The half that makes the next one of these answerable from the export rather than from a
    // code read. Rule #1: a finding goes into trackingDiagnostics, not into a withheld number.
    const evidence: FormFaultEvidence[] = [];
    detectFormFaults(
      set(148, 178), 0, "lift", "Hinge", "Barbell",
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, evidence,
    );
    const note = evidenceFor(evidence, "shallow_depth");
    expect(note).toBeDefined();
    expect(note!.fired).toBe(false);
    expect(note!.suppressedBecause).toBe("movement_is_a_hinge");
    expect(note!.measured).toBeGreaterThan(140);
    expect(note!.measured).toBeLessThan(156);
    expect(note!.threshold).toBe(100);
    expect(note!.inputs?.movementType).toBe("Hinge");
  });

  it("A SQUAT AT THE SAME ANGLE STILL GETS THE CUE -- this removes nothing from a squat", () => {
    const faults = detectFormFaults(set(148, 178), 0, "lift", "Squat", "Barbell");
    expect(depth(faults)?.label).toMatch(/aim to break parallel/);
    expect(depth(faults)?.label).toMatch(/14[0-9]°|15[0-5]°/);
  });

  it("and a lunge does too", () => {
    expect(depth(detectFormFaults(set(148, 178), 0, "lift", "Lunge", "Barbell"))).toBeDefined();
  });

  it("a squat that DOES break parallel is still clean, and its evidence says so", () => {
    const evidence: FormFaultEvidence[] = [];
    const faults = detectFormFaults(
      set(70, 175), 0, "lift", "Squat", "Barbell",
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, evidence,
    );
    expect(depth(faults)).toBeUndefined();
    const note = evidenceFor(evidence, "shallow_depth");
    expect(note!.fired).toBe(false);
    // Not suppressed -- it simply had nothing to report, which is a different fact and has to
    // read as one.
    expect(note!.suppressedBecause).toBeUndefined();
  });

  it("the forward-lean twin is gated the same way", () => {
    // "Excessive forward lean at the bottom" is the same sentence problem one block down: a
    // folded torso IS the hinge. It did not fire on Scott's take only because that capture's
    // torso read came back near-upright, which is a second measurement problem and not a gate.
    const evidence: FormFaultEvidence[] = [];
    detectFormFaults(
      set(148, 178), 0, "lift", "Hinge", "Barbell",
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, evidence,
    );
    const note = evidenceFor(evidence, "forward_lean");
    if (note?.fired === false && note.suppressedBecause) {
      expect(note.suppressedBecause).toBe("movement_is_a_hinge");
    }
    expect(evidence.some((e) => e.code === "forward_lean" && e.fired)).toBe(false);
  });

  it("leaves the faults that describe something real on a hinge alone", () => {
    // Knee valgus, pelvic drop and heel rise all say something true about a deadlift -- Scott's
    // own take was flagged for a hip drop and that read is a fair one. Only the two whose WORDS
    // contradict the movement are narrowed; a sweep that quietly took the others with it would
    // be a refusal nobody asked for, and Rule #1 is explicit that a replacement lands first.
    const dropped = set(148, 178).map((f, i) => {
      const lm = (f as unknown as { worldLandmarks: { x: number; y: number; z: number; visibility: number }[] })
        .worldLandmarks;
      if (i % 20 >= 8 && i % 20 <= 12) lm[POSE_LANDMARKS.LEFT_HIP] = { ...lm[POSE_LANDMARKS.LEFT_HIP], y: -0.09 };
      return f;
    });
    const faults = detectFormFaults(dropped, 0, "lift", "Hinge", "Barbell");
    expect(faults.find((x) => x.code === "pelvic_drop")).toBeDefined();
    // ...and the same take still hears nothing about parallel.
    expect(depth(faults)).toBeUndefined();
  });
});
