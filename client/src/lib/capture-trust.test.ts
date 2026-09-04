import { describe, it, expect } from "vitest";
import {
  jumpTrustScores,
  crossingTrustScore,
  mechanicsTrustScore,
  asSingleRepTrust,
  labelForScore,
} from "./capture-trust";
import { summarizeJumpSet } from "./jump-tracking";
import type { TrackedPoint } from "./bar-tracking";

// ARC-1's four previously-unscored modes. These are the tests the modes did
// not have, in the sense that mattered: not "does the arithmetic run" but
// "does a capture that should be distrusted actually come back distrusted."

describe("labelForScore", () => {
  it("uses the same bands computeRepTrustScores does", () => {
    expect(labelForScore(80)).toBe("high");
    expect(labelForScore(79)).toBe("medium");
    expect(labelForScore(55)).toBe("medium");
    expect(labelForScore(54)).toBe("low");
  });
});

describe("jumpTrustScores", () => {
  const clean = {
    repNumber: 1,
    avgConfidence: 0.95,
    jumpHeightCm: 30,
    peakHeightCm: 26,
    outlierAgainstSet: false,
  };

  it("trusts a rep whose two independent height estimates agree", () => {
    const [rep] = jumpTrustScores([clean]);
    expect(rep.label).toBe("high");
    expect(rep.notes).toEqual([]);
  });

  it("docks a rep whose flight time and ankle travel tell different stories", () => {
    // The corroboration ARC-1 was missing: both numbers were already
    // computed per rep and never compared. 30cm of flight time against 4cm
    // of actual ankle travel is a tracking artifact, not a jump.
    const [rep] = jumpTrustScores([{ ...clean, peakHeightCm: 4 }]);
    expect(rep.label).toBe("low");
    expect(rep.notes.join(" ")).toContain("disagree sharply");
  });

  it("carries low per-frame confidence straight into the score", () => {
    const [rep] = jumpTrustScores([{ ...clean, avgConfidence: 0.4 }]);
    expect(rep.score).toBeLessThan(clean.avgConfidence * 100);
    expect(rep.label).toBe("low");
  });

  it("docks a rep the set's own outlier pass already flagged", () => {
    const [rep] = jumpTrustScores([{ ...clean, outlierAgainstSet: true }]);
    expect(rep.label).not.toBe("high");
    expect(rep.notes.join(" ")).toContain("out of line");
  });

  it("never reports a confident score off two zero-height estimates", () => {
    const [rep] = jumpTrustScores([{ ...clean, jumpHeightCm: 0, peakHeightCm: 0 }]);
    expect(rep.label).toBe("low");
  });

  it("keeps repNumber aligned with the rep breakdown", () => {
    const scores = jumpTrustScores([clean, { ...clean, repNumber: 2 }, { ...clean, repNumber: 3 }]);
    expect(scores.map((s) => s.repNumber)).toEqual([1, 2, 3]);
  });
});

describe("crossingTrustScore", () => {
  const clean = {
    likelyGlitch: false,
    totalFrames: 200,
    framesWithReferencePoint: 190,
    crossingFrameGapsMs: [16, 17],
    totalElapsedSeconds: 5.2,
  };

  it("trusts a densely tracked run timed off tight frame gaps", () => {
    const trust = crossingTrustScore(clean);
    expect(trust.label).toBe("high");
    expect(trust.notes).toEqual([]);
  });

  it("rejects a time that implies a speed no human has run", () => {
    const trust = crossingTrustScore({ ...clean, likelyGlitch: true });
    expect(trust.label).toBe("low");
  });

  it("scales the precision penalty to the run's own length, not the gap alone", () => {
    // The same 40ms straddle is nothing across a 5.2s forty and a real
    // fraction of a 0.4s shuttle leg -- which is the whole reason the bound
    // is a ratio rather than a fixed millisecond threshold.
    const long = crossingTrustScore({ ...clean, crossingFrameGapsMs: [40] });
    const short = crossingTrustScore({ ...clean, crossingFrameGapsMs: [40], totalElapsedSeconds: 0.4 });
    expect(long.score).toBeGreaterThan(short.score);
    expect(short.notes.join(" ")).toContain("too sparse");
  });

  it("docks a run the athlete was mostly out of frame for", () => {
    const trust = crossingTrustScore({ ...clean, framesWithReferencePoint: 40 });
    expect(trust.notes.join(" ")).toContain("out of frame for most");
    expect(trust.score).toBeLessThan(80);
  });

  it("notes a hand-scrubbed time without treating it as a glitch", () => {
    const trust = crossingTrustScore({ ...clean, crossingFrameGapsMs: [], manuallyTimed: true });
    expect(trust.label).not.toBe("low");
    expect(trust.notes.join(" ")).toContain("by hand");
  });

  it("reduces to a single rep-1 entry for horizontal_load", () => {
    const rows = asSingleRepTrust(crossingTrustScore(clean));
    expect(rows).toHaveLength(1);
    expect(rows[0].repNumber).toBe(1);
    expect(rows[0].score).toBe(crossingTrustScore(clean).score);
  });
});

describe("mechanicsTrustScore", () => {
  const clean = {
    totalFrames: 90,
    framesWithTorso: 88,
    hipPeakFound: true,
    shoulderPeakFound: true,
    armPeakFound: true,
    implausibleWristSpeed: false,
  };

  it("trusts a fully-visible capture with every rotation peak located", () => {
    expect(mechanicsTrustScore(clean).label).toBe("high");
  });

  it("distrusts a capture whose wrist speed came back physically impossible", () => {
    const trust = mechanicsTrustScore({ ...clean, implausibleWristSpeed: true });
    expect(trust.label).toBe("low");
    expect(trust.notes.join(" ")).toContain("physically impossible");
  });

  it("docks a capture measured off frames that mostly lacked the torso", () => {
    const trust = mechanicsTrustScore({ ...clean, framesWithTorso: 20 });
    expect(trust.score).toBeLessThan(80);
  });

  it("compounds the penalty as more sequencing peaks go missing", () => {
    const one = mechanicsTrustScore({ ...clean, hipPeakFound: false });
    const two = mechanicsTrustScore({ ...clean, hipPeakFound: false, shoulderPeakFound: false });
    expect(two.score).toBeLessThan(one.score);
  });

  it("does not penalize swing mode for having no arm peak to find", () => {
    const swing = mechanicsTrustScore({ ...clean, armPeakFound: undefined });
    expect(swing.label).toBe("high");
  });

  it("distrusts a capture too short to hold the whole motion", () => {
    const trust = mechanicsTrustScore({ ...clean, totalFrames: 8, framesWithTorso: 8 });
    expect(trust.score).toBeLessThan(80);
  });
});

// ---------------------------------------------------------------------------
// summarizeJumpSet, end to end -- both that it now emits trust scores at all,
// and the grounded-baseline defect the audit turned up.
// ---------------------------------------------------------------------------

const FRAME_MS = 1000 / 60;

/** Builds an ankle-midpoint trace from a list of stands, each held at a
 * given height, with a transition between consecutive stands. y is
 * world-space and y-DOWN, so a greater height above the floor is a more
 * negative y -- the same convention summarizeJumpSet's own baseline logic
 * reads.
 *
 * A "jump" transition arcs up over an apex the way a real jump does. A
 * "step" transition descends monotonically, never rising -- which is what a
 * real dismount off a box looks like, and is exactly the shape the grounded
 * baseline had no way to follow. */
type Stand = { heightM: number; holdMs: number; via?: "jump" | "step" };

function trace(
  stands: Stand[],
  jumpApexM: number,
  transitionMs: number,
  // A dismount off a box is a fall, not a controlled lower -- it covers the
  // box's height in a fraction of the time a jump's arc takes, which is
  // precisely what makes it outrun the grounded baseline's drift tracking.
  stepMs = transitionMs,
): TrackedPoint[] {
  const points: TrackedPoint[] = [];
  let t = 0;
  const push = (heightM: number) => {
    points.push({ t, x: 0, y: -heightM, z: 0, confidence: 0.95 });
    t += FRAME_MS;
  };
  stands.forEach((stand, i) => {
    for (let ms = 0; ms < stand.holdMs; ms += FRAME_MS) push(stand.heightM);
    const next = stands[i + 1];
    if (!next) return;
    const steps = Math.max(2, Math.round((next.via === "step" ? stepMs : transitionMs) / FRAME_MS));
    for (let k = 1; k < steps; k++) {
      const frac = k / steps;
      const base = stand.heightM + (next.heightM - stand.heightM) * frac;
      push(next.via === "step" ? base : base + jumpApexM * 4 * frac * (1 - frac));
    }
  });
  return points;
}

describe("summarizeJumpSet", () => {
  it("emits a per-rep trust score for every jump it reports (ARC-1)", () => {
    const metrics = summarizeJumpSet(trace(
      [
        { heightM: 0, holdMs: 500 },
        { heightM: 0, holdMs: 500 },
        { heightM: 0, holdMs: 500 },
      ],
      0.35,
      400,
    ));
    expect(metrics).not.toBeNull();
    expect(metrics!.repBreakdown.length).toBeGreaterThan(0);
    expect(metrics!.trustScores).toHaveLength(metrics!.repBreakdown.length);
    expect(metrics!.trustScores!.map((t) => t.repNumber)).toEqual(
      metrics!.repBreakdown.map((r) => r.repNumber),
    );
  });

  it("measures a box jump the same after a dismount as before one", () => {
    // The defect the audit turned up: the grounded baseline only re-anchored
    // while the ankle stayed WITHIN the trigger of it, so a dismount off a
    // box -- which drops faster than that, and never RISES, so it is not a
    // takeoff either -- stranded the baseline up at box height for the rest
    // of the recording. Every later rep was then measured against a
    // reference the athlete was standing well below: its takeoff registered
    // late, so its flight time and height came back understated, and a rep
    // that simply did not out-jump the box height was never found at all.
    //
    // Both jumps here are the identical motion, so any difference between
    // them is the bug and nothing else.
    const boxM = 0.5;
    const metrics = summarizeJumpSet(trace(
      [
        { heightM: 0, holdMs: 500 },                     // stand on the floor
        { heightM: boxM, holdMs: 500, via: "jump" },     // jump up onto the box
        { heightM: 0, holdMs: 500, via: "step" },        // drop back down -- no rise at all
        { heightM: boxM, holdMs: 500, via: "jump" },     // the same jump again
        { heightM: 0, holdMs: 500, via: "step" },
      ],
      0.3,
      400,
      150,
    ));
    expect(metrics).not.toBeNull();
    expect(metrics!.repBreakdown.length).toBeGreaterThanOrEqual(2);
    const [first, second] = metrics!.repBreakdown;
    expect(second.jumpHeightCm).toBeCloseTo(first.jumpHeightCm, 5);
    expect(second.peakHeightCm).toBeCloseTo(first.peakHeightCm, 5);
  });
});
