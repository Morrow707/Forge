/**
 * THE FIRST SKILL-DRILL VIDEO DRY RUN, RUN ONCE AT BOOT (Scott, 2026-11-19: "run another dry run
 * for the skill drills").
 *
 * The same saved dry run the admin page's "Dry run skill drills" button makes, with the search
 * fill on, so it appears on that page as the newest run to review and approve. It writes nothing
 * to the library: Apply stays a person's button. The matches are also printed to the log so they
 * can be read without the page. Marked in applied_backfills only after the run is saved.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";
import { saveDryRun } from "./exercise-video-backfill";
import { youTubeConfigured } from "./youtube-catalog";
import { runWithJobLock } from "./job-lock";
import { reportJobFailure } from "./job-errors";

export const SKILL_VIDEO_DRY_RUN_MARKER = "skill_video_dry_run_2026_11_19";
const JOB = "skill-video-dry-run-once";

function readRows<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
}

export async function skillVideoDryRunOnce(log: (line: string) => void): Promise<void> {
  const done = readRows<{ n: number }>(
    await db.execute(sql`SELECT count(*)::int AS n FROM applied_backfills WHERE key = ${SKILL_VIDEO_DRY_RUN_MARKER}`),
  );
  if (Number(done[0]?.n ?? 0) > 0) return log("already run; nothing to do");
  if (!youTubeConfigured()) return log("YOUTUBE_API_KEY is not set; nothing run, will try next boot");

  const run = await saveDryRun({ kind: "skill", searchUnmatched: true });
  await db.execute(sql`INSERT INTO applied_backfills (key) VALUES (${SKILL_VIDEO_DRY_RUN_MARKER}) ON CONFLICT DO NOTHING`);
  const tally = run.byKind.skill;
  const tierA = run.proposals.filter((p) => p.match.tier === "A").length;
  log(`run ${run.runId}: skill drills ${tally.matched} of ${tally.considered}; tier A ${tierA}, tier B ${run.proposals.length - tierA}`);
  run.proposals.forEach((p) =>
    log(`MATCH ${p.match.tier} | ${p.name} -> ${p.match.title} | ${p.match.channel} | ${p.match.durationSeconds}s | ${p.url}`),
  );
  const reasons = run.unmatched.reduce<Record<string, number>>((acc, u) => {
    const key = u.rejection?.reason ?? "no candidate";
    return { ...acc, [key]: (acc[key] ?? 0) + 1 };
  }, {});
  log(`unmatched ${run.unmatched.length}: ${JSON.stringify(reasons)}`);
}

export function startSkillVideoDryRunOnce(): void {
  void runWithJobLock(JOB, async () => {
    try {
      await skillVideoDryRunOnce((line) => console.log(`[job:${JOB}] ${line}`));
    } catch (err) {
      reportJobFailure(JOB, err);
    }
  });
}
