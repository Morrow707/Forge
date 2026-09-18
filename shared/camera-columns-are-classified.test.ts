import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import {
  CAMERA_DERIVED_SET_COLUMNS,
  NON_CAMERA_SET_COLUMNS,
  workoutSetEntries,
} from "./schema";

// ADDING A CAPTURE MODE MUST NOT BE ABLE TO SKIP THE TRACKING REPORT.
//
// The report decides a set ran through the camera by asking whether any camera-derived column is
// set. That question was asked about four columns -- diagnostics, peak velocity, bar path
// deviation, jump height -- which describe bar-path and jump captures and nothing else. Five
// modes shipped afterwards writing none of them: kettlebell swing, med ball, the golf/baseball
// swing, sprint, sled push. Every one of those captures was invisible on the only page that
// exists to explain a capture, and nothing said so, because an absent row and a mode nobody
// filmed look identical from the page.
//
// A hand-kept list is what failed, so this does not keep one. It reads the table's real columns
// and requires each to be classified as camera-derived or not. A new mode's column lands here as
// a failure naming the column, which is the one moment somebody is in a position to answer the
// question correctly.
describe("every workout_set_entries column is classified", () => {
  const actual = Object.keys(getTableColumns(workoutSetEntries)).sort();
  const camera = new Set<string>(CAMERA_DERIVED_SET_COLUMNS);
  const notCamera = new Set<string>(NON_CAMERA_SET_COLUMNS);

  it("leaves nothing unclassified", () => {
    const unclassified = actual.filter((c) => !camera.has(c) && !notCamera.has(c));
    expect(
      unclassified,
      "a new column on this table is a new answer to 'did a camera write this'. If a capture " +
        "writes it, add it to CAMERA_DERIVED_SET_COLUMNS or the tracking report cannot see that " +
        "mode. If not, add it to NON_CAMERA_SET_COLUMNS.",
    ).toEqual([]);
  });

  it("classifies nothing twice, and nothing that is gone", () => {
    expect([...camera].filter((c) => notCamera.has(c))).toEqual([]);
    const stale = [...camera, ...notCamera].filter((c) => !actual.includes(c)).sort();
    expect(stale, "a column that no longer exists on the table").toEqual([]);
  });

  it("still covers the four the report used to ask about", () => {
    // The original membership test, kept as a floor: whatever else changes, these stay camera.
    for (const c of ["trackingDiagnostics", "peakVelocityMps", "barPathDeviationCm", "jumpHeightCm"]) {
      expect(camera.has(c), `${c} must stay camera-derived`).toBe(true);
    }
  });

  it("covers the five modes that were invisible", () => {
    // Named individually rather than counted, because the failure here was a mode being absent
    // and nobody noticing. One of these going missing should read as that mode, not as a number.
    for (const [mode, column] of [
      ["kettlebell swing", "kbSwingPeakSpeedMps"],
      ["med ball", "medBallPeakSpeedMps"],
      ["golf/baseball swing", "swingSeparationDeg"],
      ["sprint / horizontal load", "horizontalLoadElapsedSeconds"],
      ["sled push distance", "horizontalLoadDistanceYards"],
    ] as const) {
      expect(camera.has(column), `${mode} (${column}) must be camera-derived`).toBe(true);
    }
  });

  it("keeps a hand-uploaded form video OUT", () => {
    // An athlete can upload a form video with no tracking at all. If this became camera-derived,
    // the report would fill with sets nobody pointed a tracker at and stop being readable.
    expect(camera.has("formCheckVideoUrl")).toBe(false);
    expect(camera.has("videoUploadedAt")).toBe(false);
    expect(camera.has("isPr")).toBe(false);
  });
});
