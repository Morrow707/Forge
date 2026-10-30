import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyBoxRiseCorrection,
  applyGravityCorrection,
  measureCountermovement,
  scaleCountermovement,
  COUNTERMOVEMENT_HYSTERESIS_M,
  type JumpCountermovement,
  type JumpRep,
} from "./jump-tracking";
import type { TrackedPoint } from "./bar-tracking";

/** Block comments first, then line comments: a negative assertion over source must not be
 *  satisfied or defeated by prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

// Scott, 2026-10-01: "Will the camera differentiate between the loading drop portion, and the
// rise concentric, back to the landing eccentric?" The ankle trace marks takeoff and landing;
// the dip happens at the hip. This reads it off a hip trace so a hip-mounted sensor (the OVR on
// a finger, hands on hips) has a matching window on the camera's side.

// A hip that stands at y=1.00 (y down), dips 30cm over 0.4s, drives up 36cm over 0.3s to
// takeoff, then flies. 120 samples a second.
function syntheticHip(): { points: TrackedPoint[]; takeoffT: number } {
  const points: TrackedPoint[] = [];
  const dt = 1000 / 120;
  let t = 0;
  const push = (y: number) => {
    points.push({ t, x: 0, y, z: 0, confidence: 1 });
    t += dt;
  };
  for (let i = 0; i < 60; i++) push(1.0 + (Math.sin(i) * 0.002)); // standing, 2mm jitter
  for (let i = 1; i <= 48; i++) push(1.0 + 0.3 * (i / 48)); // eccentric 0.4s
  for (let i = 1; i <= 36; i++) push(1.3 - 0.36 * (i / 36)); // concentric 0.3s
  const takeoffT = points[points.length - 1].t;
  for (let i = 1; i <= 40; i++) push(0.94 - 0.5 * Math.sin((i / 40) * Math.PI)); // flight
  return { points, takeoffT };
}

describe("the countermovement is read off the hip", () => {
  it("finds standing, the bottom and the drive with the right distances and durations", () => {
    const { points, takeoffT } = syntheticHip();
    const cm = measureCountermovement(points, points.map((p) => p.y), null, takeoffT)!;
    expect(cm).not.toBeNull();
    expect(cm.dipDepthCm).toBeGreaterThan(29);
    expect(cm.dipDepthCm).toBeLessThan(31);
    expect(cm.eccentricSeconds).toBeGreaterThan(0.35);
    expect(cm.eccentricSeconds).toBeLessThan(0.45);
    expect(cm.concentricSeconds).toBeGreaterThan(0.27);
    expect(cm.concentricSeconds).toBeLessThan(0.33);
    expect(cm.concentricRiseCm).toBeGreaterThan(35);
    expect(cm.concentricRiseCm).toBeLessThan(37);
    // 0.36m over 0.3s
    expect(cm.concentricMeanVelocityMps).toBeGreaterThan(1.1);
    expect(cm.concentricMeanVelocityMps).toBeLessThan(1.3);
    expect(cm.concentricPeakVelocityMps).toBeGreaterThanOrEqual(cm.concentricMeanVelocityMps);
    expect(cm.bottomT).toBeGreaterThan(cm.standingT);
    expect(cm.bottomT).toBeLessThan(takeoffT);
  });

  it("is null, never a number, when the hip did not dip before takeoff", () => {
    const points: TrackedPoint[] = [];
    for (let i = 0; i < 100; i++) points.push({ t: i * 8.33, x: 0, y: 1.0 + Math.sin(i) * 0.003, z: 0, confidence: 1 });
    expect(measureCountermovement(points, points.map((p) => p.y), null, points[99].t)).toBeNull();
    expect(COUNTERMOVEMENT_HYSTERESIS_M).toBe(0.01);
  });

  it("does not reach back past the previous landing", () => {
    const { points, takeoffT } = syntheticHip();
    // A window that opens after the dip bottomed out: no standing position to measure from.
    const bottomT = points[60 + 48].t;
    const cm = measureCountermovement(points, points.map((p) => p.y), bottomT + 50, takeoffT);
    expect(cm).toBeNull();
  });

  it("a scale correction divides the centimetres and velocities and leaves the clocks alone", () => {
    const cm: JumpCountermovement = {
      standingT: 100, bottomT: 500, dipDepthCm: 30, eccentricSeconds: 0.4, eccentricMeanVelocityMps: 0.75,
      concentricSeconds: 0.3, concentricRiseCm: 36, concentricMeanVelocityMps: 1.2, concentricPeakVelocityMps: 2.4,
    };
    const scaled = scaleCountermovement(cm, 1.2);
    expect(scaled.dipDepthCm).toBe(25);
    expect(scaled.concentricRiseCm).toBe(30);
    expect(scaled.concentricMeanVelocityMps).toBe(1);
    expect(scaled.concentricPeakVelocityMps).toBe(2);
    expect(scaled.eccentricSeconds).toBe(0.4);
    expect(scaled.concentricSeconds).toBe(0.3);
    expect(scaled.standingT).toBe(100);
  });

  it("the jump dialog hands the hip trace in, the gravity ruler scales it, and the schema declares it", () => {
    const dialog = readFileSync("client/src/components/av-jump-tracker-dialog.tsx", "utf8");
    expect(dialog).toMatch(/deriveHipPoint\(/);
    expect(dialog).toMatch(/hipTrace\s*\}/);
    const tracker = stripComments(readFileSync("client/src/lib/jump-tracking.ts", "utf8"));
    expect(tracker.match(/scaleCountermovement\(rep\.countermovement, ratio\)/g)?.length).toBe(1);
    const schema = readFileSync("shared/schema.ts", "utf8");
    expect(schema).toMatch(/countermovement: z\s*\.object/);
  });

  // THE BOX RULER MEASURES THE LANDING; THE DRIVE HAPPENED AT THE FLOOR (2026-10-30). On the 697
  // pairing the box-rise ratio (1.20 / 1.22) divided the hip's drive velocities and read the peak
  // 15% and 29% low against the OVR on the hip, while the undivided hip read +2% and -13%. The
  // height ruler read the same scale on the box sets as on the squats filmed from the same spot,
  // so the ratio is the landing sitting nearer the lens than the takeoff, not a scale error of
  // the floor -- see the docblock on applyBoxRiseCorrection. The gravity ruler compares flight
  // time with displacement at ONE spot, so its ratio IS a floor scale error and still scales the
  // drive. Behaviour first, then the source, comments stripped: a comment quoting the old line
  // is exactly where the forbidden form would hide.
  it("the box ruler corrects the landing numbers and leaves the hip's drive at the floor scale", () => {
    const cm = (): JumpCountermovement => ({
      standingT: 100, bottomT: 500, dipDepthCm: 30, eccentricSeconds: 0.4, eccentricMeanVelocityMps: 0.75,
      concentricSeconds: 0.3, concentricRiseCm: 36, concentricMeanVelocityMps: 1.2, concentricPeakVelocityMps: 2.4,
    });
    const boxRep = (netRiseCm: number): JumpRep => ({
      repNumber: 1, takeoffT: 0, landingT: 400, flightSeconds: 0.4, jumpHeightCm: 20, peakHeightCm: 73,
      netRiseCm, horizontalDistanceCm: null, groundContactSeconds: null, likelyTrackingGlitch: false,
      boxClearanceCm: null, countermovement: cm(),
    });
    const reps = [boxRep(73.2), boxRep(73.2), boxRep(73.2)];
    const verdict = applyBoxRiseCorrection(reps, 61);
    expect(verdict.applied).toBe(true);
    expect(verdict.scaleErrorRatio).toBeCloseTo(1.2, 3);
    for (const rep of reps) {
      expect(rep.netRiseCm).toBeCloseTo(61, 0);
      expect(rep.countermovement?.concentricPeakVelocityMps).toBe(2.4);
      expect(rep.countermovement?.concentricMeanVelocityMps).toBe(1.2);
      expect(rep.countermovement?.dipDepthCm).toBe(30);
      expect(rep.countermovement?.uncorrectedConcentricPeakVelocityMps).toBeUndefined();
    }
    const flat = [boxRep(0), boxRep(0)];
    expect(applyGravityCorrection(flat, { scaleErrorRatio: 1.2, uncertaintyFraction: 0.1, repsUsed: 2 })).toBe(true);
    for (const rep of flat) {
      expect(rep.countermovement?.concentricPeakVelocityMps).toBe(2);
      expect(rep.countermovement?.uncorrectedConcentricPeakVelocityMps).toBe(2.4);
    }
    const tracker = stripComments(readFileSync("client/src/lib/jump-tracking.ts", "utf8"));
    const boxBody = tracker.slice(
      tracker.indexOf("export function applyBoxRiseCorrection("),
      tracker.indexOf("export const GRAVITY_CORRECTION_MAX_UNCERTAINTY"),
    );
    expect(boxBody.length).toBeGreaterThan(200);
    expect(boxBody).not.toMatch(/scaleCountermovement\(/);
    expect(boxBody).toMatch(/rep\.netRiseCm = /);
  });
});
