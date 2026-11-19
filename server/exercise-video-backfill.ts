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
import { exercises, exerciseVideoRuns, skillExercises } from "@shared/schema";
import { skillSearchQuery, skillTitleVerdict } from "@shared/skill-video-match";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { isSeededSearchPlaceholder, type VideoCandidate } from "@shared/exercise-video-match";
import type { LibraryExercise } from "@shared/exercise-vocabulary";
import type { Tier } from "@shared/exercise-signature-match";
import {
  runSignatureMatch,
  searchForUnmatched,
  type SignatureRejection,
} from "./exercise-video-match-run";
import {
  searchVideosFor, channelCatalogue, decodeYouTubeText, newQuotaLedger, type QuotaLedger } from "./youtube-catalog";

/**
 * The channels, chosen for SHORT demonstration clips.
 *
 * Squat University was removed on Scott's instruction -- "if squat university is talky with less
 * shorts of how to's then remove it, not what we need" -- which is also the standing test for
 * anything added here. The dry run's per-channel median duration is the evidence: a channel
 * whose matches run long is not doing the job and comes out of this list.
 */
export const DEMO_VIDEO_CHANNELS = [
  // The four that earn their place on the 2026-09-28 dry run (matches won / median length):
  // Catalyst 81 / 0:53, Renaissance Periodization 45 / 0:12, Bodybuilding.com 16 / 0:57,
  // ScottHermanFitness 15 / 1:52.
  "CatalystAthletics",
  "RenaissancePeriodization",
  "bodybuildingcom",
  "ScottHermanFitness",
  // Added 2026-09-28 on Scott's call to swap the zero-win channels for others. Each is picked
  // for the property the winners share: a systematic library where the title IS the exercise
  // name. None could be verified from the sandbox (YouTube is unreachable there), so the dry
  // run's catalogue column is the check: a catalogue of 0 is a handle to fix, not a verdict.
  // Second run the same day (matches won / median): Functional Bodybuilding 53 / 0:16 -- the
  // best channel after Catalyst on its first outing -- [P]rehab 6 / 0:26, Kettlebell Kings
  // 6 / 0:14. Kept. All three are still Tier B until the review queue earns them auto-apply
  // (AUTO_APPLY_CHANNELS in shared/exercise-signature-match.ts says what that takes).
  "ThePrehabGuys", // mobility and rehab: the CARs, stretches and holds nothing else carries
  "FunctionalBodybuilding", // Marcus Filly: dumbbell / kettlebell / tempo demos, name-titled
  "kettlebellkings", // kettlebell library, name-titled
  // Added 2026-11-17 for the lifts no channel above films. The "Different equipment" misses on
  // the 11-17 dry run were sled, sandbag, tire, yoke-style carries, assault bike and Ski Erg.
  // Rogue's "Movement Demo" series covers the strongman implements (sandbag, stone, sled, log)
  // and CrossFit's "The <movement>" demos cover the conditioning work (sled, rower, bike,
  // battle rope, wall ball). Neither title prefix is a word the library knows, so it is learned
  // as that channel's boilerplate like every other house style. Both start as Tier B. Unverified
  // from the sandbox: the next dry run's catalogue column is the check, and a channel that wins
  // nothing or runs long goes into CHANNELS_CUT_ON_EVIDENCE like the rest.
  // First run, 2026-11-17 (catalogue / matches won / median): Rogue 3,493 / 3 / 0:47, CrossFit
  // 7,955 / 3 / 0:35. Small, but each win is a lift nothing else in the pool had (Board Press,
  // Reverse-Grip Bench, Zercher Carry, Kettlebell Snatch), so both stay for now. Rogue's third
  // win, Jump Rope -> "Rogue Jump Ropes", is a product video and is the reject the review queue
  // exists for.
  "roguefitness", // strongman: sandbag, stone, sled, log, carries
  "CrossFit", // conditioning: sled, rower, assault bike, battle rope, wall ball
  // Added 2026-11-17 for the sandbag lifts (Sandbag Carry, Sandbag Clean, Sandbag Get-Up): Rogue's
  // sandbag videos were competition streams. Josh Henkin's Ultimate Sandbag Training channel has
  // 400+ free videos (Breaking Muscle, 2021); "SandbagFitness" is its older name, and the
  // resolver's search fallback is what finds it if the handle has changed. Unverified from the
  // sandbox: a catalogue of 0 on the next dry run means it needs its UC... channel ID instead.
  // 2026-11-17 dry run: "SandbagFitness" resolved to a 9-video channel, the old one, so it is
  // found by its current name instead.
  "search:Ultimate Sandbag Training", // sandbag: cleans, carries, get-ups, lunges
  // Added 2026-11-17 for the bench variations nothing else films (Paused Bench, Pin Press, Larsen
  // Press, Spoto Press, Swiss Bar Bench). EliteFTS is a powerlifting site with a filmed exercise
  // index. It was cut on 2026-09-28 for a LOOKUP failure, never a content verdict: the handle
  // "elitefts" resolved to somebody else's 8-video channel. "search:" finds it by name instead.
  "search:EliteFTS", // powerlifting: pin, board, Larsen and Spoto presses, specialty bars
  // Added 2026-11-17 for the stretches, the first channel added FOR its chapters (see
  // parseChapters): Tom Merrick posts follow-along mobility routines, never one stretch per
  // video, so every match it can make is a chapter -- Tier B, played from its own timestamp.
  // Found by name ("search:") because his handle has changed over the years. Unverified from the
  // sandbox; the dry run's chapters column says whether his descriptions carry chapters at all.
  "search:Tom Merrick", // mobility: hips, hamstrings, shoulders, spine, as chaptered routines
  // Added 2026-11-17, the second chaptered mobility channel, so the stretches do not rest on one
  // uploader's habits: Tom Morrison (the Simplistic Mobility Method, tommorrison.uk) posts
  // mobility routines and drills. Same terms as Tom Merrick: found by name, every win a Tier B
  // chapter, and the chapters column on the next dry run says whether he labels them.
  "search:Tom Morrison", // mobility: hip, shoulder and spine drills, as chaptered routines
  // Added 2026-11-17, the third chaptered mobility channel: several missing stretches are yoga
  // poses by another name (Lizard, Pigeon, Child's Pose, Thread the Needle, Downward Dog), and
  // Yoga With Adriene's longer classes are routines. "pose" folds to "stretch" in ALIASES so
  // "Lizard Pose" reaches Lizard Stretch. Same terms: found by name, every win a Tier B chapter.
  "search:Yoga With Adriene", // yoga poses that are the library's stretches, as chaptered classes
  // Added 2026-11-17, the fourth chaptered mobility channel: GMB Fitness (Gold Medal Bodies)
  // posts mobility and flexibility routines and tutorials -- hips, shoulders, wrists, the wrist
  // flexor and extensor stretches nothing else in the pool has. Same terms: found by name,
  // every win a Tier B chapter, the chapters column on the next dry run is the check.
  "search:GMB Fitness", // mobility: wrists, hips, shoulders, as chaptered routines
];

/**
 * WHICH CHANNELS' CHAPTERS ARE READ. Not all of them, on the first chaptered dry run's evidence
 * (2026-11-17): Renaissance Periodization's chapters won five lifts and every one was a slice of a
 * critique or gym vlog -- "The Worst Shoulder Exercises People Still Do" for Barbell Shoulder
 * Press, "Exercise Scientist Critiques Eddie Hall" for Med Ball Slam, "Training At The CRAZIEST
 * GYM" for Machine Row and Assisted Pull-Up. A chapter there is a lift being TALKED ABOUT, often
 * as a bad example. Bodybuilding.com's were workout vlogs. The channels below post routines,
 * technique breakdowns and rehab sequences, where a chapter is the movement demonstrated:
 * elitefts' won Paused Bench, Spoto Press and Pin Squat, [P]rehab's the wrist extensor stretch.
 * Every other channel's chapters are dropped before matching. A handle, exactly as listed above.
 */
export const CHAPTER_CHANNELS: ReadonlySet<string> = new Set([
  "ThePrehabGuys",
  "search:EliteFTS",
  "search:Tom Merrick",
  "search:Tom Morrison",
  "search:Yoga With Adriene",
  "search:GMB Fitness",
]);

/**
 * CUT, AND WHY -- so nobody re-adds them on the strength of the brand.
 *
 * - `GarageStrength` (2026-09-28, second run): 4,000 videos loaded, ONE match at 0:37. Content
 *   verdict -- athlete features and long-form coaching, not a demo library.
 * - `elitefts` (re-added 2026-11-17 as "search:EliteFTS", see above) and `TNationTV` (same run): catalogues of 8 and 13. Those are not the channels;
 *   the handles resolved to something else and the search fallback did not correct them. Like
 *   Westside below: a lookup failure, fixable with a UC... channel ID, not a verdict.
 * - `athleanx`, `jeffnippard`, `musclestrengthcom`, `BaseballRebellion` (2026-09-28): full
 *   catalogues loaded (1,720 / 626 / 1,488 / 1,018 videos) and between them won ZERO matches on
 *   the first dry run after the matcher fix. That is the content verdict: commentary and long
 *   form rather than demonstrations. Scott: "get rid of those channels and try other ones."
 * - `buffdudes` (same day): 5 wins at a 2:11 median. The Squat University test.
 * - `westsidebarbell`: catalogue 0 on two consecutive runs. NOT a length or content problem;
 *   the channel never loaded at all, so not one of its videos was ever measured against the cap.
 *   The handle does not resolve and the search fallback did not find it either. Scott asked for
 *   Westside by name, so this is a lookup failure to fix rather than a verdict on the channel --
 *   re-add it as a UC... channel ID (resolveChannel takes one directly) and it will work.
 * - `onnit`: resolved to an unrelated channel with 5 videos. Same fix: a channel ID, not a guess.
 * - `DrivelineBaseball`: 1,721 videos loaded and ONE matched. This is the real content verdict --
 *   podcasts and interviews rather than demonstrations. The same test Squat University failed.
 */
export const CHANNELS_CUT_ON_EVIDENCE = [
  // 2026-11-17: 614 videos, 0 wins, 0 chapters -- race footage and athlete features, the same
  // content verdict as Rogue's streams, without Rogue's three demos to keep it.
  "HYROX",
  "GarageStrength",
  "TNationTV",
  "athleanx",
  "jeffnippard",
  "musclestrengthcom",
  "BaseballRebellion",
  "buffdudes",
  "westsidebarbell",
  "onnit",
  "DrivelineBaseball",
];

/**
 * The length cap. Three minutes: long enough for a setup-plus-two-reps demonstration of a
 * compound lift, short enough that nothing in the result is a lecture. Scott has the number and
 * can change it -- it is a parameter on every entry point here, not a constant baked into the
 * matcher.
 */
/** One search is 100 units of a 10,000/day allowance, so a full pass over ~174 unmatched lifts
 *  is about two days. 90 keeps a single run inside one day with room for the channel pass. */
export const DEFAULT_MAX_SEARCHES = 90;

export const DEFAULT_MAX_DURATION_SECONDS = 180;

export type BackfillTarget = { kind: "exercise" | "skill"; id: number; name: string };

/** An unmatched target carries the reason it is unmatched -- see NearMiss. */
export type UnmatchedTarget = BackfillTarget & { rejection?: SignatureRejection };

export type BackfillProposal = BackfillTarget & {
  url: string;
  match: {
    videoId: string;
    title: string;
    channel: string;
    durationSeconds: number;
    tier: Tier;
    corroboration: "single" | "multi";
    /** A chapter of a longer video: it plays from start to end, and videoTitle is the whole
     *  video's title for the reviewer. */
    startSeconds?: number;
    endSeconds?: number;
    videoTitle?: string;
  };
};

export type ChannelSummary = {
  channel: string;
  catalogueSize: number;
  /** The read stopped at the ceiling with more videos behind it: catalogueSize is a floor, and
   *  the channel's oldest uploads -- where an exercise library usually lives -- were not seen. */
  truncated: boolean;
  /** Why a channel contributed nothing, when it did.
   *
   * A bare 0 cost two runs and a wrong theory: westsidebarbell read as "their videos are too
   * long", when in fact not one of its videos was ever fetched, so the length cap never saw
   * them. Those are opposite problems with opposite fixes -- a channel ID versus a different
   * channel -- and the report could not tell them apart. CLAUDE.md's rule about guards that
   * cannot be shown to have fired applies just as well to a channel that cannot be shown to
   * have loaded. */
  status: "ok" | "handle_not_found" | "error";
  /** YouTube's own reason when status is "error" (e.g. "403 (quotaExceeded)", "500"), so a
   *  one-off failure and a spent quota are not the same two words on the report. */
  errorDetail?: string;
  /** How many chapters (see parseChapters) the channel's descriptions yielded. 0 on a routine
   *  channel means its descriptions carry no chapters and it can never win a stretch. */
  chaptersRead?: number;
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
  /** Tier A is applied without a person; tier B waits for one. See exercise-signature-match. */
  tierCounts: { A: number; B: number };
  /** Present only when the search pass ran. */
  searchFill?: {
    searched: number;
    filled: number;
    stillEmpty: number;
    /** Not searched because the run hit its cap -- run again to continue. */
    remaining: number;
  };
  /** Unrecognised words that cost a match, most frequent first -- what the vocabulary is
   *  missing, in the order worth fixing. */
  unknownWords: Array<{ word: string; count: number; examples: string[] }>;
  /** Two library names that parse identically. A library problem, not a matching one. */
  duplicateSignatures: Array<[string, string]>;
  /** What each channel's house style turned out to be, learned rather than listed. */
  boilerplateByChannel: Record<string, string[]>;
  /** Set only by apply(); a dry run leaves it undefined so the two are never confused. */
  written?: number;
  /** YouTube reads answered from the day's cache instead of the API -- see readYouTubeCache. */
  cacheHits?: number;
};

/** A saved dry run: the report, which run it is, and the admin's decisions so far. */
export type SavedRun = BackfillReport & {
  runId: number;
  createdAt: string;
  appliedAt: string | null;
  decisions: Record<string, Decision>;
};
export type Decision = "approve" | "reject";
export const proposalKey = (p: { kind: string; id: number }) => `${p.kind}:${p.id}`;

/**
 * WHAT APPLY WRITES, AS ONE RULE. Tier A unless a person rejected it; tier B only when a person
 * approved it. Tier B is a match nothing is wrong with that nobody has confirmed -- writing it
 * without a person is the old behaviour wearing a new name -- and a tier-A match a person has
 * looked at and turned down (the 2026-11-10 run's Dual Kettlebell Snatch) is not written either.
 */
export function shouldWrite(tier: Tier, decision: Decision | undefined): boolean {
  if (decision === "reject") return false;
  if (tier === "A") return true;
  return decision === "approve";
}

/**
 * THE WHOLE LIFT LIBRARY, with the metadata the grammar needs.
 *
 * Every exercise, not only those still needing a video: "Barbell Wrist Curl" may already have
 * one and it still has to exist as the reason Barbell Curl cannot take a wrist curl title. The
 * grammar is a property of the library, never of the backlog.
 */
export async function libraryForMatching(): Promise<LibraryExercise[]> {
  const { db } = await import("./db");
  const rows = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      equipment: exercises.equipment,
      muscleGroup: exercises.muscleGroup,
      secondaryMuscles: exercises.secondaryMuscles,
      movementType: exercises.movementType,
    })
    .from(exercises);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    // NOTE: this column is NOT NULL and defaults to "Barbell", so "unspecified" and "barbell"
    // are indistinguishable here. A barbell default is therefore an assumption, not a statement,
    // which is why an equipment match that relied on one is tier B rather than auto-applied.
    equipment: r.equipment,
    muscleGroups: [r.muscleGroup, ...(r.secondaryMuscles ?? [])].filter(Boolean) as string[],
    movementPattern: r.movementType,
    kind: "exercise" as const,
  }));
}

/** The skill-drill library in the matcher's shape (2026-11-19). A drill has no muscle groups and
 *  its equipment is a list; the first item stands for it, and none reads as bodyweight. Its
 *  skill type rides as the movement pattern, which is what the search query adds for context. */
export async function skillLibraryForMatching(): Promise<LibraryExercise[]> {
  const { db } = await import("./db");
  const rows = await db
    .select({ id: skillExercises.id, name: skillExercises.name, equipment: skillExercises.equipment, skillType: skillExercises.skillType })
    .from(skillExercises);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    equipment: r.equipment?.[0] ?? "Bodyweight",
    muscleGroups: [],
    movementPattern: r.skillType,
    kind: "skill" as const,
  }));
}

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

export function watchUrlFor(videoId: string, startSeconds?: number, endSeconds?: number): string {
  // The canonical watch URL, not an /embed/ one. extractYouTubeId reads both, and a watch URL is
  // what a human pasting this into a browser expects to find. A chapter carries its window:
  // t= is YouTube's own start (a browser honours it), end= is read by Forge's player.
  const base = `https://www.youtube.com/watch?v=${videoId}`;
  if (startSeconds == null) return base;
  return `${base}&t=${startSeconds}${endSeconds != null ? `&end=${endSeconds}` : ""}`;
}

/**
 * A DAY'S CACHE OF WHAT YOUTUBE SAID, SO A SECOND RUN COSTS NOTHING (2026-11-10).
 *
 * Scott's dry run of 2026-11-10 spent 10,048 units of a 10,000-a-day allowance -- about 95
 * searches at 100 each plus the channel lists -- so a second dry run, or the Apply that used to
 * re-run the plan, could not run until the next day. A channel's catalogue is kept for a day and
 * a search's results for a week: the catalogue is what grows, a search's top results barely move.
 *
 * In the OS temp directory, not under STORAGE_PATH: everything under /uploads is served, and a
 * deploy clearing a cache is harmless -- the order searches are made in does not depend on it
 * (startOfTodaysSlice). Anything unreadable is a miss, never an error.
 */
export const CATALOGUE_CACHE_HOURS = 24;
/** YouTube's reasons for "the day's allowance is spent"; retrying those only spends calls. */
const QUOTA_GONE = /quotaExceeded|dailyLimitExceeded/;
export const SEARCH_CACHE_HOURS = 24 * 7;
const CACHE_DIR = join(tmpdir(), "forge-youtube-cache");

function cachePath(kind: string, key: string): string {
  return join(CACHE_DIR, `${kind}-${key.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 120)}.json`);
}

export function readYouTubeCache<T>(kind: string, key: string, maxAgeHours: number, now = Date.now()): T | null {
  try {
    const entry = JSON.parse(readFileSync(cachePath(kind, key), "utf8")) as { at: number; value: T };
    if (typeof entry.at !== "number" || now - entry.at > maxAgeHours * 3600_000) return null;
    return entry.value;
  } catch {
    return null;
  }
}

export function writeYouTubeCache(kind: string, key: string, value: unknown, now = Date.now()): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath(kind, key), JSON.stringify({ at: now, value }));
  } catch {
    // a cache that cannot be written costs quota next time, nothing else
  }
}

/**
 * ONE CHANNEL'S CATALOGUE: from the day's cache, else from YouTube with one retry.
 *
 * An API error is reported as itself rather than as a dead handle, and the run continues with
 * what it has. One retry first, unless the quota is gone: on 2026-11-17 Kettlebell Kings (1,475
 * videos the run before) came back "API error" between two channels that loaded, so a one-off
 * failure was costing a whole channel for the day. YouTube's reason rides on the report.
 */
export async function loadChannel(
  handle: string,
  quota: QuotaLedger,
  maxVideosPerChannel?: number,
  retryDelayMs = 2000,
): Promise<{
  result: Awaited<ReturnType<typeof channelCatalogue>>;
  status: ChannelSummary["status"];
  errorDetail?: string;
  fromCache: boolean;
}> {
  const cacheKey = `${handle}:${maxVideosPerChannel ?? "default"}`;
  const cached = readYouTubeCache<NonNullable<Awaited<ReturnType<typeof channelCatalogue>>>>(
    "catalogue", cacheKey, CATALOGUE_CACHE_HOURS);
  if (cached) {
    const videos = cached.videos.map((v) => ({
      ...v,
      title: decodeYouTubeText(v.title),
      ...(v.videoTitle ? { videoTitle: decodeYouTubeText(v.videoTitle) } : {}),
    }));
    return { result: { ...cached, videos }, status: "ok", fromCache: true };
  }

  let lastMessage = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      if (QUOTA_GONE.test(lastMessage)) break;
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
    try {
      const result = await channelCatalogue(handle, quota, maxVideosPerChannel);
      if (!result) return { result: null, status: "handle_not_found", fromCache: false };
      writeYouTubeCache("catalogue", cacheKey, result);
      return { result, status: "ok", fromCache: false };
    } catch (err) {
      lastMessage = String((err as Error)?.message ?? err);
    }
  }
  return {
    result: null,
    status: "error",
    errorDetail: lastMessage.replace(/^YouTube \S+ failed: /, ""),
    fromCache: false,
  };
}

/**
 * WHICH UNMATCHED EXERCISES TODAY'S SEARCHES START AT. A day's quota covers about 90 searches and
 * the long tail is longer, so the list is rotated by the date: each day starts one budget further
 * on. Without it every run began with the same 90 names, so the rest were only ever reached while
 * the server's temp-folder cache survived -- and a deploy empties it.
 */
export function startOfTodaysSlice<T>(names: T[], perDay: number, now = Date.now()): T[] {
  if (names.length === 0 || perDay <= 0) return names;
  const day = Math.floor(now / 86_400_000);
  const start = (day * perDay) % names.length;
  return [...names.slice(start), ...names.slice(0, start)];
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
  /** Search YouTube for the exercises the channel pass left empty. Expensive -- see the
   *  comment on searchForUnmatched: 100 units a search against 10,000 a day. */
  searchUnmatched?: boolean;
  maxSearches?: number;
  /** Which library this run matches: the lifts (the default) or the skill drills. One at a time,
   *  so a drill and a lift that share a name never compete for one video. */
  kind?: "exercise" | "skill";
}): Promise<BackfillReport> {
  const kind = options?.kind ?? "exercise";
  if (kind === "skill") return planSkillVideoBackfill(options);
  const channels = options?.channels ?? DEMO_VIDEO_CHANNELS;
  const maxDurationSeconds = options?.maxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS;
  const quota = newQuotaLedger();
  let cacheHits = 0;

  const pool: VideoCandidate[] = [];
  const catalogueSizes = new Map<string, number>();
  const truncatedChannels = new Set<string>();
  const statuses = new Map<string, ChannelSummary["status"]>();
  const errorDetails = new Map<string, string>();
  const chapterCounts = new Map<string, number>();
  for (const handle of channels) {
    const loaded = await loadChannel(handle, quota, options?.maxVideosPerChannel);
    const result = loaded.result;
    if (loaded.fromCache) cacheHits += 1;
    if (loaded.errorDetail) errorDetails.set(handle, loaded.errorDetail);
    const status = loaded.status;
    if (!result) {
      catalogueSizes.set(handle, 0);
      statuses.set(handle, status);
      continue;
    }
    // The catalogue is the channel's videos; its chapters are counted on their own.
    if (!CHAPTER_CHANNELS.has(handle)) {
      result.videos = result.videos.filter((v) => v.startSeconds == null);
    }
    catalogueSizes.set(result.channel, result.videos.filter((v) => v.startSeconds == null).length);
    chapterCounts.set(result.channel, result.videos.filter((v) => v.startSeconds != null).length);
    if (result.truncated) truncatedChannels.add(result.channel);
    statuses.set(result.channel, "ok");
    pool.push(...result.videos);
  }

  // The lifts only: the skill drills have their own path (planSkillVideoBackfill).
  const targets = (await targetsNeedingVideo()).filter((t) => t.kind === "exercise");
  const library = await libraryForMatching();
  const searchQuery = (name: string) => name;

  /* SLOT-BY-SLOT MATCHING over the whole library at once (Fable's v2 spec, 2026-09-27). The word
   * -set matcher it replaces could not tell a harmless extra title word from one that changes the
   * movement, so it either took Kettlebell Sumo Deadlifts or -- at the strict end -- threw away
   * three channels holding 3,900 videos. See shared/exercise-signature-match.ts. */
  const run = runSignatureMatch(library, pool, maxDurationSeconds);

  /* THE LONG TAIL, FILLED BY SEARCH. The channel pass leaves ~170 lifts empty and almost none
   * of them were refused for quality -- no channel in the pool has a Lizard Stretch or a Wrist
   * Flexor Stretch AT ALL, so no threshold reaches them. Scott, 2026-09-30: "find the most
   * popular or most liked videos for those random ones ... We need every exercise to have one."
   *
   * Off unless asked for, because it is the expensive path: 100 units a search against 10,000
   * a day, where the whole channel pass costs under 1,000. Every gate still applies and every
   * result is Tier B -- see searchForUnmatched. */
  const searchFill = options?.searchUnmatched
    ? await searchForUnmatched(
        library,
        startOfTodaysSlice(
          targets
            .filter((t) => !run.chosen.has(t.name))
            .map((t) => t.name),
          options.maxSearches ?? DEFAULT_MAX_SEARCHES,
        ),
        run.vocabulary,
        maxDurationSeconds,
        options.maxSearches ?? DEFAULT_MAX_SEARCHES,
        async (name) => {
          const query = searchQuery(name);
          const cached = readYouTubeCache<Awaited<ReturnType<typeof searchVideosFor>>>("search", query, SEARCH_CACHE_HOURS);
          if (cached) {
            cacheHits += 1;
            // A week-old cache can hold titles saved before they were decoded on the way in.
            return cached.map((v) => ({ ...v, title: decodeYouTubeText(v.title), channel: decodeYouTubeText(v.channel) }));
          }
          const found = await searchVideosFor(query, quota);
          writeYouTubeCache("search", query, found);
          return found;
        },
        undefined,
        (name) => readYouTubeCache("search", searchQuery(name), SEARCH_CACHE_HOURS) != null,
      )
    : null;

  const proposals: BackfillProposal[] = [];
  const unmatched: UnmatchedTarget[] = [];
  for (const target of targets) {
    const match = run.chosen.get(target.name) ?? searchFill?.filled.get(target.name);
    if (!match) {
      unmatched.push({ ...target, rejection: run.rejections.get(target.name) });
      continue;
    }
    proposals.push({ ...target, match, url: watchUrlFor(match.videoId, match.startSeconds, match.endSeconds) });
  }

  const summaries: ChannelSummary[] = [...catalogueSizes.entries()].map(([channel, catalogueSize]) => {
    const won = proposals.filter((p) => p.match.channel === channel);
    return {
      channel,
      catalogueSize,
      truncated: truncatedChannels.has(channel),
      status: statuses.get(channel) ?? "ok",
      ...(errorDetails.has(channel) ? { errorDetail: errorDetails.get(channel) } : {}),
      chaptersRead: chapterCounts.get(channel) ?? 0,
      matchesWon: won.length,
      medianWinningDurationSeconds: median(won.map((p) => p.match.durationSeconds)),
    };
  });

  const tierCounts = {
    A: proposals.filter((p) => p.match.tier === "A").length,
    B: proposals.filter((p) => p.match.tier === "B").length,
  };

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
    tierCounts,
    searchFill: searchFill
      ? {
          searched: searchFill.searched,
          filled: searchFill.filled.size,
          stillEmpty: searchFill.stillEmpty.length,
          remaining: searchFill.remaining.length,
        }
      : undefined,
    unknownWords: run.unknownWords,
    duplicateSignatures: run.duplicateSignatures,
    boilerplateByChannel: run.boilerplateByChannel,
    cacheHits,
  };
}

/**
 * THE SKILL DRILLS, BY SEARCH ALONE (2026-11-19). The lift grammar finds no movement word in a
 * drill name, so the first skill dry run skipped all 398; no strength channel films a tee drill
 * either, so the channel pass is skipped too and spends nothing. Each drill is searched with its
 * skill type for context, a title must pass skillTitleVerdict against the drill's own name and
 * fit the length cap, and the most-watched passing video is proposed -- always tier B, so a
 * person approves every one. Capped per run like the lift search; a second run continues.
 */
async function planSkillVideoBackfill(options?: {
  maxDurationSeconds?: number;
  maxSearches?: number;
}): Promise<BackfillReport> {
  const maxDurationSeconds = options?.maxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS;
  const maxSearches = options?.maxSearches ?? DEFAULT_MAX_SEARCHES;
  const quota = newQuotaLedger();
  const targets = (await targetsNeedingVideo()).filter((t) => t.kind === "skill");
  const library = await skillLibraryForMatching();
  const skillTypeById = new Map(library.map((e) => [e.id, e.movementPattern ?? null]));
  const order = startOfTodaysSlice(targets, maxSearches);

  type Outcome = { proposal?: BackfillProposal; unmatched?: UnmatchedTarget; searched: boolean; waiting: boolean };
  const state = { searched: 0, cacheHits: 0, quotaGone: false };
  const outcomes: Outcome[] = [];
  // One drill at a time, in order: the search budget and the quota are shared state.
  await order.reduce(async (prev, target) => {
    await prev;
    const query = skillSearchQuery(target.name, skillTypeById.get(target.id));
    const cached = readYouTubeCache<Awaited<ReturnType<typeof searchVideosFor>>>("search", query, SEARCH_CACHE_HOURS);
    if (!cached && (state.quotaGone || state.searched >= maxSearches)) {
      outcomes.push({ searched: false, waiting: true });
      return;
    }
    const found = cached
      ? cached.map((v) => ({ ...v, title: decodeYouTubeText(v.title), channel: decodeYouTubeText(v.channel) }))
      : await searchVideosFor(query, quota).then(
          (r) => {
            writeYouTubeCache("search", query, r);
            return r;
          },
          (err: unknown) => {
            if (QUOTA_GONE.test(String((err as Error)?.message ?? err))) state.quotaGone = true;
            return null;
          },
        );
    if (cached) state.cacheHits += 1;
    else state.searched += 1;
    if (!found) {
      outcomes.push({ searched: false, waiting: true });
      return;
    }
    const verdicts = found
      .filter((v) => v.embeddable && v.durationSeconds > 0)
      .map((v) => ({ v, verdict: v.durationSeconds > maxDurationSeconds ? null : skillTitleVerdict(target.name, v.title) }));
    const passing = verdicts.filter((x) => x.verdict?.ok).map((x) => x.v).sort((a, b) => b.viewCount - a.viewCount);
    const best = passing[0];
    if (best) {
      const match = {
        videoId: best.videoId,
        title: best.title,
        channel: best.channel,
        durationSeconds: best.durationSeconds,
        tier: "B" as const,
        corroboration: "single" as const,
      };
      outcomes.push({ searched: true, waiting: false, proposal: { ...target, match, url: watchUrlFor(best.videoId) } });
      return;
    }
    const first = verdicts.find((x) => x.verdict && !x.verdict.ok);
    const why = first?.verdict && !first.verdict.ok ? first.verdict : null;
    outcomes.push({
      searched: true,
      waiting: false,
      unmatched: {
        ...target,
        rejection: why
          ? { reason: why.reason === "red_flag" ? "red-flag" : "head", detail: why.detail, title: first?.v.title, channel: first?.v.channel }
          : { reason: "duration", detail: "no result short enough that plays inside Forge" },
      },
    });
  }, Promise.resolve());

  const proposals = outcomes.flatMap((o) => (o.proposal ? [o.proposal] : []));
  const matchedIds = new Set(proposals.map((p) => p.id));
  const waitingCount = outcomes.filter((o) => o.waiting).length;
  const unmatched: UnmatchedTarget[] = targets
    .filter((t) => !matchedIds.has(t.id))
    .map((t) => outcomes.find((o) => o.unmatched?.id === t.id)?.unmatched ?? { ...t });
  return {
    targetsConsidered: targets.length,
    byKind: { exercise: { considered: 0, matched: 0 }, skill: { considered: targets.length, matched: proposals.length } },
    proposals,
    unmatched,
    channels: [],
    quota,
    maxDurationSeconds,
    tierCounts: { A: 0, B: proposals.length },
    searchFill: {
      searched: state.searched,
      filled: proposals.length,
      stillEmpty: outcomes.filter((o) => o.searched && !o.proposal).length,
      remaining: waitingCount,
    },
    unknownWords: [],
    duplicateSignatures: [],
    boilerplateByChannel: {},
    cacheHits: state.cacheHits,
  };
}

function toSaved(row: typeof exerciseVideoRuns.$inferSelect): SavedRun {
  return {
    ...(row.report as unknown as BackfillReport),
    runId: row.id,
    createdAt: row.createdAt.toISOString(),
    appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
    decisions: (row.decisions ?? {}) as Record<string, Decision>,
    ...(row.written != null ? { written: row.written } : {}),
  };
}

/** Run the plan and keep it. Writes nothing to the library. */
export async function saveDryRun(options?: Parameters<typeof planExerciseVideoBackfill>[0]): Promise<SavedRun> {
  const { db } = await import("./db");
  const report = await planExerciseVideoBackfill(options);
  const [row] = await db
    .insert(exerciseVideoRuns)
    .values({ report: report as unknown as Record<string, unknown>, decisions: {} })
    .returning();
  return toSaved(row);
}

/** The newest saved dry run, or null. Spends no quota. */
export async function latestDryRun(): Promise<SavedRun | null> {
  const { db } = await import("./db");
  const { desc } = await import("drizzle-orm");
  const [row] = await db.select().from(exerciseVideoRuns).orderBy(desc(exerciseVideoRuns.id)).limit(1);
  return row ? toSaved(row) : null;
}

/** Record (or clear, with null) a person's call on one proposal of a saved run. */
export async function decideProposal(
  runId: number,
  key: string,
  decision: Decision | null,
): Promise<SavedRun | null> {
  const { db } = await import("./db");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(exerciseVideoRuns).where(eq(exerciseVideoRuns.id, runId)).for("update");
    if (!row) return null;
    const report = row.report as unknown as BackfillReport;
    if (!report.proposals.some((p) => proposalKey(p) === key)) return toSaved(row);
    const decisions = { ...((row.decisions ?? {}) as Record<string, Decision>) };
    if (decision) decisions[key] = decision;
    else delete decisions[key];
    const [updated] = await tx
      .update(exerciseVideoRuns)
      .set({ decisions })
      .where(eq(exerciseVideoRuns.id, runId))
      .returning();
    return toSaved(updated);
  });
}

/**
 * Write a SAVED dry run -- exactly the list that was reviewed, with no YouTube call.
 *
 * Until 2026-11-10 this re-ran the plan, which meant two things: it could not run on a day the
 * dry run had spent the quota, and what it wrote was a fresh match rather than the list a person
 * had read. The placeholder check still runs AGAIN here, per row, inside the write: an admin may
 * have set a real URL since the dry run, and overwriting that would be indistinguishable from
 * data loss.
 */
export async function applyExerciseVideoBackfill(runId: number): Promise<SavedRun | null> {
  const { db } = await import("./db");
  const [row] = await db.select().from(exerciseVideoRuns).where(eq(exerciseVideoRuns.id, runId));
  if (!row) return null;
  const run = toSaved(row);
  let written = 0;
  for (const proposal of run.proposals) {
    if (!shouldWrite(proposal.match.tier, run.decisions[proposalKey(proposal)])) continue;
    const table = proposal.kind === "exercise" ? exercises : skillExercises;
    const [current] = await db
      .select({ videoUrl: table.videoUrl })
      .from(table)
      .where(eq(table.id, proposal.id));
    if (!current || !isSeededSearchPlaceholder(current.videoUrl)) continue;
    await db.update(table).set({ videoUrl: proposal.url }).where(eq(table.id, proposal.id));
    written += 1;
  }
  const [updated] = await db
    .update(exerciseVideoRuns)
    .set({ appliedAt: new Date(), written })
    .where(eq(exerciseVideoRuns.id, runId))
    .returning();
  return toSaved(updated);
}
