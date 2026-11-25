/**
 * THE FOURTH CAMERA SYSTEM: LiDAR, READ AS THE FLOOR.
 *
 * Scott, 2026-11-24: "lets add the 4th camera system, let ai overwatch make sure its not 'taking
 * control' and not blocking anything, rule one ... just confidence boost." And the constraint that
 * shaped it: the camera opens on 0.5x, and LiDAR pairs with the 1x camera only.
 *
 * So LiDAR does not measure the athlete during the set. It measures ONE number before it: how high
 * the phone sits above the floor (AvLidarFloorScan in AvBodyTrackingPlugin.swift, a second or so
 * of depth frames taken the moment Record is pressed, with the phone already on its tripod). The
 * floor does not move, the tripod does not move, and gravity (CoreMotion, already recorded as
 * cameraPitchDeg / cameraRollDeg) says which way is down. From those three, any pixel where the
 * athlete's feet touch the floor maps to an exact distance from the lens -- on the 0.5x camera, the
 * 1x, any lens whose field of view is known -- and a distance is a ruler: metres per pixel at the
 * athlete's own depth, the same pinhole formula the depth ruler uses (depthRulerScale), with a
 * measured distance in place of Vision's estimated one.
 *
 * It needs no body proportion, no plate, nothing typed and nothing placed in the scene. A 5'1" and a
 * 6'6" athlete read on the same footing. It is a PEER in reconcileScaleEstimates like every other
 * ruler (Rule #2): it never leads, and a take with no scan, no floor in view or no feet in frame
 * simply has no LiDAR vote and reads exactly as before (Rule #1).
 */
import { visionJointsToNormalizedLandmarks } from "./vision-body-landmarks";
import { POSE_LANDMARKS } from "./pose-tracking";
import type { PoseFrame as NativePoseFrame } from "./native-av-preview";

/** What the native floor scan reports. */
export type LidarFloorScan = {
  /** How far the camera sits above the floor, along gravity, in metres. */
  cameraHeightM: number;
  /** The share of the depth points that fell on the floor plane: low means little floor in view. */
  floorShare: number;
  /** The spread of the floor points' heights (interquartile range, metres): a flat floor is ~0.01. */
  spreadM: number;
  /** Depth frames that produced a reading. */
  frames: number;
};

/** How wrong the LiDAR floor ruler can be when it is working. NOT YET MEASURED against the OVR:
 *  LiDAR depth is ~1% at 2-3 m and the floor height ~1 cm on ~1 m, but the bar can sit a few
 *  centimetres nearer or farther than the midpoint of the two ankles, which at 2.5 m is a few
 *  percent. Stated beside the plate's 0.083 until sensor-paired takes say otherwise. */
export const LIDAR_FLOOR_RULER_UNCERTAINTY = 0.06;

/** The lateral malleolus sits about 3.9% of stature above the floor (standard anthropometric
 *  tables); with no height on file a typical adult's 7 cm is used. The ankle landmark is the
 *  joint, not the sole, so the ray is intersected with a plane that high above the floor. */
const ANKLE_HEIGHT_FRACTION_OF_STATURE = 0.039;
const DEFAULT_ANKLE_HEIGHT_M = 0.07;
const METRES_PER_INCH = 0.0254;
/** Below this, the ray to the ankle runs almost parallel to the floor and a pixel of error is a
 *  metre of distance: such frames are skipped rather than trusted. */
const MIN_RAY_DOWNWARD_COMPONENT = 0.05;
/** The floor scan has to see some floor and see it flat before its height is used. */
export const MIN_FLOOR_SHARE = 0.05;
export const MAX_FLOOR_SPREAD_M = 0.05;
const MIN_CAMERA_HEIGHT_M = 0.1;
const MAX_CAMERA_HEIGHT_M = 3;
/** A distance outside LiDAR's useful range is a geometry fault, not a reading. */
const MIN_DISTANCE_M = 0.3;
const MAX_DISTANCE_M = 15;
const MIN_ANKLE_VISIBILITY = 0.5;
const MIN_FRAMES = 5;
const LOWEST_FEET_QUANTILE = 0.9;
const FLOOR_BAND_OF_FRAME = 0.02;
const HALF = 0.5;
const DEGREES_IN_HALF_TURN = 180;
const DEG_TO_RAD = Math.PI / DEGREES_IN_HALF_TURN;
const TWO = 2;

export type LidarFloorReading = {
  /** Metres per pixel at the athlete's distance. */
  scale: number;
  /** The median distance from the lens to the athlete (camera-space depth), metres. */
  distanceM: number;
  framesUsed: number;
  ankleHeightM: number;
};

export type LidarFloorRefusal =
  | "no_scan"
  | "scan_saw_no_floor"
  | "camera_height_out_of_range"
  | "no_gravity"
  | "no_field_of_view"
  | "no_feet_on_the_floor";

/** Gravity as a unit vector in the UPRIGHT image frame (x right, y down, z out of the lens),
 *  rebuilt from the recorded pitch and roll (stopGravitySampling: pitch = -asin(g.z),
 *  roll = atan2(g.x, -g.y), device axes). Portrait frames map device x to image x and device y to
 *  image -y; landscape (home button right) maps image x to -device y and image y to device x. */
export function gravityInImage(pitchDeg: number, rollDeg: number, landscape: boolean): [number, number, number] {
  const pitch = pitchDeg * DEG_TO_RAD;
  const roll = rollDeg * DEG_TO_RAD;
  const gz = -Math.sin(pitch);
  const r = Math.cos(pitch);
  const gx = r * Math.sin(roll);
  const gy = -r * Math.cos(roll);
  // The lens looks out of the BACK of the phone, along device -z.
  return landscape ? [-gy, gx, -gz] : [gx, -gy, -gz];
}

/** Camera-space depth (metres along the lens axis) of the floor-level point under one image
 *  pixel, or null when the ray never comes down to that plane. */
export function depthOfFloorPixel(
  px: number,
  py: number,
  frameWidth: number,
  frameHeight: number,
  fovDeg: number,
  gravity: [number, number, number],
  heightAboveThatPlaneM: number,
): number | null {
  const longAxis = Math.max(frameWidth, frameHeight);
  const focal = (longAxis * HALF) / Math.tan(fovDeg * DEG_TO_RAD * HALF);
  const ray: [number, number, number] = [(px - frameWidth * HALF) / focal, (py - frameHeight * HALF) / focal, 1];
  const down = ray[0] * gravity[0] + ray[1] * gravity[1] + ray[2] * gravity[2];
  if (!(down > MIN_RAY_DOWNWARD_COMPONENT)) return null;
  // ray has z = 1, so the multiple that reaches the plane IS the camera-space depth.
  return heightAboveThatPlaneM / down;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / TWO);
  return s.length % TWO ? s[mid] : (s[mid - 1] + s[mid]) * HALF;
}

export function lidarFloorScale(input: {
  scan: LidarFloorScan | null | undefined;
  pitchDeg: number | null | undefined;
  rollDeg: number | null | undefined;
  fovDeg: number | null | undefined;
  frames: NativePoseFrame[];
  heightIn: number | null | undefined;
}): { reading: LidarFloorReading | null; refusedBecause: LidarFloorRefusal | null } {
  const { scan, pitchDeg, rollDeg, fovDeg, frames, heightIn } = input;
  if (!scan) return { reading: null, refusedBecause: "no_scan" };
  if (!(scan.floorShare >= MIN_FLOOR_SHARE) || !(scan.spreadM <= MAX_FLOOR_SPREAD_M)) {
    return { reading: null, refusedBecause: "scan_saw_no_floor" };
  }
  if (!(scan.cameraHeightM >= MIN_CAMERA_HEIGHT_M && scan.cameraHeightM <= MAX_CAMERA_HEIGHT_M)) {
    return { reading: null, refusedBecause: "camera_height_out_of_range" };
  }
  if (pitchDeg == null || rollDeg == null || !Number.isFinite(pitchDeg) || !Number.isFinite(rollDeg)) {
    return { reading: null, refusedBecause: "no_gravity" };
  }
  if (!fovDeg || !(fovDeg > 0)) return { reading: null, refusedBecause: "no_field_of_view" };
  const ankleHeightM = heightIn && heightIn > 0 ? heightIn * METRES_PER_INCH * ANKLE_HEIGHT_FRACTION_OF_STATURE : DEFAULT_ANKLE_HEIGHT_M;
  const planeBelowCamera = scan.cameraHeightM - ankleHeightM;
  const perFrame = frames
    .filter((f) => f.tracked && f.frameWidth > 0 && f.frameHeight > 0)
    .map((f) => {
      const lm = visionJointsToNormalizedLandmarks(f);
      const ankles = [lm[POSE_LANDMARKS.LEFT_ANKLE], lm[POSE_LANDMARKS.RIGHT_ANKLE]].filter(
        (a) => a != null && (a.visibility ?? 0) >= MIN_ANKLE_VISIBILITY,
      );
      if (ankles.length === 0) return null;
      const px = (ankles.reduce((sum, a) => sum + a.x, 0) / ankles.length) * f.frameWidth;
      const py = (ankles.reduce((sum, a) => sum + a.y, 0) / ankles.length) * f.frameHeight;
      const g = gravityInImage(pitchDeg, rollDeg, f.frameWidth > f.frameHeight);
      const z = depthOfFloorPixel(px, py, f.frameWidth, f.frameHeight, fovDeg, g, planeBelowCamera);
      if (z == null || z < MIN_DISTANCE_M || z > MAX_DISTANCE_M) return null;
      return { z, py: py / f.frameHeight, metresPerPixelPerMetre: (TWO * Math.tan(fovDeg * DEG_TO_RAD * HALF)) / Math.max(f.frameWidth, f.frameHeight) };
    })
    .filter((r): r is { z: number; py: number; metresPerPixelPerMetre: number } => r != null);
  // ONLY FEET ON THE FLOOR (2026-11-25). A box jump stands on a 61cm box for seconds, and a foot
  // in the air or on the box is not on the plane the ray is cut against. Feet on the floor are the
  // LOWEST feet in the image, so only frames whose ankles sit within FLOOR_BAND_OF_FRAME of the
  // lowest the ankles went (its 90th percentile, so one stray landmark cannot set it) are read --
  // however long the athlete stood on the box. A 61cm box at 3m is about 13% of the frame above
  // the floor; ankle jitter is about 1%. A lift whose feet never move keeps every frame.
  const ys = [...perFrame.map((r) => r.py)].sort((a, b) => a - b);
  const lowestFeet = ys.length > 0 ? ys[Math.floor((ys.length - 1) * LOWEST_FEET_QUANTILE)] : 0;
  const onFloor = perFrame.filter((r) => r.py >= lowestFeet - FLOOR_BAND_OF_FRAME);
  const depths = onFloor.map((r) => r.z);
  const scale = perFrame.length > 0 ? perFrame[0].metresPerPixelPerMetre : null;
  if (depths.length < MIN_FRAMES || scale == null) return { reading: null, refusedBecause: "no_feet_on_the_floor" };
  const distanceM = median(depths);
  return { reading: { scale: distanceM * scale, distanceM, framesUsed: depths.length, ankleHeightM }, refusedBecause: null };
}
