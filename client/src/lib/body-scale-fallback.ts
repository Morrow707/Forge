/**
 * THE RULERS EVERY CAMERA MODE GETS, WHATEVER THE FRAMING.
 *
 * Audit, 2026-09-29 (Scott: "Audit the rest of the cameras to make sure they work the same way,
 * remember nothing should reject video. Rule number 1"). The bar tracker had five rulers and a
 * scale-free fallback; the jump, kettlebell and med ball trackers had ONE -- the athlete's
 * standing height -- and when that single read failed (feet off the bottom of the frame, a
 * take that never showed the whole body) they saved an empty set and told the athlete to stand
 * where the camera could see them. That is a refusal, and the replacement ruler already existed
 * in the bar tracker.
 *
 * This is the shared piece: the 3D skeleton (body-3d-ruler.ts) and the shoulder breadth, as
 * scale candidates any dialog can add to its own before reconciling. Neither needs the whole
 * body in frame, neither needs a detector, and both are peers under the same
 * reconcileScaleEstimates as every other ruler (Rule #2). The height ruler stays; these are
 * what pick up when it cannot.
 */
import type { Landmark } from "@mediapipe/tasks-vision";
import type { PoseFrame as NativePoseFrame } from "./native-av-preview";
import { body3DScaleFromFrames, type Body3DScaleReading } from "./body-3d-ruler";
import { measureLimbSpansInUnits } from "./measure-limbs";
import { shoulderWidthScaleFromFrames, type ScaleEstimate, type ShoulderScaleReading } from "./pose-tracking";

export type BodyScaleFallbacks = {
  candidates: ScaleEstimate[];
  body3D: Body3DScaleReading;
  shoulders: ShoulderScaleReading;
  /** Diagnostics rows in the shape `scaleCandidates` already carries. */
  diagnostics: { source: string; scale: number; measured: number | null; samples: number | null }[];
  /** The shoulder ruler, refused or not, in the shape `calibration.shoulderRuler` carries. */
  shoulderRuler: {
    scale: number | null;
    uncertaintyFraction: number;
    medianSpanUnits: number | null;
    framesUsed: number;
    framesRejectedForAngle: number;
    rejectedBecause: string | null;
    spanSpreadFraction: number | null;
    /** The grip span measured in the SAME frames, divided by this ruler's shoulder span.
     *  Filled by the caller, which is where the grip is already in hand. See the field's
     *  comment in tracking-diagnostics.ts for what it is for and why it only records. */
    gripToShoulderSpanRatio?: number | null;
  };
  /** The 3D ruler bone by bone, in the shape `calibration.body3DRuler` carries. */
  body3DRuler: {
    limbs: Body3DScaleReading["limbs"];
    heightSource: string | null;
    referenceHeightM: number | null;
    framesUsed: number;
    rejectedBecause: string | null;
    method: Body3DScaleReading["method"];
    medianWristDepthM: number | null;
    frameWidth: number | null;
    frameHeight: number | null;
  };
};

/** The 3D ruler as a scale candidate: demoted when it had to fall back to the longest-projection
 *  method (see body-3d-ruler.ts on why), a full peer under the in-plane one. */
export function body3DCandidate(body3D: Body3DScaleReading): ScaleEstimate | null {
  if (body3D.scale == null) return null;
  return {
    source: "body_3d",
    scale: body3D.scale,
    uncertaintyFraction: body3D.uncertaintyFraction,
    ...(body3D.method === "longest_projection" ? { demoted: true } : {}),
  };
}

export function bodyScaleFallbacks(
  nativeFrames: NativePoseFrame[],
  calibrationInput: { worldLandmarks: Landmark[] }[],
  heightIn: number | null | undefined,
  posture?: Parameters<typeof shoulderWidthScaleFromFrames>[2],
): BodyScaleFallbacks {
  const body3D = body3DScaleFromFrames(nativeFrames, heightIn, measureLimbSpansInUnits(calibrationInput));
  const shoulders = shoulderWidthScaleFromFrames(calibrationInput, heightIn, posture);
  const body3DEstimate = body3DCandidate(body3D);
  const candidates: ScaleEstimate[] = [
    ...(body3DEstimate ? [body3DEstimate] : []),
    ...(shoulders.scale != null
      ? [{ source: "shoulder_width" as const, scale: shoulders.scale, uncertaintyFraction: shoulders.uncertaintyFraction }]
      : []),
  ];
  const diagnostics = [
    ...(body3D.scale != null
      ? [
          {
            source: `body_3d:${body3D.limb ?? "?"}:${body3D.heightSource ?? "?"}:${body3D.method ?? "?"}`,
            scale: body3D.scale,
            measured: body3D.metres,
            samples: body3D.framesUsed,
          },
        ]
      : []),
    ...(shoulders.scale != null
      ? [{ source: "shoulder_width", scale: shoulders.scale, measured: shoulders.medianSpanUnits, samples: shoulders.framesUsed }]
      : []),
  ];
  // WHY A RULER IS NOT IN THE VOTE. Added 2026-10-06, and the session that forced it is the
  // reason: on three takes across two days the shoulder ruler was simply ABSENT from
  // scaleCandidates, body_3d stood alone at 100% of the weight, and all three read 34-43% LOW
  // (bench -43%, bench -39%, row -34%) while every corroborated take landed inside 8%. That is
  // Rule #4 measured on real sets -- "a number corroborated by one system is not a trusted
  // number, it is an assertion" -- and the export could not say WHY the second witness was
  // missing, because a refused ruler contributed nothing at all rather than a reason.
  //
  // `ShoulderScaleReading` has carried `rejectedBecause`, `framesRejectedForAngle` and the span
  // it measured since it was written. None of it ever reached the export. It does now, refused or
  // not, which is the same rule the capture-diagnostics section states for a failed take: the
  // capture whose record matters most is the one that failed.
  const shoulderRuler = {
    scale: shoulders.scale,
    uncertaintyFraction: shoulders.uncertaintyFraction,
    medianSpanUnits: shoulders.medianSpanUnits,
    framesUsed: shoulders.framesUsed,
    framesRejectedForAngle: shoulders.framesRejectedForAngle,
    rejectedBecause: shoulders.rejectedBecause,
    /** How much this ruler disagreed with ITSELF across the take -- see spanSpreadFraction. */
    spanSpreadFraction: shoulders.spanSpreadFraction,
  };

  const body3DRuler = {
    limbs: body3D.limbs,
    heightSource: body3D.heightSource,
    referenceHeightM: body3D.referenceHeightM,
    framesUsed: body3D.framesUsed,
    rejectedBecause: body3D.rejectedBecause,
    method: body3D.method,
    medianWristDepthM: body3D.medianWristDepthM,
    frameWidth: nativeFrames.find((f) => f.frameWidth > 0)?.frameWidth ?? null,
    frameHeight: nativeFrames.find((f) => f.frameHeight > 0)?.frameHeight ?? null,
  };
  return { candidates, body3D, shoulders, diagnostics, body3DRuler, shoulderRuler };
}
