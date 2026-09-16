import { describe, it, expect } from "vitest";
import { summarizeTrackedSet } from "./bar-tracking";

/** Time-to-peak velocity and EAI are withheld when the trace cannot locate the peak.
 *
 * The behaviour being pinned came out of replaying the 13 stored bench captures against a bar
 * sensor's 0.26s reference. Those traces sit at 6.9-14.1Hz -- decimated by the old 200-point
 * TRACE_MAX_POINTS cap, raw ~30Hz divided by a stride of 3 -- which puts a median of 5 velocity
 * samples in a concentric phase. Every time-to-peak they produced was a multiple of the sample
 * interval, and 31 of 186 reps reported exactly 0, which read as "peaked instantly" and actually
 * meant "peak landed on the first sample of the phase".
 *
 * Both halves matter and they pull in opposite directions, so both are tested: a dense trace must
 * still publish (this must not quietly blank out good captures), and a sparse one must not.
 */

/** A rep as a position trace: down `romM` metres and back up, sampled every `dtMs`. The peak of
 * the concentric sits deliberately off-centre so there is a real answer to get wrong. */
function repTrace(dtMs: number, romM = 0.4, reps = 3) {
  const pts: { t: number; x: number; y: number; z: number }[] = [];
  let t = 0;
  for (let r = 0; r < reps; r++) {
    // Eccentric: linear descent over 1.2s.
    for (let ms = 0; ms < 1200; ms += dtMs, t += dtMs) {
      pts.push({ t, x: 0, y: -romM * (ms / 1200), z: 0 });
    }
    // Concentric: 0.6s up, fastest around a third of the way through, then decelerating.
    for (let ms = 0; ms < 600; ms += dtMs, t += dtMs) {
      const f = ms / 600;
      const eased = Math.min(1, 1 - Math.pow(1 - f, 1.6));
      pts.push({ t, x: 0, y: -romM * (1 - eased), z: 0 });
    }
    // Brief pause at lockout so the segmenter has a boundary to find.
    for (let ms = 0; ms < 400; ms += dtMs, t += dtMs) pts.push({ t, x: 0, y: 0, z: 0 });
  }
  return pts;
}

const analyse = (pts: ReturnType<typeof repTrace>) =>
  summarizeTrackedSet(pts, undefined, undefined, undefined, [], 1, true);

describe("time-to-peak velocity below the sample-density floor", () => {
  it("publishes it on a densely sampled trace", () => {
    // 30Hz -- what the pipeline actually captures, and what a full-rate stored trace now keeps.
    const m = analyse(repTrace(33));
    const reps = m?.repBreakdown ?? [];
    expect(reps.length).toBeGreaterThan(0);
    const measured = reps.filter((r) => r.timeToPeakVelocitySeconds !== null);
    expect(measured.length).toBeGreaterThan(0);
    for (const r of measured) expect(r.timeToPeakVelocitySeconds).toBeGreaterThan(0);
  });

  it("withholds it on a trace sampled too coarsely to locate the peak", () => {
    // 5Hz: a 600ms concentric holds 3 samples, so any "time to peak" is a read-off of the grid.
    const reps = analyse(repTrace(200))?.repBreakdown ?? [];
    expect(reps.length).toBeGreaterThan(0);
    for (const r of reps) expect(r.timeToPeakVelocitySeconds).toBeNull();
  });

  it("never reports zero, which is what the sparse case used to produce", () => {
    // The specific regression. Zero is not a fast rep, it is the absence of a measurement, and it
    // was reaching coaches as a number on 17% of the reps in the stored bench corpus.
    for (const dt of [200, 150, 111, 67, 33]) {
      for (const r of analyse(repTrace(dt))?.repBreakdown ?? []) {
        expect(r.timeToPeakVelocitySeconds).not.toBe(0);
      }
    }
  });

  it("withholds EAI with it, since EAI divides by it", () => {
    for (const r of analyse(repTrace(200))?.repBreakdown ?? []) {
      expect(r.eai).toBeNull();
    }
  });

  it("does not drag the set's mean EAI down with the withheld reps", () => {
    // Counting a withheld rep as zero in the average would reintroduce the same error the
    // withholding removes, scaled by how coarse the trace was.
    const m = analyse(repTrace(200));
    expect(m?.meanEai).toBeNull();
    const dense = analyse(repTrace(33));
    if (dense?.meanEai !== null && dense?.meanEai !== undefined) {
      expect(dense.meanEai).toBeGreaterThan(0);
    }
  });

  it("still reports the metrics that a coarse trace CAN support", () => {
    // Withholding is targeted, not a blanket refusal: rep count and range of motion survive a
    // low sample rate, because neither depends on resolving an instant within the phase.
    const m = analyse(repTrace(200));
    expect(m?.repBreakdown.length).toBeGreaterThan(0);
    expect(m?.romCm).toBeGreaterThan(0);
  });
});
