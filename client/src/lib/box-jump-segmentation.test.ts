import { describe, it, expect } from "vitest";
import { summarizeJumpSet } from "./jump-tracking";
import type { TrackedPoint } from "./bar-tracking";

// Box jump is one of only four camera-tracking modes field-tested against real lifts (see
// docs/camera-tracking-notes.md), so these traces are built from real projectile physics rather
// than hand-drawn ramps -- a linear-ramp trace can produce a segmentation artifact that looks
// like a tracker bug and is really just an unphysical fixture (this file's own earlier draft hit
// exactly that: a teleporting, non-ballistic "reset on box" trace reported a corrupted height that
// vanished the moment the fixture was made to actually obey gravity).
//
// y decreases upward throughout (image-space convention the tracker itself uses). World height h
// is metres above the floor, up positive; a tracker sample is always y = -h.
const FPS = 60;
const DT = 1000 / FPS;
const G = 9.81;

// A real ballistic arc from world-height h0 to h1, reaching `peakRise` metres above h0 at the
// apex -- not a linear ramp. v0 is solved from the desired apex rise, then T from where the
// parabola actually crosses h1 (the larger, physical root).
function projectileHeights(h0: number, h1: number, peakRise: number): number[] {
  const v0 = Math.sqrt(2 * G * peakRise);
  const T = (v0 + Math.sqrt(v0 * v0 + 2 * G * (h0 - h1))) / G;
  const frames = Math.round(T * FPS);
  const out: number[] = [];
  for (let i = 0; i <= frames; i++) {
    const t = i / FPS;
    out.push(h0 + v0 * t - 0.5 * G * t * t);
  }
  out[out.length - 1] = h1; // pin the endpoint against float drift
  return out;
}

function pushFlight(out: TrackedPoint[], t: number, heights: number[]): number {
  for (const h of heights) {
    out.push({ t, x: 0, y: -h, z: 0, confidence: 1 });
    t += DT;
  }
  return t;
}

function hold(out: TrackedPoint[], t: number, h: number, frames: number): number {
  for (let i = 0; i < frames; i++) {
    out.push({ t, x: 0, y: -h, z: 0, confidence: 1 });
    t += DT;
  }
  return t;
}

const GROUND = 0;
const BOX = 0.5; // a 50cm box -- ordinary training height
const PEAK_RISE = 0.65; // ankle rise above the takeoff surface each real rep produces

type DismountMode = "step-down" | "jump-down" | "none";

// A `reps`-rep box jump set. `dismount` controls how the athlete gets back down between jumps:
// "step-down" glides down under control (no flight at all), "jump-down" leaves the ground for a
// real, modest hop off the box, and "none" never returns to the ground -- every rep launches
// straight off the box the last one landed on (shape 3, "resets on the box").
function buildBoxJumpSet(reps: number, dismount: DismountMode): TrackedPoint[] {
  const out: TrackedPoint[] = [];
  let t = 0;
  let cur = GROUND;
  t = hold(out, t, cur, 30);
  for (let r = 0; r < reps; r++) {
    t = pushFlight(out, t, projectileHeights(cur, BOX, PEAK_RISE));
    t = hold(out, t, BOX, 20);
    cur = BOX;

    if (dismount === "none") continue;
    if (dismount === "step-down") {
      const steps = 30;
      for (let i = 1; i <= steps; i++) {
        const h = BOX + (GROUND - BOX) * (i / steps);
        out.push({ t, x: 0, y: -h, z: 0, confidence: 1 });
        t += DT;
      }
      t = hold(out, t, GROUND, 30);
    } else {
      // A real, but ordinary, hop off the box -- not a step, but not the freakishly high
      // push-off that this file's "known gap" test covers separately.
      t = pushFlight(out, t, projectileHeights(BOX, GROUND, 0.2));
      t = hold(out, t, GROUND, 30);
    }
    cur = GROUND;
  }
  return out;
}

describe("box jump segmentation", () => {
  it("does not double the rep count on a controlled step-down between reps", () => {
    const result = summarizeJumpSet(buildBoxJumpSet(5, "step-down"), 70, 35, -BOX);
    expect(result).not.toBeNull();
    expect(result!.repBreakdown.length).toBe(5);
  });

  it("does not double the rep count on an ordinary jump-down between reps", () => {
    // Shape 2: the athlete steps or jumps back down off the box between reps -- a second
    // vertical excursion that is not itself a rep. Before the fix, ANY airborne excursion that
    // cleared the amplitude floor got pushed as a rep regardless of which direction it net
    // travelled, so a jump-down (as opposed to a slow step-down, which never leaves "grounded"
    // at all) was indistinguishable from a real jump onto the box.
    const result = summarizeJumpSet(buildBoxJumpSet(5, "jump-down"), 70, 35, -BOX);
    expect(result).not.toBeNull();
    expect(result!.repBreakdown.length).toBe(5);
  });

  it("gives every rep close to the same height whether the athlete steps or hops down", () => {
    const stepDown = summarizeJumpSet(buildBoxJumpSet(5, "step-down"), 70, 35, -BOX)!;
    const jumpDown = summarizeJumpSet(buildBoxJumpSet(5, "jump-down"), 70, 35, -BOX)!;
    expect(stepDown.repBreakdown.map((r) => r.jumpHeightCm)).toEqual(
      jumpDown.repBreakdown.map((r) => r.jumpHeightCm),
    );
  });

  // Shape 3: the athlete doesn't return to the floor between reps at all -- they stand on the
  // box, then jump again from there (a shuttle-style set, or simply never stepping down). The
  // "ground" baseline the state machine measures the next takeoff against has moved to the box's
  // own height, and has to be re-established there rather than assumed to still be the floor.
  it("segments correctly when the athlete resets on top of the box instead of returning to the floor", () => {
    const result = summarizeJumpSet(buildBoxJumpSet(5, "none"), 70, 35, -BOX);
    expect(result).not.toBeNull();
    expect(result!.repBreakdown.length).toBe(5);
    const heights = result!.repBreakdown.map((r) => r.jumpHeightCm);
    // Every rep is the same physical push (0.65m rise, whatever surface it launches from), so
    // reported heights should agree with each other, not just individually look plausible.
    const spread = Math.max(...heights) - Math.min(...heights);
    expect(spread).toBeLessThan(2);
  });

  // Shapes 1 and 4: a box jump lands higher than it took off, and the standard flight-time
  // formula (g*t^2/8) assumes a symmetric parabola -- landing where you launched from. Applied
  // unmodified to a box jump, the shorter fall (versus an equal jump onto the floor) reads as a
  // SMALLER jump the taller the box is, which is backwards. These were already fixed before this
  // session (see the asymmetric d = v0*t - g*t^2/2 formula in summarizeJumpSet); these are
  // regression tests, not new fixes.
  it("reports a taller box's jump as at least as high, never lower, than a shorter one", () => {
    const onto = (boxM: number) => {
      const out: TrackedPoint[] = [];
      let t = hold(out, 0, GROUND, 30);
      t = pushFlight(out, t, projectileHeights(GROUND, boxM, PEAK_RISE + boxM * 0.2));
      hold(out, t, boxM, 20);
      return summarizeJumpSet(out, 70, 35, -boxM)!;
    };
    const shortBox = onto(0.3);
    const tallBox = onto(0.75);
    expect(shortBox.repBreakdown[0].jumpHeightCm).toBeGreaterThan(20);
    expect(tallBox.repBreakdown[0].jumpHeightCm).toBeGreaterThan(shortBox.repBreakdown[0].jumpHeightCm - 5);
  });

  // An unusually forceful dismount (a hard pop-off-the-box hop, not a step or an ordinary
  // jump-down) has enough hang-time of its own to fool the settle test into calling a point
  // partway back down "landed" -- the same ambiguity the comment above the airborne branch's
  // apex/settle check already names for a real rep's own landing. Widening that check's margin
  // fixes this trace but broke a legitimate shallow-clearance box jump in capture-trust.test.ts,
  // so it's rejected here on a narrower, box-jump-specific signal instead: nothing in this
  // pipeline has an athlete resting in mid-air above the box's own detected top, so a settle
  // point measurably higher than the box is refused outright and the search continues -- see
  // jump-tracking.ts's own comment beside `floatingAboveBox`.
  it("rejects a false landing detected mid-air above the box during an energetic dismount", () => {
    const out: TrackedPoint[] = [];
    let t = hold(out, 0, GROUND, 30);
    t = pushFlight(out, t, projectileHeights(GROUND, BOX, PEAK_RISE));
    t = hold(out, t, BOX, 20);
    t = pushFlight(out, t, projectileHeights(BOX, GROUND, 0.5)); // hard pop off the box
    hold(out, t, GROUND, 30);
    const result = summarizeJumpSet(out, 70, 35, -BOX)!;
    expect(result.repBreakdown.length).toBe(1);
  });
});
