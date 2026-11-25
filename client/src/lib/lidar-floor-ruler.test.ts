/**
 * THE LIDAR FLOOR RULER, DRIVEN ON GEOMETRY WHOSE ANSWER IS KNOWN.
 *
 * A camera of known height and tilt looking at feet on a floor at a known distance: the ruler has
 * to give back that distance, and the metres-per-pixel that distance implies, for a short athlete
 * and a tall one, upright and tilted, portrait and landscape -- and it has to refuse (with a reason,
 * never a number) when it has no scan, no floor or no feet.
 */
import { describe, expect, it } from "vitest";
import { depthOfFloorPixel, gravityInImage, lidarFloorScale, type LidarFloorScan } from "./lidar-floor-ruler";
import type { PoseFrame } from "./native-av-preview";

const FRAME_W = 720;
const FRAME_H = 1280;
const ULTRA_WIDE_FOV_DEG = 106;
const CAMERA_HEIGHT_M = 1.0;
const DISTANCE_M = 2.5;
const INCHES_5_1 = 61;
const INCHES_6_6 = 78;
const METRES_PER_INCH = 0.0254;
const ANKLE_FRACTION = 0.039;
const FRAMES = 12;
const TWO_DECIMALS = 2;
const THREE_DECIMALS = 3;
const HALF = 0.5;
const DEGREES_IN_HALF_TURN = 180;
const DEG = Math.PI / DEGREES_IN_HALF_TURN;
const FLOOR_SHARE = 0.3;
const FLAT_SPREAD_M = 0.01;
const SCAN_FRAMES = 8;
const LITTLE_FLOOR = 0.01;
const ANKLE_CONFIDENCE = 0.9;
const TWO = 2;
const SIX_DECIMALS = 6;
const PITCH_DOWN_DEG = 12;
const BOX_M = 0.61;
const FLOOR_FRAMES = 6;
const BOX_FRAMES = 20;
const GOOD_SCAN: LidarFloorScan = { cameraHeightM: CAMERA_HEIGHT_M, floorShare: FLOOR_SHARE, spreadM: FLAT_SPREAD_M, frames: SCAN_FRAMES };

/** Where on the image an ankle at `distanceM` lands, for a camera tilted down by pitchDeg. */
function anklePixel(distanceM: number, ankleHeightM: number, pitchDeg: number): { x: number; y: number } {
  const focal = (Math.max(FRAME_W, FRAME_H) * HALF) / Math.tan(ULTRA_WIDE_FOV_DEG * DEG * HALF);
  // World: camera at origin, floor-plane-for-the-ankle (CAMERA_HEIGHT - ankle) below. Point straight
  // ahead at horizontal range R; rotate into a camera pitched down by pitchDeg.
  const drop = CAMERA_HEIGHT_M - ankleHeightM;
  const p = pitchDeg * DEG;
  // Find R so that the camera-space depth equals distanceM: z = R cos p + drop sin p.
  const range = (distanceM - drop * Math.sin(p)) / Math.cos(p);
  const yCam = drop * Math.cos(p) - range * Math.sin(p);
  return { x: FRAME_W * HALF, y: FRAME_H * HALF + (focal * yCam) / distanceM };
}

function frames(px: { x: number; y: number }, count = FRAMES): PoseFrame[] {
  return Array.from({ length: count }, (_, i) => ({
    frameIndex: i,
    timestamp: i,
    tracked: true,
    frameWidth: FRAME_W,
    frameHeight: FRAME_H,
    joints: [
      { name: "leftAnkle", x: px.x / FRAME_W, y: 1 - px.y / FRAME_H, confidence: ANKLE_CONFIDENCE },
      { name: "rightAnkle", x: px.x / FRAME_W, y: 1 - px.y / FRAME_H, confidence: ANKLE_CONFIDENCE },
    ],
  })) as unknown as PoseFrame[];
}

describe("the LiDAR floor ruler", () => {
  it("rebuilds gravity pointing down the image for an upright portrait phone", () => {
    const g = gravityInImage(0, 0, false);
    expect(g[0]).toBeCloseTo(0, THREE_DECIMALS);
    expect(g[1]).toBeCloseTo(1, THREE_DECIMALS);
    expect(g[2]).toBeCloseTo(0, THREE_DECIMALS);
  });

  it("puts gravity partly along the lens when the phone tilts down", () => {
    const g = gravityInImage(PITCH_DOWN_DEG, 0, false);
    expect(g[2]).toBeCloseTo(Math.sin(PITCH_DOWN_DEG * DEG), THREE_DECIMALS);
  });

  it("returns the known distance for a short and a tall athlete, level and tilted", () => {
    [INCHES_5_1, INCHES_6_6].forEach((inches) => {
      [0, PITCH_DOWN_DEG].forEach((pitch) => {
        const ankle = inches * METRES_PER_INCH * ANKLE_FRACTION;
        const { reading, refusedBecause } = lidarFloorScale({
          scan: GOOD_SCAN,
          pitchDeg: pitch,
          rollDeg: 0,
          fovDeg: ULTRA_WIDE_FOV_DEG,
          frames: frames(anklePixel(DISTANCE_M, ankle, pitch)),
          heightIn: inches,
        });
        expect(refusedBecause, `${inches}in pitch ${pitch}`).toBeNull();
        expect(reading?.distanceM, `${inches}in pitch ${pitch}`).toBeCloseTo(DISTANCE_M, TWO_DECIMALS);
        const expectedScale = (DISTANCE_M * TWO * Math.tan(ULTRA_WIDE_FOV_DEG * DEG * HALF)) / FRAME_H;
        expect(reading?.scale).toBeCloseTo(expectedScale, SIX_DECIMALS);
      });
    });
  });

  it("refuses with a reason, never a number, when it cannot read", () => {
    const base = { pitchDeg: 0, rollDeg: 0, fovDeg: ULTRA_WIDE_FOV_DEG, heightIn: INCHES_6_6 };
    const feet = frames(anklePixel(DISTANCE_M, INCHES_6_6 * METRES_PER_INCH * ANKLE_FRACTION, 0));
    expect(lidarFloorScale({ ...base, scan: null, frames: feet }).refusedBecause).toBe("no_scan");
    expect(lidarFloorScale({ ...base, scan: { ...GOOD_SCAN, floorShare: LITTLE_FLOOR }, frames: feet }).refusedBecause).toBe("scan_saw_no_floor");
    expect(lidarFloorScale({ ...base, scan: GOOD_SCAN, pitchDeg: null, frames: feet }).refusedBecause).toBe("no_gravity");
    expect(lidarFloorScale({ ...base, scan: GOOD_SCAN, frames: [] }).refusedBecause).toBe("no_feet_on_the_floor");
  });

  it("reads the floor frames of a box jump however long the athlete stands on the box", () => {
    const ankle = INCHES_6_6 * METRES_PER_INCH * ANKLE_FRACTION;
    const onFloor = frames(anklePixel(DISTANCE_M, ankle, PITCH_DOWN_DEG), FLOOR_FRAMES);
    const onBox = frames(anklePixel(DISTANCE_M, ankle + BOX_M, PITCH_DOWN_DEG), BOX_FRAMES);
    const { reading } = lidarFloorScale({
      scan: GOOD_SCAN,
      pitchDeg: PITCH_DOWN_DEG,
      rollDeg: 0,
      fovDeg: ULTRA_WIDE_FOV_DEG,
      frames: [...onFloor, ...onBox],
      heightIn: INCHES_6_6,
    });
    expect(reading?.distanceM).toBeCloseTo(DISTANCE_M, TWO_DECIMALS);
    expect(reading?.framesUsed).toBe(FLOOR_FRAMES);
  });

  it("skips a ray that never comes down to the floor", () => {
    const g = gravityInImage(0, 0, false);
    expect(depthOfFloorPixel(FRAME_W * HALF, 0, FRAME_W, FRAME_H, ULTRA_WIDE_FOV_DEG, g, 1)).toBeNull();
  });
});

describe("the LiDAR vote under overwatch (Rule #2)", () => {
  const BODY_3D = 0.004;
  const DEPTH = 0.0041;
  const SHOULDER = 0.0042;
  const BODY_UNCERTAINTY = 0.2;
  const FAR_OFF = 0.0024;
  const AGREEING = 0.00405;

  it("joins and tightens a cluster it agrees with", async () => {
    const { reconcileScaleEstimates } = await import("./pose-tracking");
    const { LIDAR_FLOOR_RULER_UNCERTAINTY } = await import("./lidar-floor-ruler");
    const verdict = reconcileScaleEstimates([
      { source: "body_3d", scale: BODY_3D, uncertaintyFraction: BODY_UNCERTAINTY },
      { source: "shoulder_width", scale: SHOULDER, uncertaintyFraction: BODY_UNCERTAINTY },
      { source: "lidar", scale: AGREEING, uncertaintyFraction: LIDAR_FLOOR_RULER_UNCERTAINTY },
    ]);
    expect(verdict.agreedSources).toContain("lidar");
    expect(verdict.blendTrace?.lidarSteppedOut).toBe(false);
  });

  it("is outvoted when two body readings agree against it", async () => {
    const { reconcileScaleEstimates } = await import("./pose-tracking");
    const { LIDAR_FLOOR_RULER_UNCERTAINTY } = await import("./lidar-floor-ruler");
    const verdict = reconcileScaleEstimates([
      { source: "body_3d", scale: BODY_3D, uncertaintyFraction: BODY_UNCERTAINTY },
      { source: "depth", scale: DEPTH, uncertaintyFraction: BODY_UNCERTAINTY },
      { source: "shoulder_width", scale: FAR_OFF * TWO, uncertaintyFraction: BODY_UNCERTAINTY },
      { source: "lidar", scale: FAR_OFF, uncertaintyFraction: LIDAR_FLOOR_RULER_UNCERTAINTY },
    ]);
    expect(verdict.agreedSources).not.toContain("lidar");
  });

  it("never wins by rank alone: a lone LiDAR read among disagreeing body rulers steps out", async () => {
    const { reconcileScaleEstimates } = await import("./pose-tracking");
    const { LIDAR_FLOOR_RULER_UNCERTAINTY } = await import("./lidar-floor-ruler");
    const SHOULDER_FAR = BODY_3D * TWO;
    const verdict = reconcileScaleEstimates([
      { source: "body_3d", scale: BODY_3D, uncertaintyFraction: BODY_UNCERTAINTY },
      { source: "shoulder_width", scale: SHOULDER_FAR, uncertaintyFraction: BODY_UNCERTAINTY },
      { source: "lidar", scale: FAR_OFF, uncertaintyFraction: LIDAR_FLOOR_RULER_UNCERTAINTY },
    ]);
    expect(verdict.agreedSources).not.toContain("lidar");
    expect(verdict.blendTrace?.lidarSteppedOut).toBe(true);
    expect(verdict.blendTrace?.plateSteppedOut).toBe(false);
  });
});
