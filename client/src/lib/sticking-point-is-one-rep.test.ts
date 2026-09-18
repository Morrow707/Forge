import { describe, it, expect } from "vitest";
import { segmentPhasesRelative } from "./bar-tracking";

// WHAT THIS FILE IS ABOUT.
//
// Ten bench reps at 155lb, filmed against an OVR bar sensor in the same session, came back as
// fifteen. The scale was not the problem -- the set mean was 0.73 m/s tracked against 0.705
// measured, 3.5% high -- but the per-rep peaks ran 0.24 to 1.96 m/s against OVR's 0.91 to 1.10.
// An eightfold spread at one load is not a lift, it is one rep reported as two: a fast fragment
// and a slow fragment whose average is still about right, which is why the set aggregate looked
// fine and hid this for days. See tracker-ground-truth.ts, OVR_BENCH_2026_09_18.
//
// The splitter is a zigzag: a reversal ends a phase once the trace retraces further than the
// amplitude gate. So the whole question is what the gate is, and a bench press supplies the
// worst case for getting it wrong -- the sticking point, a real re-descent of a few centimetres
// partway up, which is one rep and looks like two reversals.

/** A bench set with a sticking-point dip partway up each ascent, in metres.
 *
 * Shaped like the real thing rather than a sine: a controlled descent, a fast drive off the
 * chest, a dip as the bar slows through the sticking point, then lockout. `stickCm` is how far
 * the bar actually travels back down at the sticking point -- 0 for a clean rep, 4-6cm for a
 * hard one, more than that and the rep is genuinely failing.
 */
function stickingBench(reps: number, ampCm: number, stickCm: number, noiseCm = 0.3) {
  const out: number[] = [];
  const noise = (i: number) => (noiseCm / 100) * Math.sin(i * 1.7) * 0.5;
  let i = 0;
  const amp = ampCm / 100;
  const stick = stickCm / 100;
  // The athlete settling under the bar before the first rep.
  for (let k = 0; k < 10; k++) out.push(noise(i++));
  for (let r = 0; r < reps; r++) {
    for (let k = 1; k <= 8; k++) out.push(-amp * (k / 8) + noise(i++)); // descent
    for (let k = 1; k <= 4; k++) out.push(-amp + amp * 0.45 * (k / 4) + noise(i++)); // drive
    for (let k = 1; k <= 3; k++) out.push(-amp + amp * 0.45 - stick * (k / 3) + noise(i++)); // stick
    const low = -amp + amp * 0.45 - stick;
    for (let k = 1; k <= 6; k++) out.push(low + (0 - low) * (k / 6) + noise(i++)); // lockout
  }
  return out;
}

// segmentPhases yields one entry per HALF rep -- a descent and an ascent -- plus one boundary
// phase leading out of the settling wobble into the first rep. Ten reps is 21 phases.
const PHASES_FOR_TEN_REPS = 21;

// What summarizeTrackedSet passes: MIN_REP_AMPLITUDE_FLOOR_CM, in metres.
const FLOOR = 0.08;

describe("a sticking point is part of a rep, not a rep boundary", () => {
  it("counts ten reps as ten through dips of 0 to 6cm", () => {
    // The band that matters. A 4-6cm re-descent is an ordinary hard rep near a max, and before
    // the fix a dip in this band was enough to split the set.
    for (const stickCm of [0, 2, 4, 6]) {
      const phases = segmentPhasesRelative(stickingBench(10, 38, stickCm), FLOOR);
      expect(phases, `${stickCm}cm dip`).not.toBeNull();
      expect(phases!.length, `${stickCm}cm dip`).toBe(PHASES_FOR_TEN_REPS);
    }
  });

  it("holds through dips deep enough that the rep is visibly failing", () => {
    // 12cm back down on a 38cm press is nearly a third of the lift and an extreme case. It is
    // still ONE rep -- the bar never returned to the chest and never locked out in between.
    for (const stickCm of [8, 10, 12]) {
      expect(segmentPhasesRelative(stickingBench(10, 38, stickCm), FLOOR)!.length, `${stickCm}cm`)
        .toBe(PHASES_FOR_TEN_REPS);
    }
  });

  it("counts a short-ROM arched bench correctly, where the absolute gate cannot", () => {
    // 18cm of bar travel, under the 20cm BASE_MIN_REP_AMPLITUDE_CM. An absolute gate merges
    // every rep of this set into its neighbours; the relative gate is derived from the set.
    expect(segmentPhasesRelative(stickingBench(10, 18, 4), FLOOR)!.length).toBe(
      PHASES_FOR_TEN_REPS,
    );
  });

  it("does not let the last reps shortening under fatigue split the earlier ones", () => {
    // Eight reps at full depth then two at 17cm, which is what a set taken to failure looks
    // like. The short reps must neither be dropped nor drag the gate down onto the long ones.
    const fatigued = [...stickingBench(8, 38, 4), ...stickingBench(2, 17, 4)];
    expect(segmentPhasesRelative(fatigued, FLOOR)!.length).toBe(PHASES_FOR_TEN_REPS);
  });

  it("is not dragged off by one wild tracking frame", () => {
    // The reason the largest reversal cannot simply BE the rep size. A single bad pose frame
    // four times the height of the lift is one value; the reps are many, and the cut falls back
    // through looser fractions until it has a real population to take the median of.
    const clean = stickingBench(10, 38, 6);
    const spiked = [...clean];
    spiked[Math.floor(spiked.length / 2)] = 1.5;
    expect(segmentPhasesRelative(spiked, FLOOR)!.length).toBeLessThanOrEqual(
      PHASES_FOR_TEN_REPS + 2,
    );
  });

  it("still resolves a two-rep set, where there is barely a population at all", () => {
    expect(segmentPhasesRelative(stickingBench(2, 38, 6), FLOOR)!.length).toBe(5);
  });
});

describe("the floor is what tells 'small reps' from 'no reps'", () => {
  // A purely relative gate cannot answer this: with nothing but noise in the take, the noise IS
  // the large population, so it elects itself typical and every wobble becomes a rep. That
  // question needs a real-world size, which is the only thing the floor supplies.
  const noise: number[] = [];
  for (let i = 0; i < 400; i++) {
    noise.push(0.004 * Math.sin(i * 1.3) + 0.003 * Math.sin(i * 0.41));
  }

  it("segments a take containing no reps into no reps", () => {
    expect(segmentPhasesRelative(noise, FLOOR)!.length).toBeLessThanOrEqual(2);
  });

  it("without a floor, that same take is hundreds of reps -- so the floor is load-bearing", () => {
    // Guards the scale-free path too: it is correct for it to have no floor (pixel-space has no
    // centimetres to compare against), and this is the cost of that, stated rather than
    // discovered. Anything reading a scale-free trace has to reject it some other way.
    expect(segmentPhasesRelative(noise)!.length).toBeGreaterThan(50);
  });

  it("does not raise the gate above a real rep on a lift that is genuinely short", () => {
    // The floor is 8cm because nothing under 8cm is a rep of anything -- NOT because reps are
    // 8cm. It must stay under the real reps of the shortest lift the tracker sees.
    expect(segmentPhasesRelative(stickingBench(10, 12, 2), FLOOR)!.length).toBe(
      PHASES_FOR_TEN_REPS,
    );
  });
});
