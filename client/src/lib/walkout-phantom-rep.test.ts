import { describe, it, expect } from "vitest";
import { replayCapture, type StoredCapture } from "./capture-replay";
import captures from "./__fixtures__/walkout-captures.json";

// Real captures, not a synthesised trace. These three are consecutive sets from one calibration
// session (75in athlete, five reps logged on each), exported from a live set row exactly as
// stored: centimetres relative to the first point, decimated to ~200 samples.
//
// Two of them open with the athlete walking the implement out -- the bar out of the rack, the
// box into position -- which the segmenter saw as a reversal and reported as rep 1. That phantom
// moved two to three times as far as any genuine rep and took two seconds against their 0.3-0.8,
// so it also dragged every set-level mean down with it. They are kept here as a fixture because
// this is the shape no synthetic trace produced: too FAST and too BIG to trip either of the
// existing phantom tests, both of which look for a phase that falls short.
const real = captures as StoredCapture[];

function capture(setId: number): StoredCapture {
  const found = real.find((c) => c.setId === setId);
  if (!found) throw new Error(`fixture is missing set ${setId}`);
  return found;
}

describe("walkout phases in real captures", () => {
  it("does not report set 11947's 196cm walkout as a rep", () => {
    // Five jumps logged; this take reads four, because the athlete's step down off the box at the
    // end merges with the last jump. That is a separate defect and it is NOT what this asserts --
    // what matters here is that the six phases the segmenter found are down to four real ones
    // rather than four plus two rack moves, and that the biggest is a jump-sized 82cm.
    const result = replayCapture(capture(11947));
    expect(result.repCount).toBe(4);
    expect(result.metrics!.repBreakdown.every((r) => r.romCm < 100)).toBe(true);
  });

  it("does not report set 11945's 175cm walkout as a rep", () => {
    // Also short of a clean five: one shallow 32cm reversal ahead of the real reps survives the
    // amplitude gate by a hair. The walkout itself is gone, which is the claim.
    const result = replayCapture(capture(11945));
    expect(result.repCount).toBe(6);
    expect(result.metrics!.repBreakdown.every((r) => r.romCm < 100)).toBe(true);
  });

  // The control: same session, same athlete, same exercise, but this take was already filming by
  // the time the box was in place, so there is no walkout to remove. It has to still read five --
  // a gate that fixes the other two by deleting a genuine rep here would be worse than the bug.
  it("leaves a take with no walkout alone", () => {
    expect(replayCapture(capture(11948)).repCount).toBe(5);
  });

  // Every set-level mean is built from the rep list, so a phantom that moved three times as far
  // and took three times as long is not a cosmetic miscount.
  it("keeps the phantom out of the set's range of motion", () => {
    const metrics = replayCapture(capture(11945)).metrics!;
    expect(metrics.romCm).toBeLessThan(100);
  });
});

// The one phantom test that is not edge-only. A rep cannot be twice the size of every other rep
// in its own set, wherever it sits, so the long side of the filter runs over the whole take --
// unlike the short side, which stays at the edges because a shallow rep mid-set is a real rep.
describe("oversized phases in the middle of a set", () => {
  it("drops a mid-set excursion at twice the set's own rep size", () => {
    // Six reps of 60cm with one 150cm excursion sitting in the middle of them: a rerack between
    // clusters, a drop and reset, or the tracker losing the bar and finding it somewhere else.
    const trace: { t: number; x: number; y: number }[] = [];
    let t = 0;
    const addReversal = (amplitudeCm: number, samples: number) => {
      for (let i = 0; i < samples; i++) {
        const phase = i / samples;
        const y = phase < 0.5 ? -amplitudeCm * (phase / 0.5) : -amplitudeCm * (1 - (phase - 0.5) / 0.5);
        trace.push({ t, x: 0, y });
        t += 33;
      }
    };
    for (let rep = 0; rep < 3; rep++) addReversal(60, 40);
    addReversal(150, 40);
    for (let rep = 0; rep < 3; rep++) addReversal(60, 40);

    const result = replayCapture({
      exerciseName: "Back Squat",
      heightIn: 70,
      loadKg: 100,
      loggedReps: 6,
      barPathTrace: trace,
    });
    // The claim is that the 150cm excursion is not reported as a rep, and it isn't: every rep
    // that survives is the real 60cm size. The count comes back 5 rather than 6 because the
    // excursion also disturbs the phase next to it -- a reversal that large changes where the
    // neighbouring one is judged to start. Worth knowing, and not something this filter can fix:
    // the damage is in the trace, and all a filter downstream can do is stop it being counted.
    expect(result.repCount).toBe(5);
    expect(result.metrics!.repBreakdown.every((r) => r.romCm < 100)).toBe(true);
    expect(result.metrics!.repBreakdown.every((r) => r.romCm > 50)).toBe(true);
  });
});
