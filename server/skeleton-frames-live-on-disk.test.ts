import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CAMERA_DERIVED_SET_COLUMNS } from "@shared/schema";

const read = (p: string) => fs.readFileSync(path.join(__dirname, p), "utf8");

/** The shape, scanned: the database half is proven on real Postgres by the .itest.ts twin. */
describe("a set's skeleton frames live in a file on the persistent disk", () => {
  it("the trace directory is gated, so the bare path is refused without a signature", () => {
    const signing = read("media-url-signing.ts");
    const list = signing.slice(signing.indexOf("const GATED_UPLOAD_DIRS"), signing.indexOf("]);", signing.indexOf("const GATED_UPLOAD_DIRS")));
    expect(list).toMatch(/"set-traces"/);
  });

  it("the path column is a camera column, so the report's membership and the column scan see it", () => {
    expect(CAMERA_DERIVED_SET_COLUMNS).toContain("skeletonFramesPath");
    expect(read("reconcile-schema.ts")).toMatch(/ADD COLUMN IF NOT EXISTS "skeleton_frames_path" text;/);
  });

  it("the save writes the file before the insert and never re-inserts a blob it was handed", () => {
    const storage = read("storage.ts");
    const fn = storage.slice(storage.indexOf("async submitWorkoutLog("), storage.indexOf("async submitWorkoutLog(") + 60_000);
    expect(fn).toMatch(/await writeSetTraceFile\(url, sent\)/);
    expect(fn).toMatch(/skeletonFrames: traceByKey\.get\(s\.setNumber\)\?\.skeletonFrames \?\? null,/);
    expect(fn).toMatch(/skeletonFramesPath: traceByKey\.get\(s\.setNumber\)\?\.skeletonFramesPath \?\? null,/);
    // captureField no longer handles the frames: the blob is never read off the payload into the row.
    expect(fn).not.toMatch(/captureField\([^)]*"skeletonFrames"\)/);
    // A rollback removes what was written; a commit removes what was superseded; the ledger is told.
    expect(fn).toMatch(/for \(const url of writtenTracePaths\) await deleteSetTraceFile\(url\);\s*throw err;/);
    expect(fn).toMatch(/if \(!retainedTracePaths\.has\(url\)\) await deleteSetTraceFile\(url\);/);
    expect(fn).toMatch(/for \(const url of writtenTracePaths\) await this\.recordUploadedFile\(url, athleteId\);/);
  });

  it("both readers accept either the column or the file, and the clip list counts either", () => {
    const storage = read("storage.ts");
    expect(storage).toMatch(/skeleton_frames IS NOT NULL OR wse\.skeleton_frames_path IS NOT NULL\) AS has_skeleton_frames/);
    expect(storage.match(/await readSetTraceFile\(/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("account deletion removes the athlete's whole trace directory", () => {
    const storage = read("storage.ts");
    const del = storage.slice(storage.indexOf("async deleteUserRecord("), storage.indexOf("async deleteUserRecord(") + 6000);
    expect(del).toMatch(/deleteAthleteTraceDir\(userId\)/);
  });

  it("the offload job is started at boot and nulls a row only while it still holds frames", () => {
    expect(read("index.ts")).toMatch(/startSetTraceOffloadJob\(\)/);
    const job = read("set-trace-offload-job.ts");
    expect(job).toMatch(/SET skeleton_frames = NULL, skeleton_frames_path = \$\{url\}\s*WHERE id = \$\{row\.id\} AND skeleton_frames IS NOT NULL/);
    expect(job).toMatch(/VACUUM \(ANALYZE\) workout_set_entries/);
    expect(job).not.toMatch(/sql`VACUUM FULL/);
  });
});
