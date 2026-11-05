import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { restArrivalAfterPeak, REST_AT_TOP_SECONDS, REST_AT_TOP_EXTENT_MARGINS, summarizeTrackedSet } from "./bar-tracking";
import { measureCountermovement, APEX_MAX_SECONDS_AFTER_TAKEOFF } from "./jump-tracking";
import { kalmanSmooth } from "./bar-tracking";
import { cameraTunablesFor } from "@shared/camera-tunables-by-lift";

/* ROUND TEN, 2026-11-05: three rules, each stated on synthetic input so the property is what is
 * pinned and not one take's numbers (the takes are in ovr-2026-11-05-every-lift-reads-only-its-own-record.test.ts).
 *
 * 1. A REP ENDS WHEN THE BAR COMES TO REST (restArrivalAfterPeak). The Romanian deadlift's eighth
 *    pull was deleted as a re-rack on both 2026-11-05 sets and the 2026-10-19 take, every time
 *    because the recording ran on with the bar held at lockout and the segmenter made one
 *    2-3 second phase of the drive, the stand and the shrug after it. The rule cuts the rep at
 *    the rest, and ONLY when the phase goes on past the rest -- a rep that reverses out of its
 *    top is untouched.
 * 2. A SAMPLE-STARVED EDGE PHASE GOES FIRST when the athlete's count says there is one too many:
 *    the set-up phase of the 11-05 set 1 scored under the trim's floor and displaced the eighth.
 * 3. THE SENSOR'S WINDOW ON A JUMP runs to the hip's apex (measureCountermovement.riseToApex*).
 *
 * Six mutations, each run and caught by the case named: the rest cut applied without the drift
 * test ("a paused lockout that reverses"); the settle rule removed (bench-unrack-capture goes 9 ->
 * 10 in count-trim-never-empties-a-set.test.ts); the starved edge not ranked first (the set-1
 * cases in the 11-05 replay test); the apex search unbounded ("the apex is bounded"); the apex
 * fields present with no apex ("a trace that ends in flight"); and the rest found on the SMOOTHED
 * series (the source case below, and the 10-19 take's eighth rep in the 10-29 replay test).
 * The extent-over-the-window form is NOT separable from the first-sample form at four margins
 * on synthetic input -- it was at two, which is why the constant is four -- so "a creeping hold"
 * pins the constant and the behaviour, not the form. */

const times = (n: number, dt = 33) => Array.from({ length: n }, (_, i) => i * dt);

describe("a rep ends when the bar comes to rest", () => {
  // y is DOWN: the bar rises as y falls. A drive from 0 to -0.6 over 20 samples (0.66s), then a
  // hold, then what the caller appends.
  const drive = Array.from({ length: 21 }, (_, i) => -0.6 * (i / 20));

  it("cuts at the rest when the phase goes on past it: a hold of a second, then a shrug", () => {
    const hold = Array.from({ length: 40 }, (_, i) => -0.6 - 0.00025 * i); // creeps 1cm over 1.3s
    const shrug = [-0.63, -0.66, -0.69, -0.72];
    const y = [...drive, ...hold, ...shrug];
    const t = times(y.length);
    const peakIdx = 10;
    const rest = restArrivalAfterPeak(y, t, peakIdx, y.length - 1, 0.01);
    expect(rest).not.toBeNull();
    // the rest is found at the first sample from which a whole second stays inside the extent:
    // the top of the drive, give or take the hysteresis of the creep
    expect(rest!).toBeGreaterThanOrEqual(19);
    expect(rest!).toBeLessThanOrEqual(22);
  });

  it("a paused lockout that reverses out of its top is untouched: the phase ends inside the rest", () => {
    const hold = Array.from({ length: 40 }, () => -0.6);
    const y = [...drive, ...hold]; // the segmenter's phase ends at the top; the lowering is the next phase
    const t = times(y.length);
    expect(restArrivalAfterPeak(y, t, 10, y.length - 1, 0.01)).toBeNull();
  });

  it("a creeping hold is a rest: the extent over the window, not the distance from its first sample", () => {
    // 3cm of creep over the second (the 2026-10-19 hold), then an 8cm drift
    const hold = Array.from({ length: 31 }, (_, i) => -0.6 - 0.001 * i);
    const after = [-0.64, -0.67, -0.70];
    const y = [...drive, ...hold, ...after];
    const t = times(y.length);
    expect(REST_AT_TOP_EXTENT_MARGINS).toBe(4);
    expect(restArrivalAfterPeak(y, t, 10, y.length - 1, 0.01)).not.toBeNull();
    // and a bar that keeps moving at a rep's pace is never at rest
    const moving = Array.from({ length: 31 }, (_, i) => -0.6 - 0.01 * i);
    expect(restArrivalAfterPeak([...drive, ...moving], times(drive.length + moving.length), 10, drive.length + moving.length - 1, 0.01)).toBeNull();
  });

  it("needs a whole second: a shorter pause is a sticking point, not a rest", () => {
    expect(REST_AT_TOP_SECONDS).toBe(1.0);
    const pause = Array.from({ length: 15 }, () => -0.6); // 0.5s
    const after = [-0.63, -0.66, -0.69, -0.72];
    const y = [...drive, ...pause, ...after];
    expect(restArrivalAfterPeak(y, times(y.length), 10, y.length - 1, 0.01)).toBeNull();
  });

  it("the rule is inert on a set whose every rep reverses out of its top, and the rep count is untouched by a hold", () => {
    // five squat-like reps, then the recording runs on for two seconds at lockout with a shrug
    const rep = (n: number) => Array.from({ length: n }, (_, i) => Math.sin((i / n) * Math.PI));
    const down = rep(30).map((v) => 0.7 * v);
    const y: number[] = [];
    for (let r = 0; r < 5; r++) y.push(...down);
    const bottomToTop = y.length;
    const holdPlusShrug = [...Array.from({ length: 60 }, () => 0), -0.02, -0.05, -0.08, -0.1];
    const trace = [...y, ...holdPlusShrug];
    const points = trace.map((v, i) => ({ t: i * 33, x: 0, y: v, z: 0, confidence: 1 }));
    const tune = cameraTunablesFor("Back Squat", "squat");
    const m = summarizeTrackedSet(points, 61, 72, "eccentric", [], 1, false, "squat", { x: 0, y: 1 }, 5, tune)!;
    expect(m.repBreakdown.length).toBe(5);
    expect(m.repBreakdown.slice(0, 4).every((r: any) => r.windows.heldAtTopSeconds === 0)).toBe(true);
    expect(bottomToTop).toBeGreaterThan(0);
  });
});

describe("the sensor's window on a jump runs to the hip's apex", () => {
  // y DOWN in metres: standing at 1.0, dip to 1.3, drive up through takeoff at 0.9 to an apex at
  // 0.55, then the hip comes down onto the box (0.65) and settles.
  const hip = (() => {
    const pts: { t: number; x: number; y: number; z: number; confidence: number }[] = [];
    let t = 0;
    const push = (y: number) => { pts.push({ t, x: 0, y, z: 0, confidence: 1 }); t += 50; };
    for (let i = 0; i < 10; i++) push(1.0); // standing
    for (let i = 1; i <= 6; i++) push(1.0 + 0.05 * i); // dip to 1.3 over 0.3s
    for (let i = 1; i <= 8; i++) push(1.3 - 0.05 * i); // drive to 0.9 over 0.4s (takeoff)
    for (let i = 1; i <= 10; i++) push(0.9 - 0.035 * i); // flight up to 0.55 over 0.5s, slowing as a flight does not -- the window, not the shape, is under test
    for (let i = 1; i <= 2; i++) push(0.55 + 0.05 * i); // onto the box
    for (let i = 0; i < 10; i++) push(0.65);
    return pts;
  })();
  const smoothed = hip.map((p) => p.y); // already smooth; the smoother is not what is under test
  const takeoffT = hip[10 + 6 + 7].t; // index 23: the last drive sample, y 0.9

  it("reads the rise to the apex and its time, beside the drive to takeoff", () => {
    const cm = measureCountermovement(hip, smoothed, null, takeoffT)!;
    expect(cm).not.toBeNull();
    expect(cm.dipDepthCm).toBeCloseTo(30, 0);
    expect(cm.concentricRiseCm).toBeCloseTo(40, 0);
    expect(cm.riseToApexCm).toBeCloseTo(75, 0);
    expect(cm.riseToApexSeconds).toBeCloseTo(0.9, 2); // the dip bottoms at index 15, the apex at 33
    expect(cm.riseToApexMeanVelocityMps).toBeCloseTo(0.83, 2);
    expect(cm.apexT).toBe(hip[10 + 6 + 7 + 10].t);
    expect(cm.riseToApexMeanVelocityMps!).toBeLessThan(cm.concentricMeanVelocityMps);
  });

  it("a trace that ends in flight has no apex and says so by leaving the fields absent", () => {
    const cut = hip.slice(0, 10 + 6 + 7 + 4);
    const cm = measureCountermovement(cut, cut.map((p) => p.y), null, takeoffT)!;
    expect(cm).not.toBeNull();
    expect(cm.riseToApexCm).toBeUndefined();
    expect(cm.riseToApexMeanVelocityMps).toBeUndefined();
  });

  it("the apex is bounded: a hip still 'rising' a second after takeoff is the tracker, not a jump", () => {
    expect(APEX_MAX_SECONDS_AFTER_TAKEOFF).toBe(1.0);
    // rises 1cm a sample for two seconds, then comes down: an apex two seconds out is not a jump's
    const up = Array.from({ length: 40 }, (_, i) => ({ t: takeoffT + 50 * (i + 1), x: 0, y: 0.9 - 0.01 * (i + 1), z: 0, confidence: 1 }));
    const down = Array.from({ length: 5 }, (_, i) => ({ t: takeoffT + 50 * (41 + i), x: 0, y: 0.5 + 0.02 * (i + 1), z: 0, confidence: 1 }));
    const drift = hip.slice(0, 10 + 6 + 8).concat(up, down);
    const cm = measureCountermovement(drift, drift.map((p) => p.y), null, takeoffT)!;
    expect(cm.riseToApexCm).toBeUndefined();
  });
});

describe("the source states the three rules where they are applied", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  const bar = strip(readFileSync(join(__dirname, "bar-tracking.ts"), "utf8"));
  it("every measurement on a rep reads to repEndIdx, and the count-trim's window does too", () => {
    for (const needle of [
      "trimPhaseToTravel(ySmoothed, phase.startIdx, repEndIdx,",
      "trimPhaseToDrive(speedsMps, phase.startIdx, repEndIdx,",
      "Math.abs(ySmoothed[repEndIdx] - ySmoothed[phase.startIdx])",
      "Math.abs(points[phase.repEndIdx].y - points[phase.startIdx].y)",
      "seconds(ecc ? ecc.startIdx : phase.startIdx, phase.repEndIdx)",
      "if (phaseStats[i].windows.sampleStarved) score = Math.max(score, MIN_COUNT_TRIM_ODDNESS)",
    ]) expect(bar, needle).toContain(needle);
    // the rest is found on the RAW series, never the smoothed one (the Kalman overshoot at lockout
    // read as movement inside the 2026-10-19 hold on the smoothed series)
    expect(bar).toContain("restArrivalAfterPeak(points.map((p) => p.y), points.map((p) => p.t),");
    expect(bar).not.toContain("restArrivalAfterPeak(ySmoothed,");
  });
});
