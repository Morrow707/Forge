import { describe, it, expect } from "vitest";
import { replayCapture, type StoredCapture } from "./capture-replay";
import captures from "./__fixtures__/walkout-captures.json";

// Real captures, not synthesised traces. Three consecutive back squats from one calibration
// session (75in athlete, five reps logged on each), exported from live set rows exactly as
// stored: centimetres relative to the first point, decimated to ~200 samples.
//
// Two of them open with the athlete walking the bar out of the rack, which the segmenter saw as
// a reversal and reported as rep 1. That phantom moved two to three times as far as any genuine
// rep and took two seconds against their 0.6-0.8, so it also dragged every set-level mean down
// with it. They are kept here because this is the shape no synthetic trace produced: too FAST and
// too BIG to trip either of the phantom tests that existed, both of which look for a phase
// falling short.
const real = captures as StoredCapture[];

function capture(setId: number): StoredCapture {
  const found = real.find((c) => c.setId === setId);
  if (!found) throw new Error(`fixture is missing set ${setId}`);
  return found;
}

describe("walkout phases in real captures", () => {
  // 219cm of walkout ahead of five ~69cm reps. Lands exactly on the five the athlete logged.
  it("does not report set 11944's walkout as a rep", () => {
    const result = replayCapture(capture(11944));
    expect(result.repCount).toBe(5);
    expect(result.metrics!.repBreakdown.every((r) => r.romCm < 100)).toBe(true);
  });

  // 175cm of walkout ahead of five ~66cm reps. The walkout goes, but a shallow reversal ahead of
  // the real reps survives the amplitude gate by a hair, so this take still reads one over. The
  // walkout being gone is the claim; the residue is a separate defect and is not hidden here.
  it("does not report set 11945's walkout as a rep", () => {
    const result = replayCapture(capture(11945));
    expect(result.repCount).toBe(6);
    expect(result.metrics!.repBreakdown.every((r) => r.romCm < 100)).toBe(true);
  });

  // The control: same session, same athlete, same exercise, filmed after the bar was already out
  // of the rack, so there is no walkout to remove. It has to still read five -- a gate that fixes
  // the other two by deleting a genuine rep here would be worse than the bug.
  it("leaves a take with no walkout alone", () => {
    expect(replayCapture(capture(11943)).repCount).toBe(5);
  });

  // Every set-level mean is built from the rep list, so a phantom that moved three times as far
  // and took three times as long is not a cosmetic miscount.
  it("keeps the phantom out of the set's range of motion", () => {
    const metrics = replayCapture(capture(11944)).metrics!;
    expect(metrics.romCm).toBeLessThan(100);
  });
});

// The one phantom test that is not edge-only. A rep cannot be twice the size of every other rep
// in its own set, wherever it sits, so the long side of the filter runs over the whole take --
// unlike the short side, which stays at the edges because a shallow rep mid-set is a real rep.
describe("oversized phases in the middle of a set", () => {
  it("drops a mid-set excursion at twice the set's own rep size", () => {
    // Six reps of 60cm with one 150cm excursion in the middle: a rerack between clusters, a drop
    // and reset, or the tracker losing the bar and finding it somewhere else.
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
      trackingLevel: "bar_path",
      heightIn: 70,
      loadKg: 100,
      loggedReps: 6,
      barPathTrace: trace,
    });
    // The 150cm excursion is not reported as a rep -- every surviving rep is the real 60cm size.
    expect(result.metrics!.repBreakdown.every((r) => r.romCm < 100)).toBe(true);
    expect(result.metrics!.repBreakdown.every((r) => r.romCm > 40)).toBe(true);
    expect(result.repCount).toBe(6);
  });
});
