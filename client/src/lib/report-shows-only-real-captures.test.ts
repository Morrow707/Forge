import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CAMERA_DERIVED_SET_COLUMNS,
  CAMERA_CAPTURE_EVIDENCE_COLUMNS,
} from "@shared/schema";

const root = resolve(__dirname, "../../..");
const storage = readFileSync(resolve(root, "server/storage.ts"), "utf-8");
const barTracking = readFileSync(resolve(root, "client/src/lib/bar-tracking.ts"), "utf-8");

/**
 * A set that was never filmed was appearing on the admin tracking report, reading "No data
 * points recorded for this set" -- which is exactly how a capture that RAN AND FAILED reads,
 * and telling those two apart is the entire job of this report.
 */
describe("the tracking report shows captures, not cameras", () => {
  it("does not admit a set on device info alone", () => {
    // captureDeviceInfo describes the phone. It is stamped when the camera is available, not
    // when a take is produced.
    expect(CAMERA_CAPTURE_EVIDENCE_COLUMNS).not.toContain("captureDeviceInfo");
    expect(CAMERA_DERIVED_SET_COLUMNS).toContain("captureDeviceInfo");
  });

  it("still admits a capture that failed", () => {
    // A refused take writes diagnostics saying why. That is what keeps this narrowing from
    // repeating the silent drops this query has already suffered three times.
    expect(CAMERA_CAPTURE_EVIDENCE_COLUMNS).toContain("trackingDiagnostics");
    expect(CAMERA_CAPTURE_EVIDENCE_COLUMNS).toContain("trustScores");
    expect(CAMERA_CAPTURE_EVIDENCE_COLUMNS).toContain("skeletonFrames");
  });

  it("drops device info and nothing else", () => {
    // A wider narrowing is how a real capture goes missing. Exactly one column leaves the list.
    const dropped = CAMERA_DERIVED_SET_COLUMNS.filter(
      (c) => !(CAMERA_CAPTURE_EVIDENCE_COLUMNS as readonly string[]).includes(c),
    );
    expect(dropped).toEqual(["captureDeviceInfo"]);
  });

  it("is what the report query actually asks for", () => {
    expect(storage).toContain("CAMERA_CAPTURE_EVIDENCE_COLUMNS.map");
    expect(storage).not.toContain("CAMERA_DERIVED_SET_COLUMNS.map");
  });
});

/**
 * A back squat reported -220% velocity loss on a real athlete's screen. Arithmetically it was
 * correct; as a fatigue signal it is meaningless, and as a thing to read it looks broken.
 */
describe("velocity loss is a fatigue signal or nothing", () => {
  it("withholds rather than print an impossible percentage", async () => {
    const { velocityLossAcross } = await import("./bar-tracking");
    // The reported case: a slow un-rack fragment as rep 1, real reps after it.
    expect(velocityLossAcross([{ meanVelocityMps: 0.17 }, { meanVelocityMps: 0.54 }])).toBeNull();
  });

  it("keeps a real drop", async () => {
    const { velocityLossAcross } = await import("./bar-tracking");
    expect(velocityLossAcross([{ meanVelocityMps: 0.8 }, { meanVelocityMps: 0.6 }])).toBeCloseTo(25, 1);
  });

  it("keeps a modest rise, which is a real observation on a warm-up weight", async () => {
    const { velocityLossAcross } = await import("./bar-tracking");
    const v = velocityLossAcross([{ meanVelocityMps: 0.5 }, { meanVelocityMps: 0.6 }]);
    expect(v).toBeCloseTo(-20, 1);
  });

  it("says null for a single rep, and for a zero reference", async () => {
    const { velocityLossAcross } = await import("./bar-tracking");
    expect(velocityLossAcross([{ meanVelocityMps: 0.5 }])).toBeNull();
    expect(velocityLossAcross([{ meanVelocityMps: 0 }, { meanVelocityMps: 0.5 }])).toBeNull();
  });

  it("is computed in one place, not duplicated at each call site", async () => {
    // It was inline twice and the two copies had already drifted once -- one used peak, one mean.
    expect(barTracking.match(/velocityLossPercent: velocityLossAcross\(/g)).toHaveLength(2);
  });
});
