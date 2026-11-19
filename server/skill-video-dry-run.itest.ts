import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { skillExercises } from "@shared/schema";
import { db, makeCoach, resetDatabase } from "./test-support/fixtures";

// THE SKILL-DRILL VIDEO DRY RUN (2026-11-19), on real Postgres with YouTube's search faked: the
// first real run skipped all 398 drills because the lift grammar found no movement word in them.

const PLACEHOLDER = "https://www.youtube.com/results?search_query=x";
const SHORT = 40;
const TOO_LONG = 900;
const MANY_VIEWS = 9000;
const FEW_VIEWS = 10;
const MOST_VIEWS = 20000;
const SEARCH_BUDGET = 5;
const DRILLS = 3;

const video = (videoId: string, title: string, durationSeconds = SHORT, viewCount = FEW_VIEWS) => ({
  videoId,
  title,
  channel: "Coach",
  durationSeconds,
  embeddable: true,
  viewCount,
  likeCount: 0,
});
const searches: string[] = [];
const results: Record<string, ReturnType<typeof video>[]> = {
  "Front Toss Hitting drill": [
    video("lowviews", "Front Toss for Hitters"),
    video("highviews", "Front Toss Drill | Baseball", SHORT, MANY_VIEWS),
    video("mistake", "Front Toss MISTAKES", SHORT, MOST_VIEWS),
  ],
  "Tee Work - Inside Pitch Hitting drill": [video("other", "Tee Work for Beginners")],
  "Bunt Placement Hitting drill": [video("long", "Bunt Placement Masterclass", TOO_LONG)],
};

vi.mock("./youtube-catalog", async (importOriginal) => {
  const real = await importOriginal<typeof import("./youtube-catalog")>();
  return {
    ...real,
    searchVideosFor: async (query: string) => {
      searches.push(query);
      return results[query] ?? [];
    },
  };
});

const { planExerciseVideoBackfill } = await import("./exercise-video-backfill");

beforeEach(async () => {
  await resetDatabase();
  searches.length = 0;
  // The run keeps a week-long search cache on disk; a previous run of this file would answer
  // every query from it and no search would go out.
  rmSync(join(tmpdir(), "forge-youtube-cache"), { recursive: true, force: true });
});

describe("the skill-drill dry run", () => {
  it("searches each drill with its skill type and proposes the most-watched title that names it", async () => {
    const coach = await makeCoach();
    const stamp = Date.now();
    await db.insert(skillExercises).values(
      ["Front Toss", "Tee Work - Inside Pitch", "Bunt Placement"].map((name) => ({
        coachId: coach.id,
        name,
        skillType: "Hitting",
        videoUrl: `${PLACEHOLDER}${stamp}`,
      })),
    );
    const report = await planExerciseVideoBackfill({ kind: "skill", maxSearches: SEARCH_BUDGET });

    expect(searches.sort()).toEqual(Object.keys(results).sort());
    expect(report.byKind.skill).toEqual({ considered: DRILLS, matched: 1 });
    expect(report.proposals).toHaveLength(1);
    expect(report.proposals[0]).toMatchObject({ name: "Front Toss", match: { videoId: "highviews", tier: "B" } });
    expect(report.channels).toEqual([]);

    const why = Object.fromEntries(report.unmatched.map((u) => [u.name, u.rejection?.reason]));
    expect(why["Tee Work - Inside Pitch"]).toBe("head");
    expect(why["Bunt Placement"]).toBe("duration");
  });
});
