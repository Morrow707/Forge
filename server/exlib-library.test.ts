/* eslint-disable ts-patterns/no-magic-numbers -- test fixtures */
/**
 * The ExLib additions (2026-11-23): the data is sound and the video write is narrow.
 *
 * - every new exercise has a name nobody else in the library has, real vocabulary in every field,
 *   instructions, and a YouTube video where the sheet had one;
 * - nothing re-adds an exercise the 2026-11-22 review hid on purpose;
 * - every video for an existing exercise names a VISIBLE library row and is a single video;
 * - mayReplaceVideo replaces only a seeded search placeholder or the channel backfill's own write,
 *   never a URL somebody chose (the backfill's rule, shared/exercise-video-match.ts).
 */
import { describe, expect, it } from "vitest";
import { EXLIB_EXERCISES, EXLIB_VIDEOS_FOR_EXISTING } from "./seed-data/exlib-2026-11-23";
import { HIDDEN_EXERCISE_NAMES, HIDDEN_SKILL_DRILL_NAMES } from "@shared/library-review-2026-11-22";
import { libraryNamesToTranslate } from "../client/src/i18n/library-names";
import { mayReplaceVideo } from "./exlib-videos";

const CATEGORIES = new Set(["strength", "conditioning", "olympic", "accessory", "mobility", "plyometric"]);
const MOVEMENTS = new Set(["Pull", "Mobility", "Activation", "Squat", "Isometric", "Push", "Hinge", "Lunge", "Press", "Rotation", "Combination", "Carry"]);
// One YouTube video, optionally from a start time: matches "https://youtu.be/beEsRxn1tiw?t=15" and
// "https://www.youtube.com/watch?v=4lMX-hUbIho", rejects a search link "https://www.youtube.com/results?search_query=x".
// https://regex101.com/?regex=%5Ehttps%3A%5C%2F%5C%2F(youtu%5C.be%5C%2F%5B%5Cw-%5D%7B11%7D%7Cwww%5C.youtube%5C.com%5C%2Fwatch%5C%3Fv%3D%5B%5Cw-%5D%7B11%7D)(%5B%3F%26%5Dt%3D%5Cd%2Bs%3F)%3F%24&testString=https%3A%2F%2Fyoutu.be%2FbeEsRxn1tiw%3Ft%3D15
const YOUTUBE_VIDEO = /^https:\/\/(youtu\.be\/[\w-]{11}|www\.youtube\.com\/watch\?v=[\w-]{11})([?&]t=\d+s?)?$/;

describe("the ExLib additions", () => {
  it("adds over a thousand exercises, each with a unique name", () => {
    const names = EXLIB_EXERCISES.map((e) => e.name);
    expect(names.length).toBeGreaterThan(1000);
    expect(new Set(names).size).toBe(names.length);
  });

  it("re-adds nothing the library review hid", () => {
    expect(EXLIB_EXERCISES.filter((e) => HIDDEN_EXERCISE_NAMES.has(e.name) || HIDDEN_SKILL_DRILL_NAMES.has(e.name)).map((e) => e.name)).toEqual([]);
  });

  it("uses the library's own vocabulary in every field and has instructions", () => {
    const bad = EXLIB_EXERCISES.filter(
      (e) =>
        !CATEGORIES.has(e.category) ||
        !MOVEMENTS.has(e.movementType) ||
        !["bilateral", "unilateral"].includes(e.laterality) ||
        !e.muscleGroup ||
        !e.equipment ||
        e.instructions.trim().length < 40,
    ).map((e) => e.name);
    expect(bad).toEqual([]);
  });

  it("carries a single YouTube video wherever the sheet had one", () => {
    const withVideo = EXLIB_EXERCISES.filter((e) => e.videoUrl);
    expect(withVideo.length).toBeGreaterThan(1050);
    expect(withVideo.filter((e) => !YOUTUBE_VIDEO.test(e.videoUrl!)).map((e) => `${e.name}: ${e.videoUrl}`)).toEqual([]);
  });

  it("puts each sheet video on a visible library exercise, once", () => {
    const visible = new Set(libraryNamesToTranslate());
    const targets = EXLIB_VIDEOS_FOR_EXISTING.map((v) => v.name);
    expect(targets.filter((n) => !visible.has(n))).toEqual([]);
    expect(new Set(targets).size).toBe(targets.length);
    expect(EXLIB_VIDEOS_FOR_EXISTING.filter((v) => !YOUTUBE_VIDEO.test(v.url)).map((v) => v.name)).toEqual([]);
  });

  it("a new name is never one the library already had", () => {
    const visible = new Set(libraryNamesToTranslate().filter((n) => !EXLIB_EXERCISES.some((e) => e.name === n)));
    expect(EXLIB_EXERCISES.filter((e) => visible.has(e.name)).map((e) => e.name)).toEqual([]);
  });
});

describe("which video the sheet may replace", () => {
  const backfill = new Set(["exercise:7:https://www.youtube.com/watch?v=abcdefghijk"]);

  it("replaces a search placeholder or nothing at all", () => {
    expect(mayReplaceVideo("https://www.youtube.com/results?search_query=back+squat", "exercise:7", backfill)).toBe(true);
    expect(mayReplaceVideo(null, "exercise:7", backfill)).toBe(true);
  });

  it("replaces the channel backfill's own write on that same row", () => {
    expect(mayReplaceVideo("https://www.youtube.com/watch?v=abcdefghijk", "exercise:7", backfill)).toBe(true);
  });

  it("never replaces a URL somebody chose, nor the backfill's video on a different row", () => {
    expect(mayReplaceVideo("https://www.youtube.com/watch?v=zzzzzzzzzzz", "exercise:7", backfill)).toBe(false);
    expect(mayReplaceVideo("https://www.youtube.com/watch?v=abcdefghijk", "exercise:8", backfill)).toBe(false);
    expect(mayReplaceVideo("https://www.youtube.com/watch?v=abcdefghijk", "skill:7", backfill)).toBe(false);
  });
});
