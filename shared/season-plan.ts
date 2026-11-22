/**
 * SEASON SETUP: the rules behind the "Season setup" step of Assign Program and of "Add to my
 * calendar" (Scott, 2026-11-22). Pure, so the dialog's live proposal, the server's check and the
 * tests all read the same function.
 *
 * Everything here is a SUGGESTION a person moves. Forge proposes start dates working back from the
 * first game; the coach sees every one and can change any of them; nothing is assigned until they
 * confirm. The one requirement in the whole step is the return-to-training clearance tick, which
 * Scott approved on purpose (a clinician clears an athlete, Forge never decides when somebody is
 * ready).
 *
 * The phase lengths are Forge's planning defaults, not a rule anybody is held to:
 *   - in-season runs from the first game to the last;
 *   - preseason is the 4 to 6 weeks before the first game;
 *   - off-season comes before that, in whole 4-week blocks;
 *   - postseason is the 2 to 4 weeks after the last game.
 */
import { PROGRAM_SEASON_PHASES, YOUTH_SAFE_MIN_AGE, normalizePosition, type ProgramSeasonPhase } from "./exercise-tags";

export const DAYS_PER_WEEK = 7;
/** Preseason: at least this many weeks before the first game, where the program allows it. */
export const PRESEASON_MIN_WEEKS = 4;
/** Preseason: at most this many weeks, unless the program itself is longer (never cut short). */
export const PRESEASON_MAX_WEEKS = 6;
/** Off-season is planned in blocks of this many weeks. */
export const OFF_SEASON_BLOCK_WEEKS = 4;
/** Postseason: at least this many weeks after the last game. */
export const POSTSEASON_MIN_WEEKS = 2;
/** Postseason: at most this many weeks, unless the program itself is longer. */
export const POSTSEASON_MAX_WEEKS = 4;
/** The most times one assignment repeats a program's own weeks (the assignment route's own cap). */
export const MAX_PROGRAM_REPEATS = 12;
/** The age from which an athlete may confirm their own return-to-training clearance. */
export const ADULT_AGE = 18;
/** The longest a clinician's restrictions note may be, in characters. */
export const MAX_RESTRICTIONS_LENGTH = 1000;

const ISO_DATE_LENGTH = 10;
const MS_PER_DAY = 86_400_000;

/** The order phases run in a season. Used to sort the plan for display. */
export const SEASON_PHASE_ORDER = Object.fromEntries(
  PROGRAM_SEASON_PHASES.map((phase, at) => [phase, at]),
) as Record<ProgramSeasonPhase, number>;

export const TEAM_GENDERS = ["girls", "boys", "mixed"] as const;
export type TeamGender = (typeof TEAM_GENDERS)[number];
export const TEAM_GENDER_LABEL: Record<TeamGender, string> = {
  girls: "Girls' team",
  boys: "Boys' team",
  mixed: "Mixed team",
};

/** The sentence the coach (or an adult Free Agent for themselves) ticks. Stored as a fact with who and when. */
export const RETURN_TO_TRAINING_CLEARANCE_SENTENCE =
  "A physician, athletic trainer or physical therapist has cleared this athlete to train.";
/** The same sentence for an adult setting up their own plan. */
export const RETURN_TO_TRAINING_SELF_CLEARANCE_SENTENCE =
  "A physician, athletic trainer or physical therapist has cleared me to train.";
/** Why the assign button waits, for a return-to-training program with no tick. */
export const RETURN_TO_TRAINING_NEEDS_CLEARANCE =
  "This is a return-to-training program. Tick the clearance line above to assign it.";
/** Why a minor cannot tick it for themselves. */
export const RETURN_TO_TRAINING_MINOR_SELF =
  "A return-to-training program for an athlete under 18 is set up by their coach, after a clinician has cleared them.";
/** The heading over the clinician's restrictions wherever they are shown with the day. */
export const RESTRICTIONS_PREFIX = "Clinician's restrictions:";

/** The under-14 loading note. Never blocks. */
export const UNDER_14_LOADING_NOTE = `This athlete is under ${YOUTH_SAFE_MIN_AGE}: work on technique before load, and use estimated maxes.`;
/** The same note for a group that includes somebody under 14. */
export const UNDER_14_LOADING_NOTE_GROUP = `Some of these athletes are under ${YOUTH_SAFE_MIN_AGE}: work on technique before load, and use estimated maxes.`;

/** True when a known age is under the youth line (the tags build's YOUTH_SAFE_MIN_AGE). Unknown is not young. */
export function isUnderYouthAge(age: number | null | undefined): boolean {
  return age != null && age < YOUTH_SAFE_MIN_AGE;
}

/** True when a program is a return-to-training program (its purposes carry the tag). */
export function isReturnToTrainingProgram(p: { purposes?: readonly string[] | null }): boolean {
  return (p.purposes ?? []).includes("return_to_training");
}

export function isProgramSeasonPhaseValue(v: unknown): v is ProgramSeasonPhase {
  return typeof v === "string" && (PROGRAM_SEASON_PHASES as readonly string[]).includes(v);
}

// A calendar date as YYYY-MM-DD: "2026-03-14" matches; "3/14/2026" and "2026-03-14T00:00" do not.
// https://regex101.com/?regex=%5E%5Cd%7B4%7D-%5Cd%7B2%7D-%5Cd%7B2%7D%24&testString=2026-03-14
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, ISO_DATE_LENGTH);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_PER_DAY);
}

/**
 * How many times to run a program of `weekCount` weeks so it fills at least `minWeeks`, without
 * going past `maxWeeks` when a smaller repeat count would. Always at least once: a program is never
 * cut short, so a program longer than the phase runs its whole length.
 */
export function repeatsToFill(weekCount: number, minWeeks: number, maxWeeks: number): number {
  const weeks = Math.max(1, Math.round(weekCount));
  const toReachMin = Math.max(1, Math.ceil(minWeeks / weeks));
  // The most repeats that stay inside the maximum; never below one.
  const insideMax = Math.max(1, Math.floor(maxWeeks / weeks));
  return Math.min(toReachMin, insideMax, MAX_PROGRAM_REPEATS);
}

export type SeasonPlanProgram = {
  programId: number;
  seasonPhase: ProgramSeasonPhase;
  /** How many weeks the program's own pattern is. */
  weekCount: number;
};

export type ProposedSeasonAssignment = {
  programId: number;
  seasonPhase: ProgramSeasonPhase;
  startDate: string;
  durationWeeks: number;
  /** The last day it covers, inclusive. For display. */
  endDate: string;
};

export type SeasonPlanResult =
  | { ok: true; proposals: ProposedSeasonAssignment[] }
  | { ok: false; reason: string };

function span(p: SeasonPlanProgram, repeats: number): number {
  return Math.max(1, Math.round(p.weekCount)) * repeats * DAYS_PER_WEEK;
}

/**
 * Forge's proposed start dates for a season, from the first and last game. Programs within a phase
 * run back to back in the order given. Nothing is proposed without a valid first game; a last game
 * before the first is refused with a sentence rather than guessed at.
 */
export function proposeSeasonPlan(input: {
  firstGameDate: string | null | undefined;
  lastGameDate: string | null | undefined;
  programs: readonly SeasonPlanProgram[];
}): SeasonPlanResult {
  const { firstGameDate: first, programs } = input;
  if (programs.length === 0) return { ok: true, proposals: [] };
  if (!isIsoDay(first)) return { ok: false, reason: "Enter the first game date and Forge will propose the dates." };
  const last = isIsoDay(input.lastGameDate) ? input.lastGameDate : first;
  if (daysBetween(first, last) < 0) return { ok: false, reason: "The last game is before the first game." };

  const byPhase = (phase: ProgramSeasonPhase) => programs.filter((p) => p.seasonPhase === phase);
  const out: ProposedSeasonAssignment[] = [];
  const push = (p: SeasonPlanProgram, startDate: string, repeats: number) =>
    out.push({
      programId: p.programId,
      seasonPhase: p.seasonPhase,
      startDate,
      durationWeeks: repeats,
      endDate: addDays(startDate, span(p, repeats) - 1),
    });

  // IN-SEASON: forward from the first game. One program repeats to cover the season; several run
  // once each in order and the last one repeats to reach the last game.
  const seasonDays = daysBetween(first, last) + 1;
  const inSeason = byPhase("in_season");
  let cursor = first;
  inSeason.forEach((p, i) => {
    const remainingWeeks = Math.ceil((seasonDays - daysBetween(first, cursor)) / DAYS_PER_WEEK);
    const repeats =
      i === inSeason.length - 1 ? Math.min(MAX_PROGRAM_REPEATS, Math.max(1, Math.ceil(remainingWeeks / Math.max(1, p.weekCount)))) : 1;
    push(p, cursor, repeats);
    cursor = addDays(cursor, span(p, repeats));
  });

  // PRESEASON: backward from the day before the first game. The listed order still runs forward,
  // so the last listed preseason program ends the day before the first game.
  const pre = byPhase("pre_season");
  const preRepeats = pre.map((p) => (pre.length === 1 ? repeatsToFill(p.weekCount, PRESEASON_MIN_WEEKS, PRESEASON_MAX_WEEKS) : 1));
  const preTotal = pre.reduce((sum, p, i) => sum + span(p, preRepeats[i]), 0);
  const preStart = addDays(first, -preTotal);
  let preCursor = preStart;
  pre.forEach((p, i) => {
    push(p, preCursor, preRepeats[i]);
    preCursor = addDays(preCursor, span(p, preRepeats[i]));
  });

  // OFF-SEASON: backward from the preseason's start (the first game when there is no preseason),
  // each program rounded up to whole 4-week blocks.
  const off = byPhase("off_season");
  const offRepeats = off.map((p) => repeatsToFill(p.weekCount, OFF_SEASON_BLOCK_WEEKS, Number.POSITIVE_INFINITY));
  const offTotal = off.reduce((sum, p, i) => sum + span(p, offRepeats[i]), 0);
  let offCursor = addDays(preStart, -offTotal);
  off.forEach((p, i) => {
    push(p, offCursor, offRepeats[i]);
    offCursor = addDays(offCursor, span(p, offRepeats[i]));
  });

  // POSTSEASON: forward from the day after the last game.
  const post = byPhase("post_season");
  let postCursor = addDays(last, 1);
  post.forEach((p) => {
    const repeats = post.length === 1 ? repeatsToFill(p.weekCount, POSTSEASON_MIN_WEEKS, POSTSEASON_MAX_WEEKS) : 1;
    push(p, postCursor, repeats);
    postCursor = addDays(postCursor, span(p, repeats));
  });

  out.sort((a, b) => a.startDate.localeCompare(b.startDate) || SEASON_PHASE_ORDER[a.seasonPhase] - SEASON_PHASE_ORDER[b.seasonPhase]);
  return { ok: true, proposals: out };
}

/**
 * The team-gender SUGGESTION from the chosen athletes' genders. Only the suggestion leaves the
 * server; no athlete's own gender is sent back to anybody, and the coach may pick anything.
 * Null when there is nothing to suggest from (no male or female on file).
 */
export function suggestTeamGender(genders: readonly (string | null | undefined)[]): TeamGender | null {
  const known = genders.map((g) => (g ?? "").toLowerCase()).filter((g) => g === "male" || g === "female");
  if (known.length === 0) return null;
  const hasMale = known.includes("male");
  const hasFemale = known.includes("female");
  if (hasMale && hasFemale) return "mixed";
  return hasFemale ? "girls" : "boys";
}

/** Whether an athlete's profile position is one a program is written for. No tags = no match shown. */
export function positionMatchesProgram(position: string | null | undefined, programPositions: readonly string[] | null | undefined): boolean {
  if (!position || !programPositions || programPositions.length === 0) return false;
  const mine = normalizePosition(position);
  return programPositions.some((p) => normalizePosition(p) === mine);
}

/** The line a day shows under each exercise, from a clinician's restrictions. Null when there are none. */
export function restrictionsLine(restrictions: string | null | undefined): string | null {
  const text = (restrictions ?? "").trim();
  return text.length > 0 ? `${RESTRICTIONS_PREFIX} ${text}` : null;
}
