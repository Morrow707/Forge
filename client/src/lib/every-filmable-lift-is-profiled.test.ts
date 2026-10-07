// THE FILMABLE SET IS 54 LIFTS, NOT 413, and every one of them must be profiled.
//
// Scott, 2026-10-06, correcting a count in this session: "for the 413 exercises there should
// only be like 40 or some odd exercises we can record ... we don't need to film clamshells or
// bicep curls, tricep extensions for example, we don't need that video storage."
//
// He is right and the list already exists: CANONICAL_VIDEO_ELIGIBLE_NAMES in server/seed.ts
// backfills `exercises.videoEligible = false` on every library exercise outside it, the coach's
// toggle is not drawn for a restricted exercise, and `resolveVideoCheckEnabled` in storage.ts
// refuses to turn video on for one whatever the client sent. The gate is real on both sides.
//
// What this test is for: the camera profile tables are keyed by NAME, and a lift added to the
// canonical list with no entry in them falls through to the DEFAULTS -- posture "standing" (which
// hands the height ruler a stature span it may have no business measuring, the Romanian deadlift
// bug of 2026-10-05) and `DEFAULT_MIN_ROM_FRACTION` for the rep gate. That is invisible: the lift
// films, produces numbers, and nothing says which of them came from a table and which from a
// fallback. So the 54 are pinned here against the profile they resolve to.
//
// Jump-tracked lifts are exempt from the bar-path columns on purpose: `jump-tracking.ts` reads
// none of the ROM bucket, the first move or the film guidance. They are listed explicitly rather
// than detected, so a NEW jump lift has to be added here deliberately.
import fs from "node:fs";
import path from "path";

import { describe, expect, it } from "vitest";

import {
  filmGuidanceForExercise,
  firstMoveForExercise,
  postureForExercise,
  romBucketForExercise,
} from "./exercise-camera-profile";

const SEED = path.resolve(__dirname, "../../../server/seed.ts");

function canonicalFilmableNames(): string[] {
  const src = fs.readFileSync(SEED, "utf8");
  const start = src.indexOf("CANONICAL_VIDEO_ELIGIBLE_NAMES = new Set([");
  expect(start).toBeGreaterThan(-1);
  const block = src.slice(start, src.indexOf("])", start));
  return Array.from(block.matchAll(/"([^"]+)"/g), (m) => m[1]);
}

// Filmed by the jump tracker, which reads no bar-path profile at all.
const JUMP_TRACKED = new Set([
  "Box Jump",
  "Broad Jump",
  "Depth Jump",
  "Countermovement Jump",
  "Squat Jump",
  "Tuck Jump",
  "Standing Long Jump",
  "Lateral Bound",
]);

// KNOWN GAP, recorded rather than silently filled: a hip thrust has no ROM bucket, so its rep
// gate is DEFAULT_MIN_ROM_FRACTION. It may well be the right number -- a thrust's travel is
// short -- but nobody has filmed one beside the sensor, and Scott's instruction on the posture
// sweep was to leave the numbers alone. This list shrinks when one is measured; it must never
// grow without a reason written beside the name.
const NO_ROM_BUCKET_YET = new Set(["Hip Thrust"]);

describe("every filmable lift is profiled", () => {
  const names = canonicalFilmableNames();

  it("is a short curated list, not the whole library", () => {
    // The point of the whole feature is video storage: the cost scales with how many DISTINCT
    // exercises can be filmed. If this number ever approaches the library's size, the backfill
    // has stopped working.
    expect(names.length).toBe(54);
    for (const junk of ["Clamshell", "Barbell Curl", "Overhead Tricep Extension", "Foam Roll Quads"]) {
      expect(names).not.toContain(junk);
    }
  });

  it("names every lift that has ever been read against the OVR sensor", () => {
    // A lift with sensor-paired numbers behind it that could not be filmed would make every one
    // of those comparisons unreproducible.
    for (const lift of ["Back Squat", "Bench Press", "Pendlay Row", "Romanian Deadlift", "Box Jump", "Push Press"]) {
      expect(names).toContain(lift);
    }
  });

  const barPath = names.filter((n) => !JUMP_TRACKED.has(n));

  it.each(barPath)("%s has a rep gate that is not the bare default", (name) => {
    if (NO_ROM_BUCKET_YET.has(name)) {
      expect(romBucketForExercise(name)).toBeNull();
      return;
    }
    expect(romBucketForExercise(name)).not.toBeNull();
  });

  it.each(barPath)("%s knows which phase a rep starts on", (name) => {
    expect(firstMoveForExercise(name)).not.toBeNull();
  });

  it.each(barPath)("%s has film guidance written for it", (name) => {
    expect(filmGuidanceForExercise(name)).toBeTruthy();
  });

  it("resolves a posture for every one of them, and the hinges are hinges", () => {
    for (const name of names) {
      expect(postureForExercise(name)).toBeTruthy();
    }
    // The three postures in the filmable set that are NOT standing, each one a ruler decision.
    expect(postureForExercise("Romanian Deadlift")).toBe("bent_over");
    expect(postureForExercise("Pendlay Row")).toBe("bent_over");
    expect(postureForExercise("Bent-Over Row")).toBe("bent_over");
    expect(postureForExercise("T-Bar Row")).toBe("bent_over");
    expect(postureForExercise("Single-Arm Dumbbell Row")).toBe("bent_over");
    expect(postureForExercise("Bench Press")).toBe("lying");
    expect(postureForExercise("Hip Thrust")).toBe("lying");
    // A conventional, sumo and hex-bar deadlift all finish upright and keep their height ruler.
    expect(postureForExercise("Deadlift")).toBe("standing");
    expect(postureForExercise("Sumo Deadlift")).toBe("standing");
    expect(postureForExercise("Hex Bar Deadlift")).toBe("standing");
  });
});

/* A LIFT ADDED TO THE CANONICAL LIST LATER MUST ACTUALLY BECOME FILMABLE.
 *
 * The seed's videoEligible backfill only moves a row still at null, which is what stops a reseed
 * re-restricting one an admin re-enabled. The mirror case bit on 2026-10-07: Barbell Shoulder
 * Press was restricted by an earlier deploy, then took Overhead Press's place on this list, and
 * stayed `false` -- the coach's toggle would never have come back, and nothing anywhere would
 * have said why. Proved by running the seed against a database an earlier deploy had already
 * touched; it is invisible on a fresh one, which is why the suites were all green.
 *
 * This is a scan rather than a round trip because the promotion is a loop inside the seed with no
 * seam to call. It fails if somebody deletes the promotion or stops keying it on this list.
 */
describe("the canonical list promotes what an earlier deploy restricted", () => {
  const src = fs.readFileSync(SEED, "utf8");

  it("promotes a canonical lift sitting at videoEligible=false", () => {
    const i = src.indexOf("let videoPromoted = 0;");
    expect(i, "the promotion loop is gone -- a lift added to the list stays restricted").toBeGreaterThan(0);
    const loop = src.slice(i, i + 700);
    expect(loop).toContain("videoEligible !== false");
    expect(loop).toContain("CANONICAL_VIDEO_ELIGIBLE_NAMES.has");
    expect(loop).toContain("videoEligible: true");
  });

  it("still only ever restricts a row that is null, so a re-enabled lift stays enabled", () => {
    const i = src.indexOf("let videoRestricted = 0;");
    expect(src.slice(i, i + 500)).toContain("videoEligible !== null");
  });
});
