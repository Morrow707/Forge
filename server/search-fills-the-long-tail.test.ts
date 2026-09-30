import { describe, expect, it } from "vitest";
import { buildVocabulary, type LibraryExercise } from "@shared/exercise-vocabulary";
import { searchForUnmatched } from "./exercise-video-match-run";
import type { SearchedVideo } from "./youtube-catalog";

/**
 * SEARCHING FOR WHAT NO CHANNEL HAS -- WITHOUT LOWERING THE BAR.
 *
 * The long tail is missing because no channel in the pool films a Lizard Stretch at all, not
 * because those videos were refused. Search reaches them; the danger is that search also reaches
 * the whole of YouTube, where the median video is not a demonstration of anything.
 *
 * So the only thing this pass changes is WHICH passing candidate wins -- the most watched rather
 * than the shortest. Everything that decides whether a candidate passes at all is untouched, and
 * these tests exist to keep it that way.
 */
const lib = (name: string, equipment: string, muscleGroups: string[]): LibraryExercise => ({
  id: name.length * 7 + name.charCodeAt(0),
  name,
  equipment,
  muscleGroups,
  kind: "exercise",
});

const LIBRARY: LibraryExercise[] = [
  lib("Lizard Stretch", "Bodyweight", ["Hips"]),
  lib("Couch Stretch", "Bodyweight", ["Hips"]),
  lib("Back Squat", "Barbell", ["Quads"]),
  lib("Front Squat", "Barbell", ["Quads"]),
  lib("Goblet Squat", "Dumbbell", ["Quads"]),
  lib("Barbell Curl", "Barbell", ["Biceps"]),
  lib("Barbell Wrist Curl", "Barbell", ["Forearms"]),
  lib("Deadlift", "Barbell", ["Hamstrings"]),
  lib("Sumo Deadlift", "Barbell", ["Glutes"]),
  lib("Plank", "Bodyweight", ["Abs"]),
];
const VOCAB = buildVocabulary(LIBRARY);

const vid = (p: Partial<SearchedVideo> & { title: string }): SearchedVideo => ({
  videoId: p.title.replace(/\W/g, "").slice(0, 11),
  channel: "Some Uploader",
  durationSeconds: 60,
  embeddable: true,
  viewCount: 1000,
  likeCount: 10,
  ...p,
});

const fill = (names: string[], results: Record<string, SearchedVideo[]>, maxSearches = 10) =>
  searchForUnmatched(LIBRARY, names, VOCAB, 180, maxSearches, async (q) => results[q] ?? []);

describe("filling the long tail by search", () => {
  it("takes the most watched of the candidates that pass", async () => {
    const { filled } = await fill(["Lizard Stretch"], {
      "Lizard Stretch": [
        vid({ title: "Lizard Stretch", videoId: "quiet", viewCount: 900 }),
        vid({ title: "Lizard Stretch", videoId: "popular", viewCount: 480_000 }),
      ],
    });
    expect(filled.get("Lizard Stretch")?.videoId).toBe("popular");
  });

  it("does NOT let popularity buy past the rules", async () => {
    // Each of these would have been refused coming from a channel, and a million views does not
    // make any of them a demonstration of a lizard stretch.
    const { filled, stillEmpty } = await fill(["Lizard Stretch"], {
      "Lizard Stretch": [
        vid({ title: "Lizard Stretch is OVERRATED!", viewCount: 5_000_000 }),
        vid({ title: "My Lizard Stretch PR 405 lbs", viewCount: 4_000_000 }),
        vid({ title: "Lizard Stretch \u{1F602}", viewCount: 3_000_000 }),
        vid({ title: "Couch Stretch", viewCount: 9_000_000 }),
        vid({ title: "Lizard Stretch", viewCount: 2_000_000, durationSeconds: 900 }),
        vid({ title: "Lizard Stretch", viewCount: 1_000_000, embeddable: false }),
      ],
    });
    expect(filled.size).toBe(0);
    expect(stillEmpty).toEqual(["Lizard Stretch"]);
  });

  it("keeps the equipment rule, which popularity would happily trample", async () => {
    const { filled } = await fill(["Barbell Curl"], {
      "Barbell Curl": [vid({ title: "Dumbbell Curl", viewCount: 8_000_000 })],
    });
    expect(filled.size).toBe(0);
  });

  it("still refuses a more specific movement", async () => {
    const { filled } = await fill(["Barbell Curl"], {
      "Barbell Curl": [vid({ title: "Barbell Wrist Curl", viewCount: 6_000_000 })],
    });
    expect(filled.size).toBe(0);
  });

  it("marks every searched result Tier B, whoever uploaded it", async () => {
    // The uploader is somebody nobody has watched. That is exactly what the allowlist is for,
    // and a searched video must never arrive pre-trusted.
    const { filled } = await fill(["Couch Stretch"], {
      "Couch Stretch": [vid({ title: "Couch Stretch", viewCount: 200_000 })],
    });
    const match = filled.get("Couch Stretch");
    expect(match?.tier).toBe("B");
    expect(match?.fromSearch).toBe(true);
  });

  it("stops at the cap and says what is left, so a run can be continued tomorrow", async () => {
    // A full pass is ~17,500 units against 10,000 a day. Running past the cap would not fail
    // loudly -- it would start returning quota errors and silently fill nothing.
    const names = ["Lizard Stretch", "Couch Stretch", "Plank"];
    const { searched, remaining } = await fill(names, {}, 2);
    expect(searched).toBe(2);
    expect(remaining).toEqual(["Plank"]);
  });

  it("keeps going when one lookup throws", async () => {
    // Quota exhaustion and a transient error look identical here, and one failed lookup is not
    // worth losing the exercises already filled.
    const result = await searchForUnmatched(LIBRARY, ["Plank", "Couch Stretch"], VOCAB, 180, 10,
      async (q) => {
        if (q === "Plank") throw new Error("quotaExceeded");
        return [vid({ title: "Couch Stretch", viewCount: 5 })];
      });
    expect(result.filled.get("Couch Stretch")).toBeTruthy();
    expect(result.stillEmpty).toContain("Plank");
  });
});
