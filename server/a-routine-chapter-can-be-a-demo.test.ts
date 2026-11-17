import { describe, expect, it } from "vitest";
import { clipWindowFromUrl, parseChapters, type VideoCandidate } from "@shared/exercise-video-match";
import type { LibraryExercise } from "@shared/exercise-vocabulary";
import { runSignatureMatch } from "./exercise-video-match-run";
import { watchUrlFor } from "./exercise-video-backfill";

/* Scott, 2026-11-17, after no YouTube channel films one stretch per video: "then we need to change
 * the rules a bit" -- and chose reading chapters. A routine's chapters become candidates of their
 * own, titled by their own label, as long as their own chapter, always Tier B. */

const ROUTINE = `20 minute hip routine for athletes

0:00 Intro
1:10 Lizard Stretch
2:05 Pigeon Stretch
3:00 - Couch Stretch
4:20 Outro`;

describe("chapters in a description", () => {
  it("are read as label, start and end", () => {
    expect(parseChapters(ROUTINE, 300)).toEqual([
      { label: "Intro", startSeconds: 0, endSeconds: 70 },
      { label: "Lizard Stretch", startSeconds: 70, endSeconds: 125 },
      { label: "Pigeon Stretch", startSeconds: 125, endSeconds: 180 },
      { label: "Couch Stretch", startSeconds: 180, endSeconds: 260 },
      { label: "Outro", startSeconds: 260, endSeconds: 300 },
    ]);
  });

  it("follow YouTube's own rule, so a stray timestamp in prose is not a chapter", () => {
    expect(parseChapters("Watch the stretch at 1:10 Lizard Stretch", 300)).toEqual([]);
    expect(parseChapters("1:10 Lizard Stretch\n2:05 Pigeon Stretch\n3:00 Couch Stretch", 300)).toEqual([]); // no 0:00
    expect(parseChapters("0:00 A\n2:05 B\n1:10 C", 300)).toEqual([]); // not ascending
    expect(parseChapters("0:00 A\n1:10 B\n6:00 C", 300)).toEqual([]); // past the end
    expect(parseChapters("0:00 Intro\n1:02:05 Long\n1:05:00 Cool down", 4000)).toHaveLength(3); // h:mm:ss
  });
});

const lib = (name: string, equipment: string, muscleGroups: string[]): LibraryExercise => ({
  id: name.length * 7 + name.charCodeAt(0),
  name,
  equipment,
  muscleGroups,
  kind: "exercise",
});
const LIBRARY = [
  lib("Lizard Stretch", "Bodyweight", ["Hips"]),
  lib("Couch Stretch", "Bodyweight", ["Hips"]),
  lib("Back Squat", "Barbell", ["Quads"]),
];
const chapter = (title: string, start: number, end: number): VideoCandidate => ({
  videoId: "routine0001", title, channel: "Functional Bodybuilding", durationSeconds: end - start,
  embeddable: true, startSeconds: start, endSeconds: end, videoTitle: "20 minute hip routine",
});

describe("a chapter as a candidate", () => {
  it("fills an exercise no whole video covers, as Tier B even on an auto-apply channel, with its window", () => {
    const run = runSignatureMatch(LIBRARY, [chapter("Lizard Stretch", 70, 125)], 200);
    const m = run.chosen.get("Lizard Stretch");
    expect(m?.tier).toBe("B");
    expect([m?.startSeconds, m?.endSeconds]).toEqual([70, 125]);
    expect(watchUrlFor(m!.videoId, m!.startSeconds, m!.endSeconds)).toBe(
      "https://www.youtube.com/watch?v=routine0001&t=70&end=125",
    );
  });

  it("loses to a whole video made for that exercise, even a longer one", () => {
    const whole: VideoCandidate = {
      videoId: "couchdemo01", title: "Couch Stretch", channel: "Mobility Channel",
      durationSeconds: 90, embeddable: true,
    };
    const run = runSignatureMatch(LIBRARY, [chapter("Couch Stretch", 180, 220), whole], 200);
    expect(run.chosen.get("Couch Stretch")?.videoId).toBe("couchdemo01");
  });

  it("is held to the length cap by its own chapter, not the routine", () => {
    const run = runSignatureMatch(LIBRARY, [chapter("Lizard Stretch", 0, 400)], 200);
    expect(run.chosen.get("Lizard Stretch")).toBeUndefined();
  });
});

describe("the player's window", () => {
  it("reads t= and end= off a saved URL, and nothing off a whole video's", () => {
    expect(clipWindowFromUrl("https://www.youtube.com/watch?v=routine0001&t=70&end=125")).toEqual({ start: 70, end: 125 });
    expect(clipWindowFromUrl("https://www.youtube.com/watch?v=abc")).toEqual({ start: null, end: null });
  });
});

describe("the channel list", () => {
  it("carries a chaptered mobility channel, found by name", async () => {
    const { DEMO_VIDEO_CHANNELS } = await import("./exercise-video-backfill");
    expect(DEMO_VIDEO_CHANNELS).toContain("search:Tom Merrick");
    expect(DEMO_VIDEO_CHANNELS).toContain("search:Tom Morrison");
    expect(DEMO_VIDEO_CHANNELS).toContain("search:Yoga With Adriene");
    expect(DEMO_VIDEO_CHANNELS).toContain("search:GMB Fitness");
  });
});

describe("a yoga pose is the library's stretch", () => {
  it("Lizard Pose and Pigeon Pose reach Lizard Stretch and Pigeon Stretch, and Child's Pose still matches itself", () => {
    const lib2 = [...LIBRARY, lib("Pigeon Stretch", "Bodyweight", ["Glutes"]), lib("Child's Pose", "Bodyweight", ["Back"])];
    const run = runSignatureMatch(
      lib2,
      [chapter("Lizard Pose", 10, 50), chapter("Pigeon Pose", 60, 100), chapter("Child's Pose", 120, 160)],
      200,
    );
    expect(run.chosen.get("Lizard Stretch")?.title).toBe("Lizard Pose");
    expect(run.chosen.get("Pigeon Stretch")?.title).toBe("Pigeon Pose");
    expect(run.chosen.get("Child's Pose")?.title).toBe("Child's Pose");
  });
});
