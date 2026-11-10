import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { exercises, exerciseVideoRuns } from "@shared/schema";
import { makeCoach, resetDatabase } from "./test-support/fixtures";
import {
  applyExerciseVideoBackfill,
  decideProposal,
  latestDryRun,
  proposalKey,
  type BackfillProposal,
  type BackfillReport,
} from "./exercise-video-backfill";

/**
 * APPLY WRITES THE SAVED DRY RUN, AND ONLY WHAT A PERSON HAS NOT TURNED DOWN (2026-11-10).
 *
 * Scott's dry run that day spent the whole day's YouTube quota, and Apply re-ran the plan from
 * scratch -- so it could not run until the next day, and what it would have written was a fresh
 * match rather than the list he had read. Five of its tier-A matches were the wrong video. These
 * cases drive the saved run on real Postgres, with no YouTube call anywhere: a run row is inserted
 * as the dry run would have saved it, decisions are recorded, and Apply is read back off the
 * exercises table.
 */
const CLIP_SECONDS = 15;
const MAX_DURATION_SECONDS = 180;
const WRITTEN_AFTER_REVIEW = 2;
const A_RUN_THAT_DOES_NOT_EXIST = 1000;
type ExerciseInsert = typeof exercises.$inferInsert;
type RunInsert = typeof exerciseVideoRuns.$inferInsert;

const SEARCH = (name: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(name)}`;

async function exercise(coachId: number, name: string, videoUrl = SEARCH(name)) {
  const [row] = await db.insert(exercises).values({ coachId, name, videoUrl } as ExerciseInsert).returning();
  return row;
}

function proposal(id: number, name: string, tier: "A" | "B", videoId: string): BackfillProposal {
  return {
    kind: "exercise",
    id,
    name,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    match: { videoId, title: name, channel: "Functional Bodybuilding", durationSeconds: CLIP_SECONDS, tier, corroboration: "single" },
  };
}

async function saveRun(proposals: BackfillProposal[]): Promise<number> {
  const report: BackfillReport = {
    targetsConsidered: proposals.length,
    byKind: { exercise: { considered: proposals.length, matched: proposals.length }, skill: { considered: 0, matched: 0 } },
    proposals,
    unmatched: [],
    channels: [],
    quota: { units: 0, calls: 0 },
    maxDurationSeconds: MAX_DURATION_SECONDS,
    tierCounts: { A: proposals.filter((p) => p.match.tier === "A").length, B: proposals.filter((p) => p.match.tier === "B").length },
    unknownWords: [],
    duplicateSignatures: [],
    boilerplateByChannel: {},
  };
  const [row] = await db.insert(exerciseVideoRuns).values({ report: report as unknown as RunInsert["report"], decisions: {} }).returning();
  return row.id;
}

const urlOf = async (id: number) =>
  (await db.select({ v: exercises.videoUrl }).from(exercises).where(eq(exercises.id, id)))[0].v;

describe("a reviewed demo-video run", () => {
  beforeEach(resetDatabase);

  it("writes tier A, skips a rejected tier A, and writes tier B only once approved", async () => {
    const coach = await makeCoach();
    const squat = await exercise(coach.id, "Back Squat");
    const snatch = await exercise(coach.id, "Kettlebell Snatch");
    const hackSquat = await exercise(coach.id, "Machine Hack Squat");
    const woodchop = await exercise(coach.id, "Cable Woodchop");
    const runId = await saveRun([
      proposal(squat.id, "Back Squat", "A", "squat1"),
      proposal(snatch.id, "Kettlebell Snatch", "A", "dualkb"),
      proposal(hackSquat.id, "Machine Hack Squat", "B", "hack1"),
      proposal(woodchop.id, "Cable Woodchop", "B", "chop1"),
    ]);

    await decideProposal(runId, proposalKey({ kind: "exercise", id: snatch.id }), "reject");
    await decideProposal(runId, proposalKey({ kind: "exercise", id: hackSquat.id }), "approve");

    const applied = await applyExerciseVideoBackfill(runId);
    expect(applied?.written).toBe(WRITTEN_AFTER_REVIEW);
    expect(await urlOf(squat.id)).toBe("https://www.youtube.com/watch?v=squat1");
    expect(await urlOf(snatch.id)).toBe(SEARCH("Kettlebell Snatch")); // rejected, keeps its search link
    expect(await urlOf(hackSquat.id)).toBe("https://www.youtube.com/watch?v=hack1"); // approved B
    expect(await urlOf(woodchop.id)).toBe(SEARCH("Cable Woodchop")); // unreviewed B
    expect(applied?.appliedAt).not.toBeNull();
  });

  it("never overwrites a URL somebody set after the dry run", async () => {
    const coach = await makeCoach();
    const squat = await exercise(coach.id, "Back Squat");
    const runId = await saveRun([proposal(squat.id, "Back Squat", "A", "squat1")]);
    await db.update(exercises).set({ videoUrl: "https://www.youtube.com/watch?v=coachpick" }).where(eq(exercises.id, squat.id));

    const applied = await applyExerciseVideoBackfill(runId);
    expect(applied?.written).toBe(0);
    expect(await urlOf(squat.id)).toBe("https://www.youtube.com/watch?v=coachpick");
  });

  it("clears a decision, ignores a key the run never proposed, and 404s a run that is gone", async () => {
    const coach = await makeCoach();
    const hackSquat = await exercise(coach.id, "Machine Hack Squat");
    const runId = await saveRun([proposal(hackSquat.id, "Machine Hack Squat", "B", "hack1")]);
    const key = proposalKey({ kind: "exercise", id: hackSquat.id });

    expect((await decideProposal(runId, key, "approve"))?.decisions[key]).toBe("approve");
    expect((await decideProposal(runId, key, null))?.decisions[key]).toBeUndefined();
    expect((await decideProposal(runId, "exercise:999999", "approve"))?.decisions).toEqual({});
    expect(await decideProposal(runId + A_RUN_THAT_DOES_NOT_EXIST, key, "approve")).toBeNull();
    expect(await applyExerciseVideoBackfill(runId + A_RUN_THAT_DOES_NOT_EXIST)).toBeNull();
  });

  it("serves the newest saved run with its decisions, so a review survives a reload", async () => {
    const coach = await makeCoach();
    const a = await exercise(coach.id, "Back Squat");
    await saveRun([proposal(a.id, "Back Squat", "A", "old")]);
    const newer = await saveRun([proposal(a.id, "Back Squat", "A", "new")]);
    await decideProposal(newer, proposalKey({ kind: "exercise", id: a.id }), "reject");

    const latest = await latestDryRun();
    expect(latest?.runId).toBe(newer);
    expect(latest?.proposals[0].match.videoId).toBe("new");
    expect(latest?.decisions[proposalKey({ kind: "exercise", id: a.id })]).toBe("reject");
  });
});
