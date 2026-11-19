import { beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { exerciseVideoRuns, exercises } from "@shared/schema";
import { db, makeCoach, makeExercise, resetDatabase } from "./test-support/fixtures";
import { applyReviewedExerciseVideosOnce, EXERCISE_VIDEO_APPLY_MARKER, REJECTED_2026_11_19 } from "./exercise-video-apply-once";

// SCOTT'S 2026-11-19 CALL ON THE EXERCISE-VIDEO DRY RUN ("reject the tier B ones you listed and
// apply"), carried out once at boot through the page's own functions, on real Postgres.

const PLACEHOLDER = "https://www.youtube.com/results?search_query=x";
const TIER_B_IN_REVIEW = 120;
const TIER_A_IN_FIXTURE = 2;
const CLIP_SECONDS = 20;

beforeEach(async () => {
  await resetDatabase();
});

async function savedRun(opts: { dropOneRejected?: boolean } = {}) {
  const owner = await makeCoach();
  const make = (name: string) => makeExercise(owner.id, { name, videoUrl: PLACEHOLDER });
  const rejected = await Promise.all(REJECTED_2026_11_19.map((r) => make(r.name)));
  const otherB = await Promise.all(
    Array.from({ length: TIER_B_IN_REVIEW - REJECTED_2026_11_19.length }, (_, i) => make(`Tier B ${i}`)),
  );
  const tierA = await Promise.all(Array.from({ length: TIER_A_IN_FIXTURE }, (_, i) => make(`Tier A ${i}`)));
  const proposal = (ex: { id: number; name: string }, tier: "A" | "B", videoId: string) => ({
    kind: "exercise",
    id: ex.id,
    name: ex.name,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    match: { videoId, title: ex.name, channel: "c", durationSeconds: CLIP_SECONDS, tier, corroboration: "single" },
  });
  const rejectedProposals = rejected
    .map((ex, i) => proposal(ex, "B", REJECTED_2026_11_19[i].videoId))
    .slice(opts.dropOneRejected ? 1 : 0);
  const proposals = [
    ...rejectedProposals,
    ...otherB.map((ex, i) => proposal(ex, "B", `b${i}`)),
    ...tierA.map((ex, i) => proposal(ex, "A", `a${i}`)),
  ];
  const [run] = await db.insert(exerciseVideoRuns).values({ report: { proposals }, decisions: {} }).returning();
  return { run, rejected, otherB, tierA };
}

const videoOf = async (ids: number[]) =>
  (await db.select({ id: exercises.id, videoUrl: exercises.videoUrl }).from(exercises).where(inArray(exercises.id, ids))).map((r) => r.videoUrl);

describe("the reviewed dry run, applied once", () => {
  it("rejects the nine, approves the other tier B, writes tier A, and never runs twice", async () => {
    const { run, rejected, otherB, tierA } = await savedRun();
    const outcome = await applyReviewedExerciseVideosOnce();
    expect(outcome).toContain("rejected 9");

    expect(await videoOf(rejected.map((e) => e.id))).toEqual(rejected.map(() => PLACEHOLDER));
    expect((await videoOf(otherB.map((e) => e.id))).every((u) => u?.includes("watch?v=b"))).toBe(true);
    expect((await videoOf(tierA.map((e) => e.id))).every((u) => u?.includes("watch?v=a"))).toBe(true);

    const [saved] = await db.select().from(exerciseVideoRuns).where(eq(exerciseVideoRuns.id, run.id));
    expect(saved.appliedAt).not.toBeNull();
    const marker = await db.execute(sql`SELECT count(*)::int AS n FROM applied_backfills WHERE key = ${EXERCISE_VIDEO_APPLY_MARKER}`);
    expect(Number(((marker as { rows?: { n: number }[] }).rows ?? (marker as unknown as { n: number }[]))[0].n)).toBe(1);
    expect(await applyReviewedExerciseVideosOnce()).toContain("already applied");
  });

  it("leaves a run nobody reviewed alone and writes no marker", async () => {
    const { otherB } = await savedRun({ dropOneRejected: true });
    expect(await applyReviewedExerciseVideosOnce()).toContain("not found");
    expect(await videoOf(otherB.slice(0, 1).map((e) => e.id))).toEqual([PLACEHOLDER]);
  });
});
