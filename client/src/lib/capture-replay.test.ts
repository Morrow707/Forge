import { describe, it, expect } from "vitest";
import { replayCapture, replayCaptureScaleFree, replayAll, type StoredCapture } from "./capture-replay";
import type { PathTracePoint } from "./bar-tracking";

// A stored trace in real-world metres, the way a calibrated set saves it: reps of a given range
// of motion, each slightly shorter than the last the way a real set fatigues.
function storedTrace(repCount: number, romMetres: number, repSeconds = 2): PathTracePoint[] {
  const trace: PathTracePoint[] = [];
  const samplesPerRep = 60;
  let t = 0;
  for (let rep = 0; rep < repCount; rep++) {
    const thisRep = romMetres * (1 - rep * 0.03);
    for (let i = 0; i < samplesPerRep; i++) {
      const phase = i / samplesPerRep;
      const y = phase < 0.5 ? phase * 2 * thisRep : (1 - phase) * 2 * thisRep;
      trace.push({ t, x: 0, y });
      t += (repSeconds * 1000) / samplesPerRep;
    }
  }
  return trace;
}

const squatSet: StoredCapture = {
  setId: 1,
  exerciseName: "Back Squat",
  heightIn: 70,
  loadKg: 100,
  loggedReps: 5,
  barPathTrace: storedTrace(5, 0.5),
};

describe("replayCapture", () => {
  it("re-derives a set's numbers from its stored trace alone, with no device", () => {
    const result = replayCapture(squatSet);
    expect(result.metrics).not.toBeNull();
    expect(result.repCount).toBeGreaterThan(0);
    expect(result.metrics!.romCm).toBeGreaterThan(30);
  });

  it("reports the gap between what was logged and what the analysis found", () => {
    const result = replayCapture({ ...squatSet, loggedReps: 3 });
    expect(result.repCountError).toBe(result.repCount - 3);
  });

  it("leaves the comparison null when the athlete logged no rep count", () => {
    expect(replayCapture({ ...squatSet, loggedReps: null }).repCountError).toBeNull();
  });

  // The check that catches a scale several times wrong, run here without a camera.
  it("flags a range of motion that is impossible for the athlete's height", () => {
    const absurd: StoredCapture = { ...squatSet, barPathTrace: storedTrace(5, 3.0) };
    expect(replayCapture(absurd).romProblem).not.toBeNull();
    expect(replayCapture(squatSet).romProblem).toBeNull();
  });

  it("survives a trace too short to hold a rep instead of throwing", () => {
    const stub: StoredCapture = { ...squatSet, barPathTrace: [{ t: 0, x: 0, y: 0 }] };
    const result = replayCapture(stub);
    expect(result.metrics).toBeNull();
    expect(result.repCount).toBe(0);
  });
});

describe("replayCaptureScaleFree", () => {
  // The only way to check the scale-free path against a take whose true numbers are known: run a
  // set that DID calibrate as if it had not, and see whether the scale-free half agrees.
  it("recovers the same rep count as the calibrated run", () => {
    const calibrated = replayCapture(squatSet);
    const free = replayCaptureScaleFree(squatSet);
    expect(free).not.toBeNull();
    expect(free!.repCount).toBe(calibrated.repCount);
  });

  // Close but not equal, and the harness is how that was found. Velocity loss is a ratio and so
  // survives losing the scale, but the two paths segment reps differently -- the calibrated run
  // splits on an absolute centimetre floor, the scale-free run on each reversal's size relative
  // to the take's own typical rep. Same rep COUNT, slightly different rep BOUNDARIES, so the
  // per-rep mean velocities the ratio is built from differ a little. On this fixture that is
  // about 1.7 points on a figure near 10, which is ~16% relative and worth knowing about before
  // anyone compares a bench number against a squat number.
  //
  // The tolerance here is not a calibrated value. It is wide enough to hold the difference this
  // fixture shows and tight enough to fail if the two paths genuinely diverge, and it should be
  // replaced with a measured bound once real captures have been through this harness.
  it("agrees on velocity loss to within a few points, since it is a ratio either way", () => {
    const calibrated = replayCapture(squatSet).metrics!;
    const free = replayCaptureScaleFree(squatSet)!;
    expect(calibrated.velocityLossPercent).not.toBeNull();
    expect(free.velocityLossPercent).not.toBeNull();
    expect(Math.abs(free.velocityLossPercent! - calibrated.velocityLossPercent!)).toBeLessThan(3);
  });
});

describe("replayAll", () => {
  it("summarises a batch so a threshold change is visible across all of it at once", () => {
    const summary = replayAll([
      squatSet,
      { ...squatSet, setId: 2, loggedReps: 99 },
      { ...squatSet, setId: 3, barPathTrace: storedTrace(5, 3.0) },
    ]);
    expect(summary.captureCount).toBe(3);
    expect(summary.analysed).toBe(3);
    expect(summary.repCountMismatches).toBeGreaterThanOrEqual(1);
    expect(summary.implausibleScale).toBe(1);
    expect(summary.meanAbsRepError).not.toBeNull();
  });

  it("handles an empty batch without dividing by zero", () => {
    const summary = replayAll([]);
    expect(summary.captureCount).toBe(0);
    expect(summary.meanAbsRepError).toBeNull();
  });
});
