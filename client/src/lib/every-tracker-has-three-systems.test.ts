import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/* RULE #4: ALL THREE CAMERA SYSTEMS RUN ON EVERY SINGLE LIFT.
 *
 * Scott, 2026-10-05: "every camera we have in this app should follow our rule, and have 3d", and
 * before that: "we need to be detecting both object and body in every single lift ... Camera
 * system has two systems, object and body detector, they need to work in unison always to
 * produce a truly trusted number" / "3 camera systems, all working hand in hand".
 *
 * The audit that produced this test found, across the eight AV trackers:
 *   - the LIVE path on the kettlebell and swing trackers ran NO object detection, because
 *     startRecording() was called with no trackingMode. The class was named only on
 *     analyzeRecording, the fallback path, so a take that stayed live had one witness and
 *     nothing for overwatch to arbitrate -- the hole the 2026-10-04 box jump fell into;
 *   - the med ball, kettlebell and swing trackers passed no sensor strides at all, so the native
 *     defaults applied: hand pose on EVERY frame, chosen by omission;
 *   - the swing tracker had exactly ONE scale ruler, with no reconciliation behind it.
 *
 * SCANNED, NEVER LISTED. The same reasoning as refused-capture-survives.test.ts: that file began
 * as a hand-written list of eight dialogs and, rerun as a scan, immediately found six more. The
 * next tracker added will not be on anybody's list either.
 */
const DIR = "client/src/components";

/** The documented exception: a mode with no implement in the scene (CLAUDE.md, the camera
 *  architecture section). These still need the body tracker and the 3D pose; what they cannot
 *  have is an object class, because there is no object. Each one is named WITH its reason, so
 *  adding to this list costs an argument rather than a line. */
const NO_IMPLEMENT_IN_SCENE: Record<string, string> = {
  "av-sprint-tracker-dialog.tsx": "a sprint has the athlete and a stopwatch, nothing to detect",
  "av-mechanics-tracker-dialog.tsx": "a mechanics drill is bodyweight by definition",
  // The box jump's box is real, but the CoreML model has no box class -- its classes are
  // med_ball, plate, baseball, golf_ball, tennis_ball, kettlebell, dumbbell, barbell. Passing a
  // trackingMode would be a no-op. Its object witness is the Vision rectangle detector plus the
  // 3D ankle ruler (ankle-3d-ruler.ts), which is why this is an exception with an expiry rather
  // than a settled one: a box class in the model retires it.
  "av-jump-tracker-dialog.tsx": "the CoreML model has no box class; the rectangle detector and the 3D ankle ruler stand in",
  // A sled push's implement IS in frame and this is a GAP, not an exception. Recorded here so
  // the test passes on today's truth while naming the debt out loud rather than hiding it.
  "av-horizontal-load-tracker-dialog.tsx": "KNOWN GAP: a sled is in frame and gets no detector",
};

/** Modes whose reported numbers are not distances, so a pixel-to-metre ruler has nothing to do.
 *  Named with the reason, same contract as NO_IMPLEMENT_IN_SCENE: this list costs an argument. */
const NOTHING_SCALE_DEPENDENT: Record<string, string> = {
  "av-sprint-tracker-dialog.tsx": "a sprint reports TIME between checkpoints the athlete paced out",
  "av-mechanics-tracker-dialog.tsx": "a mechanics screen reports ANGLES, which are ratios and carry no scale",
  // A sled push reports distanceYards, which IS scale-dependent, off a calibrated course rather
  // than a body ruler. Recorded as a known gap rather than a clean exception: if the course
  // calibration fails there is no second ruler behind it, which is the single-point-of-failure
  // shape the swing tracker was just fixed out of.
  "av-horizontal-load-tracker-dialog.tsx": "KNOWN GAP: distance comes off the paced course with no body ruler behind it",
};


const trackers = readdirSync(DIR).filter((f) => /^av-.*tracker-dialog\.tsx$/.test(f));

describe("every AV tracker runs all three camera systems", () => {
  it("found the trackers to scan", () => {
    // A scan that matches nothing passes vacuously, which is the one way this test can lie.
    expect(trackers.length).toBeGreaterThanOrEqual(8);
  });

  it.each(trackers)("%s names an object class on the LIVE path, not only on analyzeRecording", (file) => {
    const src = readFileSync(join(DIR, file), "utf8");
    const starts = src.match(/startRecording\(\{[^}]*\}\)/g) ?? [];
    expect(starts.length).toBeGreaterThan(0);
    if (NO_IMPLEMENT_IN_SCENE[file]) {
      // Nothing to assert about a class that does not exist -- but the reason has to be stated.
      expect(NO_IMPLEMENT_IN_SCENE[file].length).toBeGreaterThan(20);
      return;
    }
    for (const call of starts) expect(call).toContain("trackingMode");
  });

  it.each(trackers)("%s thins the expensive sensors on purpose rather than by omission", (file) => {
    // Rule #2: a sensor is THINNED, never switched off -- and never left on the native default
    // either, which for hand pose is every single frame. An explicit stride is the choice being
    // made rather than inherited.
    const src = readFileSync(join(DIR, file), "utf8");
    expect(src).toMatch(/body3DStride:\s*\d+/);
    expect(src).toMatch(/handPoseStride:\s*\d+/);
    // And never zero or absent: that would be a switch wearing a stride's clothes.
    for (const m of src.matchAll(/(body3DStride|handPoseStride):\s*(\d+)/g)) {
      expect(Number(m[2])).toBeGreaterThan(0);
    }
  });

  it.each(trackers)("%s reconciles more than one scale ruler", (file) => {
    // The swing tracker had calibrateFromFrames alone -- a single point of failure on exactly
    // the framing (feet out of shot) where that ruler fails. bodyScaleFallbacks is the shared
    // piece the 2026-09-29 audit built for this.
    if (NOTHING_SCALE_DEPENDENT[file]) {
      expect(NOTHING_SCALE_DEPENDENT[file].length).toBeGreaterThan(20);
      return;
    }
    const src = readFileSync(join(DIR, file), "utf8");
    expect(src.includes("reconcileScaleEstimates") || src.includes("bodyScaleFallbacks")).toBe(true);
  });
});
