/**
 * SCOTT'S CALL ON THE 2026-11-19 EXERCISE-VIDEO DRY RUN, CARRIED OUT ONCE AT BOOT.
 *
 * Scott read the dry run (331 of 410 lifts, 211 tier A and 120 tier B) and said: "reject the
 * tier B ones you listed and apply". Apply writes tier A unless rejected and tier B only when
 * approved (shouldWrite), and the admin page has no approve-all, so this does the same three
 * things the page's buttons do, through the same functions: reject the nine, approve every other
 * tier B match, then Apply the saved run. Nothing is re-matched and YouTube is not called.
 *
 * IT ACTS ON THAT RUN AND NO OTHER. The run is recognised by the nine rejected matches being in
 * it with the exact videos Scott was shown, and by its 120 tier B rows. A newer dry run nobody has
 * reviewed is left alone, and a run that is already applied is left alone. Recorded in
 * applied_backfills so a redeploy never repeats it; a run that cannot be found writes no marker
 * and says so in the log.
 */
import { sql, desc } from "drizzle-orm";
import { db } from "./db";
import { exerciseVideoRuns } from "@shared/schema";
import { applyExerciseVideoBackfill, decideProposal, proposalKey, type BackfillProposal } from "./exercise-video-backfill";
import { runWithJobLock } from "./job-lock";
import { reportJobFailure } from "./job-errors";

export const EXERCISE_VIDEO_APPLY_MARKER = "exercise_videos_apply_2026_11_19";
const JOB = "exercise-video-apply-once";
const REVIEWED_TIER_B_COUNT = 120;
const RUNS_TO_SEARCH = 5;

/** The nine tier B matches Scott rejected, by exercise and the exact video he was shown. */
export const REJECTED_2026_11_19: ReadonlyArray<{ name: string; videoId: string; why: string }> = [
  { name: "Jump Rope", videoId: "UcXZKCoRXto", why: "a Rogue product advert" },
  { name: "Foam Roll Quads", videoId: "1XzS9y-vJD8", why: "a TriggerPoint product video" },
  { name: "Machine Row", videoId: "-q4OkPSL2AA", why: "a know-the-difference comparison" },
  { name: "Hip Abduction Machine", videoId: "tu4o4quPv2k", why: "a know-the-difference comparison" },
  { name: "Skater Squat", videoId: "PeCASb3GkBw", why: "a five-exercise compilation" },
  { name: "Ski Erg Intervals", videoId: "3HbNy_hnk8A", why: "workout footage, not a demonstration" },
  { name: "Rowing Machine Intervals", videoId: "zBzVKitJ32E", why: "workout footage, not a demonstration" },
  { name: "Single-Leg Hop", videoId: "pPAehVv7ilM", why: "a chapter of an injury-myth video" },
  { name: "Box Squat", videoId: "tGGjhiyzQX8", why: "an explainer short rather than a demonstration" },
];

const isRejected = (p: BackfillProposal) =>
  REJECTED_2026_11_19.some((r) => r.name === p.name && r.videoId === p.match.videoId);

/** Whether a saved run's proposals are the ones Scott reviewed. Pure, so it is testable. */
export function isTheReviewedRun(proposals: BackfillProposal[]): boolean {
  const tierB = proposals.filter((p) => p.match.tier === "B");
  return tierB.length === REVIEWED_TIER_B_COUNT && REJECTED_2026_11_19.every((r) => tierB.some((p) => r.name === p.name && r.videoId === p.match.videoId));
}

function readRows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
}

export async function applyReviewedExerciseVideosOnce(): Promise<string> {
  const applied = readRows<{ n: number }>(
    await db.execute(sql`SELECT count(*)::int AS n FROM applied_backfills WHERE key = ${EXERCISE_VIDEO_APPLY_MARKER}`),
  );
  if (Number(applied[0]?.n ?? 0) > 0) return "already applied; nothing re-run";

  const rows = await db.select().from(exerciseVideoRuns).orderBy(desc(exerciseVideoRuns.id)).limit(RUNS_TO_SEARCH);
  const run = rows.find((r) => isTheReviewedRun(((r.report as { proposals?: BackfillProposal[] })?.proposals ?? [])));
  if (!run) return "the reviewed dry run was not found among the latest saved runs; nothing written, will look again next boot";
  if (run.appliedAt) {
    await db.execute(sql`INSERT INTO applied_backfills (key) VALUES (${EXERCISE_VIDEO_APPLY_MARKER}) ON CONFLICT DO NOTHING`);
    return `run ${run.id} was already applied by hand; nothing written`;
  }

  const proposals = (run.report as { proposals: BackfillProposal[] }).proposals.filter((p) => p.match.tier === "B");
  // One decision at a time, in order, through the same locked write the admin page uses.
  await proposals.reduce(
    (prev, p) => prev.then(() => decideProposal(run.id, proposalKey(p), isRejected(p) ? "reject" : "approve")).then(() => undefined),
    Promise.resolve(),
  );
  const result = await applyExerciseVideoBackfill(run.id);
  await db.execute(sql`INSERT INTO applied_backfills (key) VALUES (${EXERCISE_VIDEO_APPLY_MARKER}) ON CONFLICT DO NOTHING`);
  const rejected = proposals.filter(isRejected).length;
  return `run ${run.id}: rejected ${rejected}, approved ${proposals.length - rejected} tier B; applied, ${result?.written ?? 0} exercises now play a video`;
}

export function startExerciseVideoApplyOnce(): void {
  void runWithJobLock(JOB, async () => {
    try {
      const outcome = await applyReviewedExerciseVideosOnce();
      console.log(`[job:${JOB}] ${outcome}`);
    } catch (err) {
      reportJobFailure(JOB, err);
    }
  });
}
