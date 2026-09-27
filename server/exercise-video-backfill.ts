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
  type NearMiss,
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
  "CatalystAthletics",
  "ScottHermanFitness",
  "athleanx",
  "musclestrengthcom",
  "buffdudes",
  // Added 2026-09-27 to replace three that were cut (below). All three are picked for the same
  // property that makes Catalyst Athletics supply 94 matches on its own: a SYSTEMATIC library
  // where the title is the exercise name and little else. That is exactly what the precision
  // floor rewards, and it is a better predictor of yield than how good the coaching is.
  "jeffnippard",
  "RenaissancePeriodization",
  "bodybuildingcom",
  "BaseballRebellion",
];

/**
 * CUT, AND WHY -- so nobody re-adds them on the strength of the brand.
 *
 * - `westsidebarbell`: catalogue 0 on two consecutive runs. NOT a length or content problem;
 *   the channel never loaded at all, so not one of its videos was ever measured against the cap.
 *   The handle does not resolve and the search fallback did not find it either. Scott asked for
 *   Westside by name, so this is a lookup failure to fix rather than a verdict on the channel --
 *   re-add it as a UC... channel ID (resolveChannel takes one directly) and it will work.
 * - `onnit`: resolved to an unrelated channel with 5 videos. Same fix: a channel ID, not a guess.
 * - `DrivelineBaseball`: 1,721 videos loaded and ONE matched. This is the real content verdict --
 *   podcasts and interviews rather than demonstrations. The same test Squat University failed.
 */
export const CHANNELS_CUT_ON_EVIDENCE = ["westsidebarbell", "onnit", "DrivelineBaseball"];

/**
 * The length cap. Three minutes: long enough for a setup-plus-two-reps demonstration of a
 * compound lift, short enough that nothing in the result is a lecture. Scott has the number and
 * can change it -- it is a parameter on every entry point here, not a constant baked into the
 * matcher.
 */
export const DEFAULT_MAX_DURATION_SECONDS = 180;

export type BackfillTarget = { kind: "exercise" | "skill"; id: number; name: string };

/** An unmatched target carries the reason it is unmatched -- see NearMiss. */
export type UnmatchedTarget = BackfillTarget & { nearMiss?: NearMiss };

export type BackfillProposal = BackfillTarget & { match: VideoMatch; url: string };

export type ChannelSummary = {
  channel: string;
  catalogueSize: number;
  /** Why a channel contributed nothing, when it did.
   *
   * A bare 0 cost two runs and a wrong theory: westsidebarbell read as "their videos are too
   * long", when in fact not one of its videos was ever fetched, so the length cap never saw
   * them. Those are opposite problems with opposite fixes -- a channel ID versus a different
   * channel -- and the report could not tell them apart. CLAUDE.md's rule about guards that
   * cannot be shown to have fired applies just as well to a channel that cannot be shown to
   * have loaded. */
  status: "ok" | "handle_not_found" | "error";
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
  unmatched: UnmatchedTarget[];
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
  const statuses = new Map<string, ChannelSummary["status"]>();
  for (const handle of channels) {
    let result: Awaited<ReturnType<typeof channelCatalogue>> = null;
    let status: ChannelSummary["status"] = "ok";
    try {
      result = await channelCatalogue(handle, quota, options?.maxVideosPerChannel);
      if (!result) status = "handle_not_found";
    } catch {
      // An API error -- most often quota -- is reported as itself rather than as a dead handle.
      // The run continues with what it has; one bad channel is not worth losing the rest.
      status = "error";
      result = null;
    }
    if (!result) {
      catalogueSizes.set(handle, 0);
      statuses.set(handle, status);
      continue;
    }
    catalogueSizes.set(result.channel, result.videos.length);
    statuses.set(result.channel, "ok");
    pool.push(...result.videos);
  }

  const targets = await targetsNeedingVideo();

  /* ASSIGNED ACROSS THE WHOLE LIBRARY AT ONCE, not one exercise at a time.
   *
   * Matching per exercise gave BARBELL CURL the "Barbell Wrist Curl" video, because nothing in a
   * single pair is wrong -- the wrongness is that Forge also has a Barbell Wrist Curl and the
   * video is obviously its. Only a view of every name at once can see that, so the whole target
   * list goes in together. See assignVideosToExercises. */
  const { chosen, nearMisses } = assignVideosToExercises(
    targets.map((t) => t.name),
    pool,
    maxDurationSeconds,
  );

  const proposals: BackfillProposal[] = [];
  const unmatched: UnmatchedTarget[] = [];
  for (const target of targets) {
    const match = chosen.get(target.name);
    if (!match) unmatched.push({ ...target, nearMiss: nearMisses.get(target.name) });
    else proposals.push({ ...target, match, url: watchUrlFor(match.videoId) });
  }

  const summaries: ChannelSummary[] = [...catalogueSizes.entries()].map(([channel, catalogueSize]) => {
    const won = proposals.filter((p) => p.match.channel === channel);
    return {
      channel,
      catalogueSize,
      status: statuses.get(channel) ?? "ok",
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
