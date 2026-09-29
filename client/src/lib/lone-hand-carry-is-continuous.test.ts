import { describe, it, expect } from "vitest";
import {
  BAR_POINT_SOURCES,
  MIN_RECENT_HALF_SPANS,
  RECENT_HALF_SPAN_FRAMES,
  barPointFromSides,
  buildPathTrace,
  carryHalfSpan,
  type TrackedPoint,
} from "./bar-tracking";
import { replayCapture, type StoredCapture } from "./capture-replay";

// Scott's bench, 2026-09-29, set 3: the bar tilted 26 degrees toward one arm, 92 of 914 bar
// points carried from a lone hand in short runs, and per-rep means up to a third off the sensor
// either way while the set average sat within a twentieth. The carry used the SET's median
// half-span, so whenever the bar's tilt at that moment differed from its typical tilt the trace
// stepped at the transition in and out. This pins the two halves of the answer: the carry is
// continuous when the bar was just seen whole, and every point says which witness built it.

describe("carryHalfSpan", () => {
  // A set whose typical half-span is flat (tilt 0) but whose bar is tilted right now.
  const flat = Array.from({ length: 40 }, (_, i) => ({ x: 0.3, y: 0.0, frame: i }));
  const tiltedNow = Array.from({ length: MIN_RECENT_HALF_SPANS }, (_, i) => ({ x: 0.3, y: 0.08, frame: 100 + i }));

  it("carries by the recent measurements when the bar was just seen whole", () => {
    const carry = carryHalfSpan([...flat, ...tiltedNow], 100 + MIN_RECENT_HALF_SPANS + 2);
    expect(carry!.y).toBeCloseTo(0.08, 6);
  });

  it("falls back to the set's median once the last whole view is stale", () => {
    const carry = carryHalfSpan([...flat, ...tiltedNow], 100 + MIN_RECENT_HALF_SPANS + RECENT_HALF_SPAN_FRAMES + 1);
    expect(carry!.y).toBeCloseTo(0, 6);
  });

  it("needs a median's worth of recent readings, so one jumped frame cannot be the carry", () => {
    const oneJumped = [...flat, { x: 0.3, y: 0.5, frame: 100 }];
    expect(carryHalfSpan(oneJumped, 101)!.y).toBeCloseTo(0, 6);
  });

  it("makes the lone-hand point continue the both-hands trace on a tilted bar", () => {
    // Both hands seen for three frames on a bar tilted so the right hand sits 0.08 higher, then
    // the right hand vanishes. The midpoint must not move.
    const history = [0, 1, 2].map((frame) => ({ x: 0.3, y: 0.08, frame }));
    const both = barPointFromSides({ x: -0.3, y: 0.92, confidence: 1 }, { x: 0.3, y: 1.08, confidence: 1 }, null);
    const lone = barPointFromSides({ x: -0.3, y: 0.92, confidence: 1 }, null, carryHalfSpan(history, 3), both.point);
    expect(lone.point!.y).toBeCloseTo(both.point!.y, 6);
    expect(lone.point!.x).toBeCloseTo(both.point!.x, 6);
  });
});

describe("every stored point says which witness built it", () => {
  it("writes the source tag into the trace and leaves older points untagged", () => {
    const points: TrackedPoint[] = [
      { t: 0, x: 0, y: 0, z: 0, confidence: 1, source: "b" },
      { t: 33, x: 0.01, y: 0.02, z: 0, confidence: 0.8, source: "l" },
      { t: 66, x: 0.02, y: 0.04, z: 0, confidence: 0.8 },
    ];
    const trace = buildPathTrace(points, { x: 0, y: 0 });
    expect(trace.map((p) => p.s)).toEqual(["b", "l", undefined]);
    for (const key of Object.keys(BAR_POINT_SOURCES)) expect(key.length).toBe(1);
  });

  it("lets the replay harness report each rep's inferred fraction and side flips", () => {
    // Four reps of a 40cm press at one point every 33ms, the third rep half carried.
    const trace: StoredCapture["barPathTrace"] = [];
    let t = 0;
    for (let rep = 0; rep < 4; rep++) {
      for (let i = 0; i < 30; i++) {
        const phase = i < 15 ? i / 15 : (30 - i) / 15;
        trace.push({ t, x: 0, y: -40 * phase, c: 1, s: rep === 2 && i % 2 === 0 ? (i % 4 === 0 ? "f" : "l") : "b" });
        t += 33;
      }
    }
    const result = replayCapture({ exerciseName: "Bench Press", heightIn: 75, loadKg: 60, loggedReps: 4, barPathTrace: trace });
    expect(result.repCount).toBe(4);
    expect(result.repSources).not.toBeNull();
    const third = result.repSources!.find((r) => r.repNumber === 3)!;
    expect(third.inferredFraction).toBeGreaterThan(0.2);
    expect(third.sideFlips).toBeGreaterThan(0);
    expect(result.repSources!.find((r) => r.repNumber === 1)!.inferredFraction).toBe(0);
  });

  it("reports null for a trace written before the tag existed", () => {
    const trace: StoredCapture["barPathTrace"] = [];
    let t = 0;
    for (let rep = 0; rep < 3; rep++) for (let i = 0; i < 30; i++) { trace.push({ t, x: 0, y: -40 * (i < 15 ? i / 15 : (30 - i) / 15), c: 1 }); t += 33; }
    const result = replayCapture({ exerciseName: "Bench Press", heightIn: 75, loadKg: 60, loggedReps: 3, barPathTrace: trace });
    expect(result.repSources).toBeNull();
  });
});
