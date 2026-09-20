// OVERWATCH FOR THE WEB/MEDIAPIPE PATH.
//
// This is the third of the three camera parts (CLAUDE.md, "THE CAMERA ARCHITECTURE") for the
// browser pipeline: the body tracker is MediaPipe Pose, the object tracker is ImplementTracker
// (implement-tracking.ts), and this is the referee that holds them against each other. It owns
// no sensor of its own. The RULE lives in shared/tracker-arbiter.ts and is not restated here;
// what this file adds is the per-take state the rule needs (the recent-yardstick history and
// the telemetry) and the two calls a frame loop makes in the order the design requires:
//
//   1. judgeBody()   -- BEFORE the object tracker runs. A body whose own ruler just changed
//                       length cannot convict anybody, and the object tracker's search is
//                       seeded on the wrist, so a jumped wrist would also seed it wrong.
//   2. judgeObject() -- AFTER the object tracker reports a lock, and only when judgeBody() did
//                       not abstain. object_suspect means the caller drops the lock and
//                       re-detects; anything else leaves it alone.
//
// Until this existed the web path had no overwatch at all: `arbitrate()` had no TypeScript
// caller, and the only object-vs-body guard in bar-tracker-dialog.tsx was a fixed 0.5 metre
// offset -- a number in metres on a path whose metres come from the very body read it was
// checking, and which the native port had already replaced with a threshold in grip widths.
//
// Same shape as AvCoreMlImplementDetector.track() in AvBodyTrackingPlugin.swift, deliberately:
// stable spans join the history INSIDE the stable branch and nowhere else, a suspect body
// skips the frame and never breaks a lock, and every outcome is counted. The telemetry has the
// exact shape of objectLockDiagnosticsSchema (shared/schema.ts) so the web path reaches the
// same admin tracking report as the native one; the counters that describe native-only
// mechanisms (re-classification, the trajectory fit) stay at zero here rather than being
// omitted, because the schema requires them and a zero and an absence say different things.
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import {
  arbitrate,
  bodyReadIsStable,
  bodyYardstickPx,
  handAnchor,
  type ArbiterPoint,
  type Arbitration,
  type BodyYardstick,
} from "@shared/tracker-arbiter";
import type { ObjectLockDiagnostics } from "@/lib/tracking-diagnostics";
import { MIN_VISIBILITY, POSE_LANDMARKS } from "@/lib/pose-tracking";

/** How many recent stable spans the body check is judged against. Mirrors
 * `yardstickHistoryWindow` in AvCoreMlImplementDetector: long enough that one frame cannot
 * move the median, short enough that a genuine slow rotation of the athlete is followed. */
export const YARDSTICK_HISTORY_WINDOW = 8;

export type BodyJudgement = {
  /** True when the body's own ruler changed length faster than an athlete can turn. The caller
   * skips the frame entirely: no object tracking, no fresh detection, lock untouched. */
  suspect: boolean;
  yardstick: BodyYardstick | null;
  anchor: ArbiterPoint | null;
  frameWidth: number;
  frameHeight: number;
};

function point(lm: NormalizedLandmark | undefined): ArbiterPoint | null {
  if (!lm || !(lm.visibility >= MIN_VISIBILITY)) return null;
  return { x: lm.x, y: lm.y };
}

/** ObjectLockDiagnostics plus the three counters objectLockDiagnosticsSchema (shared/schema.ts)
 * has required since 2026-09-20. They describe native-only mechanisms and stay at zero here,
 * but the schema requires them, and a required field the web path did not send would fail the
 * whole diagnostics parse on insert -- the same silent-drop class the round-trip test guards.
 * Stated as an intersection so this compiles whether or not the shared type has caught up. */
export type WebObjectLockTelemetry = ObjectLockDiagnostics & {
  breaksMotionDisagreement: number;
  candidatesRejectedBySize: number;
  framesFrozen: number;
};

export function emptyObjectLockTelemetry(): WebObjectLockTelemetry {
  return {
    framesTracked: 0,
    framesLockHeld: 0,
    freshDetections: 0,
    breaksLowConfidence: 0,
    breaksImplausibleJump: 0,
    breaksTrajectoryDisagreement: 0,
    breaksWristGate: 0,
    reclassifyConfirmations: 0,
    reclassifyCorrections: 0,
    candidatesRejectedByWristGate: 0,
    framesBodySuspect: 0,
    breaksMotionDisagreement: 0,
    candidatesRejectedBySize: 0,
    framesFrozen: 0,
  };
}

export class WebOverwatch {
  private recentYardstickPx: number[] = [];
  private hadLockLastFrame = false;
  telemetry: WebObjectLockTelemetry = emptyObjectLockTelemetry();

  reset(): void {
    this.recentYardstickPx = [];
    this.hadLockLastFrame = false;
    this.telemetry = emptyObjectLockTelemetry();
  }

  /** Read-only view for tests; the loop never needs it. */
  get history(): readonly number[] {
    return this.recentYardstickPx;
  }

  /**
   * Step 1. Measure the body's ruler for this frame and decide whether to believe it.
   *
   * A stable span joins the history; a rejected one never does, or a run of bad landmark
   * frames would teach the check to accept them exactly when it is needed most. Frames with no
   * yardstick at all are neither stable nor suspect -- they are simply unjudgeable, and the
   * object gate degrades to its frame-fraction fallback on them (see lockDistanceVerdict).
   */
  judgeBody(
    landmarks: NormalizedLandmark[],
    frameWidth: number,
    frameHeight: number,
  ): BodyJudgement {
    const leftWrist = point(landmarks[POSE_LANDMARKS.LEFT_WRIST]);
    const rightWrist = point(landmarks[POSE_LANDMARKS.RIGHT_WRIST]);
    const yardstick = bodyYardstickPx({
      leftWrist,
      rightWrist,
      leftShoulder: point(landmarks[POSE_LANDMARKS.LEFT_SHOULDER]),
      rightShoulder: point(landmarks[POSE_LANDMARKS.RIGHT_SHOULDER]),
      frameWidth,
      frameHeight,
    });
    const anchor = handAnchor(leftWrist, rightWrist);
    this.telemetry.framesTracked += 1;
    if (yardstick) this.telemetry.yardstickSource = yardstick.source;

    let suspect = false;
    if (yardstick) {
      const stability = bodyReadIsStable(yardstick.px, this.recentYardstickPx);
      if (stability.stable) {
        // Only stable spans join the history -- the append sits INSIDE the stable branch, same
        // as the Swift port, and shared/tracker-arbiter.test.ts holds the port to that.
        this.recentYardstickPx.push(yardstick.px);
        if (this.recentYardstickPx.length > YARDSTICK_HISTORY_WINDOW) this.recentYardstickPx.shift();
      } else {
        suspect = true;
        this.telemetry.framesBodySuspect += 1;
      }
    }
    return { suspect, yardstick, anchor, frameWidth, frameHeight };
  }

  /**
   * Step 2. Is the object the tracker reports plausibly the one in the athlete's hands?
   *
   * `objectCenter` is normalized (0-1) image space, the same convention as the landmarks.
   * Returns the arbitration; `breakLock` is the only field a caller acts on. The caller must
   * not reach here on a frame judgeBody() marked suspect -- arbitrate() would abstain again,
   * but the object tracker should not have run on that frame in the first place.
   */
  judgeObject(objectCenter: ArbiterPoint, body: BodyJudgement): Arbitration {
    const call = arbitrate({
      objectCenter,
      anchor: body.anchor,
      yardstick: body.yardstick,
      recentYardstickPx: this.recentYardstickPx,
      frameWidth: body.frameWidth,
      frameHeight: body.frameHeight,
    });
    if (call.breakLock) {
      this.telemetry.breaksWristGate += 1;
      this.hadLockLastFrame = false;
      return call;
    }
    this.telemetry.framesLockHeld += 1;
    if (!this.hadLockLastFrame) this.telemetry.freshDetections += 1;
    this.hadLockLastFrame = true;
    if (call.distanceInYardsticks != null) {
      const d = call.distanceInYardsticks;
      if (
        this.telemetry.maxAcceptedDistanceInYardsticks == null ||
        d > this.telemetry.maxAcceptedDistanceInYardsticks
      ) {
        this.telemetry.maxAcceptedDistanceInYardsticks = Math.round(d * 100) / 100;
      }
    }
    return call;
  }

  /** The frame produced no lock at all (tracker returned null, or the body was suspect and
   * the tracker never ran). Keeps freshDetections honest: the next lock is a fresh one. */
  noteNoLock(): void {
    this.hadLockLastFrame = false;
  }
}
