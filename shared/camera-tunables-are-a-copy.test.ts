// THE COPY IS A COPY, AND IT IS SEPARATE. Both halves of Scott's instruction, pinned.
//
// Scott, 2026-10-06: "Don't change the numbers that are already there, just make sure they are
// their own separate individual numbers" / "So copy and paste."
//
// So there are two things to prove, and they fail for different reasons:
//
// 1. SAME NUMBERS. Every value in the registry equals the constant it was copied from. A value
//    edited in bar-tracking.ts or pose-tracking.ts without the registry following fails here
//    rather than drifting -- the "change one, change both" rule the Swift arbiter port already
//    follows. This is what makes "don't change the numbers" enforceable instead of asserted.
// 2. SEPARATE RECORDS. Two identities resolve to two objects, and writing a fitted number onto
//    one is invisible to the other. This is the whole point: a 40-yard dash calibration must not
//    reach the bench press.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MAX_PLAUSIBLE_LIFT_VELOCITY_MPS,
  MAX_PLAUSIBLE_VELOCITY_CHANGE_PCT,
  MIN_TRACKING_CONFIDENCE,
  DEFAULT_MAX_DEVIATION_FRACTION,
  DEFAULT_MAX_ROM_FRACTION,
  DEFAULT_MIN_ROM_FRACTION,
  DRIVE_ONSET_FRACTION,
  MAX_DEVIATION_FRACTION_OF_HEIGHT,
  MAX_PEAK_TO_MEAN_RATIO,
  MAX_ROM_FRACTION_OF_HEIGHT,
  MIN_ROM_FRACTION_OF_HEIGHT,
  TRAVEL_ONSET_MARGIN_BY_ROM_KIND_M,
  TRAVEL_ONSET_MARGIN_M,
  MAX_PLAUSIBLE_ACCEL_G,
  OCCLUSION_MIN_GAP_MS,
  OCCLUSION_MAX_GAP_MS,
} from "../client/src/lib/bar-tracking";
import { ANKLE_3D_RULER_UNCERTAINTY } from "../client/src/lib/ankle-3d-ruler";
import { DEPTH_RULER_BIAS, DEPTH_RULER_UNCERTAINTY } from "../client/src/lib/body-3d-ruler";
import { HEIGHT_RULER_UNCERTAINTY,
  MAX_SHOULDER_SPAN_SPREAD,
} from "../client/src/lib/pose-tracking";
import {
  MAX_LOCK_DISTANCE_IN_YARDSTICKS,
  MAX_PLATE_ASPECT_RATIO,
  MAX_PLATE_SIZE_IN_YARDSTICKS,
  MAX_YARDSTICK_DEVIATION_RATIO,
} from "./tracker-arbiter";
import {
  FITTED_OVERRIDES,
  SHARED_CAMERA_TUNABLES,
  cameraTunablesFor,
} from "./camera-tunables-by-lift";

const ROM_BUCKETS = [
  "horizontal_press_or_row",
  "squat",
  "deadlift",
  "overhead_press",
  "olympic",
  "vertical_pull",
  "elbow_flexion_extension",
  "ankle_or_shrug",
  "lunge_or_step",
  "dip_or_pushup",
];

describe("the per-lift numbers are a copy of today's numbers", () => {
  it("HAS A PIN FOR EVERY FIELD, so a new one cannot arrive unchecked", () => {
    /* The case above is a hand-written list, and a hand-written list is what let the id and the
     * rate table drift apart in ai-usage.ts, and what this repo's scans exist to avoid.
     *
     * Proved by it on 2026-10-08: maxShoulderSpanSpread was added to the registry and this file
     * stayed green, because nothing required the new key to be mentioned. A registry field with
     * no pin is a number that can quietly stop equalling the constant it is a copy of -- which
     * is the ONE property this whole file exists to hold.
     *
     * So the list may stay hand-written (each pin names the constant it checks, which a
     * generated loop could not), and this makes the list complete. */
    const src = readFileSync(join(process.cwd(), "shared/camera-tunables-are-a-copy.test.ts"), "utf8");
    /* THE TWO FIELDS WITH NOTHING TO PIN AGAINST, named rather than silently skipped.
     *
     * The count-trim's two numbers no longer HAVE a module constant: bar-tracking.ts reads them
     * straight off the record (`const MAX_COUNT_TRIM_PER_EDGE = tune.maxCountTrimPerEdge`), so
     * the registry is their source and a pin would be circular. That is the end state this file
     * is driving everything towards, so it is a graduation and not an exemption -- but it has to
     * be written down, because "no pin" and "no pin yet" look identical in a filter. */
    const REGISTRY_IS_THE_SOURCE = new Set(["maxCountTrimPerEdge", "minCountTrimOddness"]);
    for (const k of REGISTRY_IS_THE_SOURCE) {
      expect(
        Object.keys(SHARED_CAMERA_TUNABLES),
        `${k} is listed as registry-sourced but is not in the registry`,
      ).toContain(k);
    }
    const unpinned = Object.keys(SHARED_CAMERA_TUNABLES).filter(
      (k) => !REGISTRY_IS_THE_SOURCE.has(k) && !src.includes(`SHARED_CAMERA_TUNABLES.${k}`),
    );
    expect(
      unpinned,
      `these registry fields have no pin against the constant they were copied from: ${unpinned.join(", ")}`,
    ).toEqual([]);
  });

  it("copies every shared constant exactly", () => {
    expect(SHARED_CAMERA_TUNABLES.minRomFractionOfHeight).toBe(DEFAULT_MIN_ROM_FRACTION);
    expect(SHARED_CAMERA_TUNABLES.maxRomFractionOfHeight).toBe(DEFAULT_MAX_ROM_FRACTION);
    expect(SHARED_CAMERA_TUNABLES.maxDeviationFractionOfHeight).toBe(DEFAULT_MAX_DEVIATION_FRACTION);
    expect(SHARED_CAMERA_TUNABLES.travelOnsetMarginM).toBe(TRAVEL_ONSET_MARGIN_M);
    expect(SHARED_CAMERA_TUNABLES.maxPeakToMeanRatio).toBe(MAX_PEAK_TO_MEAN_RATIO);
    expect(SHARED_CAMERA_TUNABLES.driveOnsetFraction).toBe(DRIVE_ONSET_FRACTION);
    expect(SHARED_CAMERA_TUNABLES.heightRulerUncertainty).toBe(HEIGHT_RULER_UNCERTAINTY);
    expect(SHARED_CAMERA_TUNABLES.depthRulerBias).toBe(DEPTH_RULER_BIAS);
    expect(SHARED_CAMERA_TUNABLES.depthRulerUncertainty).toBe(DEPTH_RULER_UNCERTAINTY);
    expect(SHARED_CAMERA_TUNABLES.ankle3DRulerUncertainty).toBe(ANKLE_3D_RULER_UNCERTAINTY);
    expect(SHARED_CAMERA_TUNABLES.maxShoulderSpanSpread).toBe(MAX_SHOULDER_SPAN_SPREAD);
    expect(SHARED_CAMERA_TUNABLES.maxPlausibleAccelG).toBe(MAX_PLAUSIBLE_ACCEL_G);
    expect(SHARED_CAMERA_TUNABLES.occlusionMinGapMs).toBe(OCCLUSION_MIN_GAP_MS);
    expect(SHARED_CAMERA_TUNABLES.occlusionMaxGapMs).toBe(OCCLUSION_MAX_GAP_MS);
    // The gates, split per tracker on Scott's second instruction.
    expect(SHARED_CAMERA_TUNABLES.maxPlausibleSpeedMps).toBe(MAX_PLAUSIBLE_LIFT_VELOCITY_MPS);
    expect(SHARED_CAMERA_TUNABLES.maxPlausibleVelocityChangePct).toBe(MAX_PLAUSIBLE_VELOCITY_CHANGE_PCT);
    expect(SHARED_CAMERA_TUNABLES.minTrackingConfidence).toBe(MIN_TRACKING_CONFIDENCE);
    expect(SHARED_CAMERA_TUNABLES.maxLockDistanceInYardsticks).toBe(MAX_LOCK_DISTANCE_IN_YARDSTICKS);
    expect(SHARED_CAMERA_TUNABLES.maxPlateAspectRatio).toBe(MAX_PLATE_ASPECT_RATIO);
    expect(SHARED_CAMERA_TUNABLES.maxPlateSizeInYardsticks).toBe(MAX_PLATE_SIZE_IN_YARDSTICKS);
    expect(SHARED_CAMERA_TUNABLES.maxYardstickDeviationRatio).toBe(MAX_YARDSTICK_DEVIATION_RATIO);
  });

  it("copies each tracker's own speed gate, from that tracker's own file", () => {
    // Read off the trackers themselves: MAX_PLAUSIBLE_BALL_SPEED_MPS (av-medball-tracker-dialog),
    // MAX_PLAUSIBLE_KB_SWING_SPEED_MPS (kb-swing-tracking), MAX_PLAUSIBLE_GRIP_SPEED_MPS
    // (swing-tracking), MAX_PLAUSIBLE_WRIST_SPEED_MPS (mechanics-tracking).
    expect(cameraTunablesFor("Med Ball Chest Pass", null, "med_ball").values.maxPlausibleSpeedMps).toBe(25);
    expect(cameraTunablesFor("Kettlebell Swing", null, "kb_swing").values.maxPlausibleSpeedMps).toBe(8);
    expect(cameraTunablesFor("Golf Swing", null, "golf_swing").values.maxPlausibleSpeedMps).toBe(15);
    expect(cameraTunablesFor("Pitching Drill", null, "mechanics").values.maxPlausibleSpeedMps).toBe(20);
    expect(cameraTunablesFor("Back Squat", "squat", "bar").values.maxPlausibleSpeedMps).toBe(
      MAX_PLAUSIBLE_LIFT_VELOCITY_MPS,
    );
  });

  it("A MED BALL GATE AND A GOLF SWING GATE ARE THE SAME KIND OF THING AND NOT THE SAME NUMBER", () => {
    // Scott, 2026-10-06: "if we change the gate on med ball throws it might change the gate on a
    // golf swing and yes they are similar but very different."
    const ball = cameraTunablesFor("Medicine Ball Rotational Throw", null, "med_ball");
    const swing = cameraTunablesFor("Golf Swing", null, "golf_swing");
    expect(ball.values.maxPlausibleSpeedMps).not.toBe(swing.values.maxPlausibleSpeedMps);
    const swingBefore = { ...swing.values };
    ball.values.maxPlausibleSpeedMps = 99;
    ball.values.minTrackingConfidence = 0.99;
    expect(swing.values).toEqual(swingBefore);
    expect(ball.sources.maxPlausibleSpeedMps).toBe("tracker");
  });

  it.each(ROM_BUCKETS)("copies the %s bucket's rep gate exactly", (bucket) => {
    const { values } = cameraTunablesFor("any lift", bucket);
    expect(values.minRomFractionOfHeight).toBe(
      MIN_ROM_FRACTION_OF_HEIGHT[bucket] ?? DEFAULT_MIN_ROM_FRACTION,
    );
    expect(values.maxRomFractionOfHeight).toBe(
      MAX_ROM_FRACTION_OF_HEIGHT[bucket] ?? DEFAULT_MAX_ROM_FRACTION,
    );
    expect(values.maxDeviationFractionOfHeight).toBe(
      MAX_DEVIATION_FRACTION_OF_HEIGHT[bucket] ?? DEFAULT_MAX_DEVIATION_FRACTION,
    );
    expect(values.travelOnsetMarginM).toBe(
      TRAVEL_ONSET_MARGIN_BY_ROM_KIND_M[bucket] ?? TRAVEL_ONSET_MARGIN_M,
    );
  });

  it("knows a bucket it has never heard of, and falls back rather than inventing", () => {
    const { values, sources } = cameraTunablesFor("Something New", "a_bucket_nobody_wrote");
    expect(values.minRomFractionOfHeight).toBe(DEFAULT_MIN_ROM_FRACTION);
    expect(sources.minRomFractionOfHeight).toBe("shared");
  });

  it("starts with NO lift carrying a fitted number of its own", () => {
    // The correct state today, and worth failing on: not one constant in the pipeline has been
    // fitted on a single lift in isolation. Every calibration win so far came from fixing a
    // LABEL or a RULE. An entry appearing here without a dated note in the camera notes is a
    // number somebody guessed.
    expect(Object.keys(FITTED_OVERRIDES)).toEqual([]);
  });
});

describe("the records are separate", () => {
  it("hands two lifts two different objects", () => {
    const bench = cameraTunablesFor("Bench Press", "horizontal_press_or_row");
    const squat = cameraTunablesFor("Back Squat", "squat");
    expect(bench.values).not.toBe(squat.values);
    expect(bench.sources).not.toBe(squat.sources);
  });

  it("hands the SAME lift a new object each time, so one take cannot poison the next", () => {
    const first = cameraTunablesFor("Bench Press", "horizontal_press_or_row");
    const second = cameraTunablesFor("Bench Press", "horizontal_press_or_row");
    expect(first.values).not.toBe(second.values);
    expect(first.values).toEqual(second.values);
  });

  it("A 40-YARD DASH CALIBRATION DOES NOT REACH THE BENCH PRESS", () => {
    // Scott's own example, as an assertion: "if we're testing let's say a 40 yard dash, it
    // shouldn't change any bench press numbers."
    const dash = cameraTunablesFor("40-Yard Dash", null);
    const bench = cameraTunablesFor("Bench Press", "horizontal_press_or_row");
    const benchBefore = { ...bench.values };

    dash.values.driveOnsetFraction = 0.42;
    dash.values.maxPeakToMeanRatio = 9;
    dash.values.minRomFractionOfHeight = 0.99;

    expect(bench.values).toEqual(benchBefore);
    expect(cameraTunablesFor("Bench Press", "horizontal_press_or_row").values).toEqual(benchBefore);
    // And the shared record it was copied from is frozen, so nothing can write through it.
    expect(() => {
      (SHARED_CAMERA_TUNABLES as { driveOnsetFraction: number }).driveOnsetFraction = 0.42;
    }).toThrow();
  });

  it("says where each number came from", () => {
    const squat = cameraTunablesFor("Back Squat", "squat");
    expect(squat.sources.minRomFractionOfHeight).toBe("rom_bucket");
    expect(squat.sources.maxPeakToMeanRatio).toBe("shared");
    expect(squat.identity).toBe("Back Squat");
  });
});
