/**
 * THE EXLIB VIDEOS GO ONTO THE FORGE LIBRARY, ONCE (2026-11-23).
 *
 * Scott handed over an outside exercise library (a spreadsheet of 1,471 strength and conditioning
 * exercises, each with a YouTube demo) and said: "if we have it great works done, copy the video
 * over". Every row was matched by name, with the sheet's own abbreviations spelled out (BB barbell,
 * DB dumbbell, SL single leg, RFESS Bulgarian split squat ...); the matches are the data in
 * server/seed-data/exlib-2026-11-23.ts. This writes each one onto the Forge row it matched.
 *
 * WHAT IT MAY REPLACE, AND WHAT IT MAY NOT:
 * - a seeded search placeholder (youtube.com/results) -- nothing was chosen there;
 * - a video the channel backfill wrote (exercise-video-backfill.ts): that was a machine's pick from
 *   a channel catalogue, and the sheet's video is the one Scott asked for. Recognised exactly: the
 *   row's current URL equals the URL an APPLIED run wrote onto that same row id.
 * Anything else is a URL somebody set by hand on the exercise, and it is left alone and counted.
 *
 * Scoped to the library owner's rows, by exact name, never a hidden one. Once, behind an
 * applied_backfills marker, so an admin who changes a video afterwards is never overruled by the
 * next deploy. A fresh database runs it once too, after the creation loops, so it ends up the same.
 *
 * `db` is imported inside the two functions that query, never at the top: ./db throws at load with
 * no DATABASE_URL, and `npm test` runs with no database (the same fix as exercise-video-backfill.ts).
 */
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { exercises, exerciseVideoRuns, skillExercises } from "@shared/schema";
import { isSeededSearchPlaceholder } from "@shared/exercise-video-match";
import { EXLIB_VIDEOS_FOR_EXISTING, type ExLibVideoForExisting } from "./seed-data/exlib-2026-11-23";

export const EXLIB_VIDEOS_MARKER = "exlib_videos_2026_11_23";
export const DEMO_VIDEOS_MARKER = "demo_videos_2026_11_23";

export type ExLibVideoResult = { written: number; keptHandChosen: string[]; notFound: string[] };

type AppliedProposal = { id: number; kind: "exercise" | "skill"; url: string };

/** Every URL a channel-backfill run actually applied, keyed by table and row id. */
async function backfillWrittenUrls(): Promise<Set<string>> {
  const { db } = await import("./db");
  const runs = await db.select({ report: exerciseVideoRuns.report }).from(exerciseVideoRuns).where(isNotNull(exerciseVideoRuns.appliedAt));
  return new Set(
    runs
      .flatMap((run) => ((run.report as { proposals?: AppliedProposal[] })?.proposals ?? []) as AppliedProposal[])
      .filter((p) => p && p.url)
      .map((p) => `${p.kind}:${p.id}:${p.url}`),
  );
}

/** Whether the URL on this row may be replaced by the sheet's video. Pure, so it is testable. */
export function mayReplaceVideo(current: string | null | undefined, rowKey: string, backfillWritten: ReadonlySet<string>): boolean {
  if (isSeededSearchPlaceholder(current)) return true;
  return backfillWritten.has(`${rowKey}:${current}`);
}

export async function applyExLibVideosOnce(
  libraryOwnerId: number,
  mappings: readonly ExLibVideoForExisting[] = EXLIB_VIDEOS_FOR_EXISTING,
): Promise<ExLibVideoResult | null> {
  return applyVideoMappingsOnce(EXLIB_VIDEOS_MARKER, libraryOwnerId, mappings);
}

/** The same narrow write for any once-only list of videos, behind its own marker.
 *  `placeholdersOnly` leaves a channel-backfill video alone too (a list that only fills gaps). */
export async function applyVideoMappingsOnce(
  marker: string,
  libraryOwnerId: number,
  mappings: readonly ExLibVideoForExisting[],
  placeholdersOnly = false,
): Promise<ExLibVideoResult | null> {
  const { db } = await import("./db");
  const done = await db.execute(sql`SELECT 1 FROM applied_backfills WHERE key = ${marker}`);
  if (done.rows.length > 0) return null;
  const written = placeholdersOnly ? new Set<string>() : await backfillWrittenUrls();
  const result: ExLibVideoResult = { written: 0, keptHandChosen: [], notFound: [] };

  // One row at a time, in order, so the counts are exact and no two writes race.
  await mappings.reduce(async (prev, m) => {
    await prev;
    const table = m.kind === "exercise" ? exercises : skillExercises;
    const [row] = await db
      .select({ id: table.id, videoUrl: table.videoUrl })
      .from(table)
      .where(and(eq(table.coachId, libraryOwnerId), eq(table.name, m.name), isNull(table.retiredAt)))
      .limit(1);
    if (!row) {
      result.notFound.push(m.name);
      return;
    }
    if (row.videoUrl === m.url) return;
    if (!mayReplaceVideo(row.videoUrl, `${m.kind}:${row.id}`, written)) {
      result.keptHandChosen.push(m.name);
      return;
    }
    await db.update(table).set({ videoUrl: m.url }).where(eq(table.id, row.id));
    result.written += 1;
  }, Promise.resolve());
  await db.execute(sql`INSERT INTO applied_backfills (key) VALUES (${marker}) ON CONFLICT DO NOTHING`);
  return result;
}
