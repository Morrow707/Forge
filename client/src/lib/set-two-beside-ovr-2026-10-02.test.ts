import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { replayCapture, type StoredCapture } from "./capture-replay";
import { LOW_VISIBILITY_WRIST_FLOOR, MIN_VISIBILITY, lowVisibilityWristConfidence, POSE_LANDMARKS } from "./pose-tracking";

type Landmark = Parameters<typeof lowVisibilityWristConfidence>[0][number];
import row from "./__fixtures__/pendlay-row-set2-2026-10-02.json";
import bench from "./__fixtures__/bench-set2-2026-10-02.json";
import press from "./__fixtures__/push-press-set2-2026-10-02.json";

// Scott's second set of each lift beside the OVR sensor, 2026-10-02, build 594. See
// docs/camera-tracking-notes.md, "Set 2 beside OVR, 2026-10-02".
const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), "utf8");

describe("the Pendlay row's pickup is not a rep", () => {
  // Sensor: nine rows, mean 1.02 m/s, peak 1.68, ROM 19.5in (49.5cm). The device counted ten,
  // the first being the bar coming off the floor: 96.8cm over 3.7s against a 54cm median.
  it("counts nine rows and lands on the sensor's mean", () => {
    const result = replayCapture((row as StoredCapture[])[0]);
    expect(result.repCount).toBe(9);
    const m = result.metrics!;
    expect(m.meanVelocityMps).toBeCloseTo(1.02, 1);
    expect(Math.abs(m.romCm! - 49.5) / 49.5).toBeLessThan(0.05);
    expect(Math.min(...m.repBreakdown.map((r) => r.startT))).toBeGreaterThan(5_000);
  });
  it("is an edge rule with a stated ratio", () => {
    const src = read("client/src/lib/bar-tracking.ts");
    expect(src).toMatch(/const EDGE_OVERSIZED_AMPLITUDE_RATIO = 1\.6;/);
    expect(src).toMatch(/amplitude > medianConcentricAmplitude \* EDGE_OVERSIZED_AMPLITUDE_RATIO/);
  });
});

describe("the push press, filmed from the front at an angle, is unchanged", () => {
  it("still finds nine presses", () => {
    const result = replayCapture((press as StoredCapture[])[0]);
    expect(result.repCount).toBe(9);
  });
});

describe("the bench whose wrists Vision lost for half the take", () => {
  // OPEN. 360 of 680 frames had no wrist above MIN_VISIBILITY; the stored trace has fifteen holes
  // and replays exactly as the device reported (0.46 against the sensor's 0.76). The fix (a wrist
  // under the floor is used at its own confidence) acts at capture time, so this trace cannot show
  // it; the next bench from that angle can, through trace.wristsBelowVisibilityFloor.
  it.fails("lands within 20% of the sensor's mean", () => {
    const result = replayCapture((bench as StoredCapture[])[0]);
    expect(Math.abs(result.metrics!.meanVelocityMps! - 0.76) / 0.76).toBeLessThan(0.2);
  });
  it("uses a wrist under the visibility floor at its own confidence, and only above the low floor", () => {
    const lm = (visibility: number): Landmark[] => {
      const out: Landmark[] = [];
      out[POSE_LANDMARKS.LEFT_WRIST] = { x: 0, y: 0, z: 0, visibility } as Landmark;
      return out;
    };
    expect(LOW_VISIBILITY_WRIST_FLOOR).toBeLessThan(MIN_VISIBILITY);
    expect(lowVisibilityWristConfidence(lm(0.3), "left")).toBe(0.3);
    expect(lowVisibilityWristConfidence(lm(0.1), "left")).toBe(0);
    expect(lowVisibilityWristConfidence(lm(0.9), "left")).toBe(0);
    const dialog = read("client/src/components/av-bar-tracker-dialog.tsx");
    expect(dialog).toMatch(/lowVisibilityWristConfidence\(worldLm, side\)/);
    expect(dialog).toMatch(/wristsBelowVisibilityFloor\+\+/);
  });
});

describe("a set the camera filmed keeps its clip", () => {
  it("records on every tracked exercise, whatever the form-check switch says", () => {
    const src = read("client/src/pages/workout.tsx");
    expect(src).toMatch(/const mergedTracking = item\.trackingLevel !== "none";/);
    expect(src).not.toMatch(/const mergedTracking = item\.trackingLevel !== "none" && videoRequired/);
    // The form-check request still follows the switch.
    expect(src.match(/if \(videoUrl && videoRequired\) \{/g)?.length).toBe(5);
  });
  it("logs every video outcome to the debug console and exports whether a clip was kept", () => {
    const store = read("client/src/lib/video-offline-store.ts");
    expect(store).toMatch(/logDebug\("VIDEO", `\$\{sizeKb\}KB uploaded/);
    expect(store).toMatch(/logDebug\("VIDEO", `\$\{sizeKb\}KB queued: not on Wi-Fi`\)/);
    expect(store).toMatch(/logDebug\("VIDEO", `\$\{sizeKb\}KB queued for retry/);
    const storage = read("server/storage.ts");
    expect(storage).toMatch(/hasVideo: sql<boolean>`\$\{workoutSetEntries\.formCheckVideoUrl\} is not null`/);
    expect(storage).toMatch(/videoCheckEnabled: programExercises\.videoCheckEnabled/);
    expect(read("server/routes.ts")).toMatch(/hasVideo: r\.hasVideo,\n\s*videoCheckEnabled: r\.videoCheckEnabled,/);
  });
});
