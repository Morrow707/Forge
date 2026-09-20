import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { WebOverwatch, YARDSTICK_HISTORY_WINDOW } from "./overwatch-tracking";
import { POSE_LANDMARKS } from "./pose-tracking";
import {
  MAX_LOCK_DISTANCE_IN_YARDSTICKS,
  MIN_YARDSTICK_SAMPLES_FOR_STABILITY,
} from "@shared/tracker-arbiter";

/**
 * THE WEB PATH HAS OVERWATCH NOW, AND IT RUNS IN THE RIGHT ORDER.
 *
 * Two halves, for the two ways this can rot. The first drives WebOverwatch through a stubbed
 * frame loop and asserts the asymmetric response the architecture requires: a body fault
 * abstains and never breaks a lock, an object fault breaks it, a rejected span never joins the
 * history. The second scans bar-tracker-dialog.tsx, because the loop that calls it cannot be
 * rendered under Node, and the ORDER of the calls in that loop is the design: body judged
 * before the object tracker runs, object judged after, the fresh detection skipped on a
 * suspect body. A correct WebOverwatch called in the wrong order is the old bug again.
 */

const W = 1920;
const H = 1080;

function frame(points: Partial<Record<number, { x: number; y: number }>>): NormalizedLandmark[] {
  const lm: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0,
  }));
  for (const [i, p] of Object.entries(points)) {
    if (p) lm[Number(i)] = { x: p.x, y: p.y, z: 0, visibility: 0.95 };
  }
  return lm;
}

/** A steady grip: wrists 0.2 of the frame width apart, 384px. */
const gripFrame = (halfSpan = 0.1) =>
  frame({
    [POSE_LANDMARKS.LEFT_WRIST]: { x: 0.5 - halfSpan, y: 0.5 },
    [POSE_LANDMARKS.RIGHT_WRIST]: { x: 0.5 + halfSpan, y: 0.5 },
    [POSE_LANDMARKS.LEFT_SHOULDER]: { x: 0.42, y: 0.4 },
    [POSE_LANDMARKS.RIGHT_SHOULDER]: { x: 0.58, y: 0.4 },
  });
const YARDSTICK_PX = 0.2 * W;

function warm(ow: WebOverwatch, frames = MIN_YARDSTICK_SAMPLES_FOR_STABILITY + 1) {
  for (let i = 0; i < frames; i++) ow.judgeBody(gripFrame(), W, H);
}

describe("WebOverwatch: the body is judged, then the object, asymmetrically", () => {
  it("agrees on a plate at the end of the bar and records how close it ran", () => {
    const ow = new WebOverwatch();
    warm(ow);
    const body = ow.judgeBody(gripFrame(), W, H);
    expect(body.suspect).toBe(false);
    const call = ow.judgeObject({ x: 0.5 + (1.2 * YARDSTICK_PX) / W, y: 0.5 }, body);
    expect(call.outcome).toBe("agree");
    expect(call.breakLock).toBe(false);
    expect(ow.telemetry.framesLockHeld).toBe(1);
    expect(ow.telemetry.freshDetections).toBe(1);
    expect(ow.telemetry.maxAcceptedDistanceInYardsticks).toBeCloseTo(1.2, 2);
    expect(ow.telemetry.yardstickSource).toBe("grip");
  });

  it("breaks the lock on a rack plate and counts it under breaksWristGate", () => {
    const ow = new WebOverwatch();
    warm(ow);
    const body = ow.judgeBody(gripFrame(), W, H);
    const call = ow.judgeObject(
      { x: 0.5 + ((MAX_LOCK_DISTANCE_IN_YARDSTICKS + 1) * YARDSTICK_PX) / W, y: 0.5 },
      body,
    );
    expect(call.outcome).toBe("object_suspect");
    expect(call.breakLock).toBe(true);
    expect(ow.telemetry.breaksWristGate).toBe(1);
    expect(ow.telemetry.framesLockHeld).toBe(0);
  });

  it("marks a jumped wrist as a BODY fault, counts it, and never touches the history", () => {
    const ow = new WebOverwatch();
    warm(ow);
    const before = [...ow.history];
    // The right wrist lands on a spectator: the span quadruples in one frame.
    const jumped = frame({
      [POSE_LANDMARKS.LEFT_WRIST]: { x: 0.1, y: 0.5 },
      [POSE_LANDMARKS.RIGHT_WRIST]: { x: 0.9, y: 0.5 },
    });
    const body = ow.judgeBody(jumped, W, H);
    expect(body.suspect).toBe(true);
    expect(ow.telemetry.framesBodySuspect).toBe(1);
    // A rejected reading never joins the history it was judged against.
    expect([...ow.history]).toEqual(before);
    // And the lock is untouched -- there is nothing to break, because the caller is told to
    // skip the object tracker on this frame. Nothing was counted against the object.
    expect(ow.telemetry.breaksWristGate).toBe(0);
  });

  it("a run of bad frames cannot teach the guard to accept them", () => {
    const ow = new WebOverwatch();
    warm(ow);
    const jumped = frame({
      [POSE_LANDMARKS.LEFT_WRIST]: { x: 0.1, y: 0.5 },
      [POSE_LANDMARKS.RIGHT_WRIST]: { x: 0.9, y: 0.5 },
    });
    for (let i = 0; i < YARDSTICK_HISTORY_WINDOW * 2; i++) {
      expect(ow.judgeBody(jumped, W, H).suspect).toBe(true);
    }
    expect(ow.telemetry.framesBodySuspect).toBe(YARDSTICK_HISTORY_WINDOW * 2);
    // The next honest frame is still judged against the honest history.
    expect(ow.judgeBody(gripFrame(), W, H).suspect).toBe(false);
  });

  it("says nothing about the body until there is enough history to have an opinion", () => {
    const ow = new WebOverwatch();
    for (let i = 0; i < MIN_YARDSTICK_SAMPLES_FOR_STABILITY - 1; i++) ow.judgeBody(gripFrame(), W, H);
    // Wildly different span, but too early to call it a fault.
    expect(ow.judgeBody(gripFrame(0.4), W, H).suspect).toBe(false);
  });

  it("passes when there is no athlete to measure from, without pretending to have judged", () => {
    const ow = new WebOverwatch();
    warm(ow);
    const body = ow.judgeBody(frame({}), W, H);
    expect(body.suspect).toBe(false);
    expect(body.anchor).toBeNull();
    const call = ow.judgeObject({ x: 0.95, y: 0.05 }, body);
    expect(call.outcome).toBe("cannot_judge");
    expect(call.breakLock).toBe(false);
    expect(ow.telemetry.maxAcceptedDistanceInYardsticks).toBeUndefined();
  });

  it("keeps the history to the window, so a slow rotation is followed", () => {
    const ow = new WebOverwatch();
    warm(ow, YARDSTICK_HISTORY_WINDOW * 3);
    expect(ow.history.length).toBe(YARDSTICK_HISTORY_WINDOW);
  });

  it("emits every field objectLockDiagnosticsSchema requires, zeros included", () => {
    // The required list is READ from the schema rather than restated here, because the schema
    // grows (three native-only counters were added the same day this file was written) and a
    // required field the web path does not send fails the whole diagnostics parse on insert.
    // A zero and an absence say different things on the report; a missing one says nothing.
    const schema = readFileSync(join(__dirname, "..", "..", "..", "shared", "schema.ts"), "utf8");
    const block = schema.slice(schema.indexOf("const objectLockDiagnosticsSchema = z.object({"));
    const body = block.slice(0, block.indexOf("});"));
    const required = [...body.matchAll(/^\s+(\w+): z\.number\(\),$/gm)].map((m) => m[1]);
    expect(required.length).toBeGreaterThanOrEqual(11);
    const t = new WebOverwatch().telemetry as Record<string, unknown>;
    for (const k of required) expect(typeof t[k], `telemetry.${k}`).toBe("number");
  });
});

describe("bar-tracker-dialog.tsx calls overwatch in the order the design requires", () => {
  const dialog = readFileSync(join(__dirname, "..", "components", "bar-tracker-dialog.tsx"), "utf8");

  it("has retired the fixed-metre check in favour of the arbiter", () => {
    expect(dialog).not.toContain("MAX_PLAUSIBLE_IMPLEMENT_OFFSET_M");
    expect(dialog).toContain("overwatchRef.current.judgeObject(");
  });

  it("judges the body BEFORE the object tracker runs, and the object AFTER", () => {
    const bodyIdx = dialog.indexOf("overwatchRef.current.judgeBody(");
    const trackIdx = dialog.indexOf("implementTrackerRef.current.track(");
    const objectIdx = dialog.indexOf("overwatchRef.current.judgeObject(");
    expect(bodyIdx).toBeGreaterThan(-1);
    expect(trackIdx).toBeGreaterThan(bodyIdx);
    expect(objectIdx).toBeGreaterThan(trackIdx);
  });

  it("skips the object tracker AND the fresh detection on a suspect body, and leaves the lock", () => {
    // The tracker only runs when the body is not suspect...
    expect(dialog.replace(/\s+/g, " ")).toContain(
      "normalizedWrist && !bodySuspectThisFrame ? implementTrackerRef.current.track(",
    );
    // ...the fresh CoreML-style detection is gated on the same flag...
    expect(dialog).toContain("webDetectorTargetLabel && normalizedWrist && !bodySuspectThisFrame");
    // ...and the per-side trackers, which seed on their own wrists, too.
    expect(dialog).toContain('mode !== "jump" && usesSharedBar && !bodySuspectThisFrame');
    // A suspect body never reaches rejectLock: the only rejectLock on the combined tracker
    // sits under breakLock, which the arbiter never sets for a body fault.
    const objectIdx = dialog.indexOf("overwatchRef.current.judgeObject(");
    const rejectIdx = dialog.indexOf("implementTrackerRef.current.rejectLock()", objectIdx);
    const breakIdx = dialog.indexOf("if (call.breakLock)", objectIdx);
    expect(breakIdx).toBeGreaterThan(objectIdx);
    expect(rejectIdx).toBeGreaterThan(breakIdx);
  });

  it("ships the telemetry as objectLock so the web path reaches the admin report", () => {
    const compact = dialog.replace(/\s+/g, " ");
    expect(compact).toContain("objectLock: overwatchRef.current.telemetry");
    expect(compact).toContain("metrics.trackingDiagnostics = buildTrackingDiagnostics(");
  });

  it("resets overwatch wherever the object tracker is reset", () => {
    const trackerResets = dialog.match(/implementTrackerRef\.current\.reset\(\)/g)?.length ?? 0;
    const overwatchResets = dialog.match(/overwatchRef\.current\.reset\(\)/g)?.length ?? 0;
    expect(trackerResets).toBeGreaterThan(0);
    expect(overwatchResets).toBe(trackerResets);
  });
});

describe("the append sits INSIDE the stable branch, on both platforms", () => {
  it("in overwatch-tracking.ts", () => {
    const src = readFileSync(join(__dirname, "overwatch-tracking.ts"), "utf8");
    expect(src).toMatch(/if \(stability\.stable\) \{[\s\S]{0,400}?this\.recentYardstickPx\.push\(yardstick\.px\)/);
    // And the suspect branch never pushes.
    const elseIdx = src.indexOf("} else {", src.indexOf("if (stability.stable) {"));
    const nextPush = src.indexOf("recentYardstickPx.push", elseIdx);
    const returnIdx = src.indexOf("return { suspect", elseIdx);
    expect(nextPush === -1 || nextPush > returnIdx).toBe(true);
  });
});
