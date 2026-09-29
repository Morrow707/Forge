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
};

export function bodyScaleFallbacks(
  nativeFrames: NativePoseFrame[],
  calibrationInput: { worldLandmarks: Landmark[] }[],
  heightIn: number | null | undefined,
  posture?: Parameters<typeof shoulderWidthScaleFromFrames>[2],
): BodyScaleFallbacks {
  const body3D = body3DScaleFromFrames(nativeFrames, heightIn, measureLimbSpansInUnits(calibrationInput));
  const shoulders = shoulderWidthScaleFromFrames(calibrationInput, heightIn, posture);
  const candidates: ScaleEstimate[] = [
    ...(body3D.scale != null
      ? [{ source: "body_3d" as const, scale: body3D.scale, uncertaintyFraction: body3D.uncertaintyFraction }]
      : []),
    ...(shoulders.scale != null
      ? [{ source: "shoulder_width" as const, scale: shoulders.scale, uncertaintyFraction: shoulders.uncertaintyFraction }]
      : []),
  ];
  const diagnostics = [
    ...(body3D.scale != null
      ? [
          {
            source: `body_3d:${body3D.limb ?? "?"}:${body3D.heightSource ?? "?"}`,
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
  return { candidates, body3D, shoulders, diagnostics };
}
