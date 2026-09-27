/**
 * PUTTING A REAL VIDEO ON EVERY EXERCISE AND SKILL DRILL.
 *
 * Every seeded videoUrl in this library is a youtube.com/results SEARCH LINK -- it does not name
 * a video, it names a query, so nothing can be embedded and tapping it left Forge for the YouTube
 * app. This backfill replaces those, and ONLY those, with a video id the in-app player can load
 * (client/src/components/exercise-video-player.tsx).
 *
 * THE SHAPE, AND WHY IT IS THIS SHAPE:
 *
 * 1. Pull each channel's whole catalogue once (server/youtube-catalog.ts, ~1 quota unit per 50
 *    videos). Never search per exercise: that is 100 units a call and would cost four days of
 *    free quota for one run.
 * 2. Match locally and for free (shared/exercise-video-match.ts). Shortest video wins, because
 *    Scott's rule is "we need shorts, where it gets straight to the how to, not 18 minute videos
 *    of someone talking."
 * 3. Report before writing. A dry run returns every proposed match with its channel, title and
 *    length, plus a PER-CHANNEL summary -- match count and median duration -- so a talky channel
 *    can be dropped on evidence rather than on my impression of it. That summary is the whole
 *    reason the dry run exists as a separate call.
 * 4. Apply writes only where the existing URL is still a placeholder, re-checked at write time.
 *
 * `db` IS IMPORTED LAZILY, INSIDE THE TWO QUERY FUNCTIONS. ./db throws at module load without
 * DATABASE_URL, and `npm test` runs with no database on purpose -- a top-level import here would
 * make the whole no-database suite unrunnable to read a channel list. Same fix as uploaded-files.ts.
 *
 * A COACH'S URL IS NEVER TOUCHED. isSeededSearchPlaceholder is the gate, and it is deliberately
 * narrow: youtube.com/results and nothing else. A URL somebody chose is their work, and a
 * backfill that overwrote it would be indistinguishable from data loss.
 *
 * AN EXERCISE WITH NO MATCH KEEPS ITS SEARCH LINK. That is the honest outcome -- the pill still
 * says "Find a demo" and still works. Writing a loosely-matched video would show an athlete the
 * wrong lift with the confidence of a chosen one, which is worse than a search box.
 */
import { eq, isNull, or, sql } from "drizzle-orm";
import { exercises, skillExercises } from "@shared/schema";
import {
  assignVideosToExercises,
  isSeededSearchPlaceholder,
  type VideoCandidate,
  type VideoMatch,
} from "@shared/exercise-video-match";
import { channelCatalogue, newQuotaLedger, type QuotaLedger } from "./youtube-catalog";

/**
 * The channels, chosen for SHORT demonstration clips.
 *
 * Squat University was removed on Scott's instruction -- "if squat university is talky with less
 * shorts of how to's then remove it, not what we need" -- which is also the standing test for
 * anything added here. The dry run's per-channel median duration is the evidence: a channel
 * whose matches run long is not doing the job and comes out of this list.
 */
export const DEMO_VIDEO_CHANNELS = [
  "westsidebarbell",
  "athleanx",
  "CatalystAthletics",
  "buffdudes",
  "ScottHermanFitness",
  "musclestrengthcom",
  "Onnit",
  "DrivelineBaseball",
  "BaseballRebellion",
];

/**
 * The length cap. Three minutes: long enough for a setup-plus-two-reps demonstration of a
 * compound lift, short enough that nothing in the result is a lecture. Scott has the number and
 * can change it -- it is a parameter on every entry point here, not a constant baked into the
 * matcher.
 */
export const DEFAULT_MAX_DURATION_SECONDS = 180;

export type BackfillTarget = { kind: "exercise" | "skill"; id: number; name: string };

export type BackfillProposal = BackfillTarget & { match: VideoMatch; url: string };

export type ChannelSummary = {
  channel: string;
  catalogueSize: number;
  /** How many exercises this channel ended up supplying the WINNING video for. */
  matchesWon: number;
  medianWinningDurationSeconds: number | null;
};

/** Counted separately because the two have different ceilings.
 *
 * Scott, 2026-09-27, on the sport drills going unmatched: "thats fine, the skills are so niche."
 * He is right, and that makes one combined number actively misleading -- a lacrosse face-off
 * counter-move and a back squat are not the same kind of miss. No strength channel has the
 * former and none reasonably would, so counting them together buries how well the LIFT library
 * is actually covered, which is the only figure any decision here rests on. */
export type KindTally = { considered: number; matched: number };

export type BackfillReport = {
  targetsConsidered: number;
  byKind: { exercise: KindTally; skill: KindTally };
  proposals: BackfillProposal[];
  unmatched: BackfillTarget[];
  channels: ChannelSummary[];
  quota: QuotaLedger;
  maxDurationSeconds: number;
  /** Set only by apply(); a dry run leaves it undefined so the two are never confused. */
  written?: number;
};

/** Everything still carrying a placeholder URL (or none at all), both libraries. */
export async function targetsNeedingVideo(): Promise<BackfillTarget[]> {
  const { db } = await import("./db");
  const placeholder = (col: any) => or(isNull(col), sql`${col} like '%youtube.com/results%'`);
  const [ex, sk] = await Promise.all([
    db
      .select({ id: exercises.id, name: exercises.name, videoUrl: exercises.videoUrl })
      .from(exercises)
      .where(placeholder(exercises.videoUrl)),
    db
      .select({ id: skillExercises.id, name: skillExercises.name, videoUrl: skillExercises.videoUrl })
      .from(skillExercises)
      .where(placeholder(skillExercises.videoUrl)),
  ]);
  // The SQL narrows; isSeededSearchPlaceholder decides. One rule, and it is the shared one the
  // write path re-checks -- a LIKE that drifted from it would be a way to overwrite a real URL.
  return [
    ...ex.filter((r) => isSeededSearchPlaceholder(r.videoUrl)).map((r) => ({ kind: "exercise" as const, id: r.id, name: r.name })),
    ...sk.filter((r) => isSeededSearchPlaceholder(r.videoUrl)).map((r) => ({ kind: "skill" as const, id: r.id, name: r.name })),
  ];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function watchUrlFor(videoId: string): string {
  // The canonical watch URL, not an /embed/ one. extractYouTubeId reads both, and a watch URL is
  // what a human pasting this into a browser expects to find.
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Pull the channels, match every target, and report. Writes NOTHING.
 *
 * A channel that fails to resolve is reported as an empty catalogue rather than aborting the run:
 * a renamed handle should cost that channel's videos, not the whole backfill.
 */
export async function planExerciseVideoBackfill(options?: {
  channels?: string[];
  maxDurationSeconds?: number;
  maxVideosPerChannel?: number;
}): Promise<BackfillReport> {
  const channels = options?.channels ?? DEMO_VIDEO_CHANNELS;
  const maxDurationSeconds = options?.maxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS;
  const quota = newQuotaLedger();

  const pool: VideoCandidate[] = [];
  const catalogueSizes = new Map<string, number>();
  for (const handle of channels) {
    let result: Awaited<ReturnType<typeof channelCatalogue>> = null;
    try {
      result = await channelCatalogue(handle, quota, options?.maxVideosPerChannel);
    } catch (err) {
      // Quota exhaustion and a dead handle look the same from here; both mean this channel
      // contributes nothing and the run continues with what it has.
      result = null;
    }
    if (!result) {
      catalogueSizes.set(handle, 0);
      continue;
    }
    catalogueSizes.set(result.channel, result.videos.length);
    pool.push(...result.videos);
  }

  const targets = await targetsNeedingVideo();

  /* ASSIGNED ACROSS THE WHOLE LIBRARY AT ONCE, not one exercise at a time.
   *
   * Matching per exercise gave BARBELL CURL the "Barbell Wrist Curl" video, because nothing in a
   * single pair is wrong -- the wrongness is that Forge also has a Barbell Wrist Curl and the
   * video is obviously its. Only a view of every name at once can see that, so the whole target
   * list goes in together. See assignVideosToExercises. */
  const chosen = assignVideosToExercises(
    targets.map((t) => t.name),
    pool,
    maxDurationSeconds,
  );

  const proposals: BackfillProposal[] = [];
  const unmatched: BackfillTarget[] = [];
  for (const target of targets) {
    const match = chosen.get(target.name);
    if (!match) unmatched.push(target);
    else proposals.push({ ...target, match, url: watchUrlFor(match.videoId) });
  }

  const summaries: ChannelSummary[] = [...catalogueSizes.entries()].map(([channel, catalogueSize]) => {
    const won = proposals.filter((p) => p.match.channel === channel);
    return {
      channel,
      catalogueSize,
      matchesWon: won.length,
      medianWinningDurationSeconds: median(won.map((p) => p.match.durationSeconds)),
    };
  });

  const tally = (kind: BackfillTarget["kind"]): KindTally => ({
    considered: targets.filter((t) => t.kind === kind).length,
    matched: proposals.filter((p) => p.kind === kind).length,
  });

  return {
    targetsConsidered: targets.length,
    byKind: { exercise: tally("exercise"), skill: tally("skill") },
    proposals,
    unmatched,
    channels: summaries,
    quota,
    maxDurationSeconds,
  };
}

/**
 * Run the plan and write it.
 *
 * The placeholder check runs AGAIN here, per row, inside the write. The plan may have been
 * produced minutes ago and an admin may have set a real URL in between; re-reading is one cheap
 * query against the possibility of overwriting somebody's choice.
 */
export async function applyExerciseVideoBackfill(options?: {
  channels?: string[];
  maxDurationSeconds?: number;
  maxVideosPerChannel?: number;
}): Promise<BackfillReport> {
  const { db } = await import("./db");
  const report = await planExerciseVideoBackfill(options);
  let written = 0;
  for (const proposal of report.proposals) {
    const table = proposal.kind === "exercise" ? exercises : skillExercises;
    const [current] = await db
      .select({ videoUrl: table.videoUrl })
      .from(table)
      .where(eq(table.id, proposal.id));
    if (!current || !isSeededSearchPlaceholder(current.videoUrl)) continue;
    await db.update(table).set({ videoUrl: proposal.url }).where(eq(table.id, proposal.id));
    written += 1;
  }
  return { ...report, written };
}
