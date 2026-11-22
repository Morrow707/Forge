/* WEIGHT-ROOM SHEETS (2026-11-21): the printed team sheet, and reading a filled one back.
 *
 * A coach programs one group workout for a whole team and prints it. Every athlete on the team
 * gets a row filled in from Forge's own data, with no typing: their name, their max on file,
 * today's target from the prescription, last time's weight and reps, the plates per side and a
 * star where the target would be a new best. The names and numbers on a printout always come
 * from Forge; a model is only ever used to READ handwriting back off an upload.
 *
 * Pure, so the coach's on-screen sheet and the PDF are built by ONE function (`buildSheet`): what
 * prints is exactly what the coach saw, because the server rebuilds the model from its own data
 * plus the coach's choices, and never takes a rendered table from the client.
 *
 * What lives here:
 *   - the strength and conditioning basics on each lift block (goal, rest, effort), read from the
 *     program where it says and otherwise worked out from the field's standard bands. All of it
 *     is a suggestion the coach can type over; nothing refuses an edit;
 *   - the default lift order (power, then multi-joint, then single-joint) and the screen-only
 *     note when a coach drags a lift out of it;
 *   - loads: targets, plates per side, last time, the PR check;
 *   - grouping, sorting and paging a roster of a hundred or more;
 *   - reading an upload: the sheet code, athlete names, lift shorthand, set notation, and the
 *     attendance read off the sign-in column. Every matcher answers matched, ambiguous or
 *     unmatched and NEVER guesses.
 */
import { z } from "zod";
import { exerciseMatchScore, normalizeSearchText } from "./exercise-search";
import { estimatedOneRepMax } from "./strength-score";

const ZERO = 0;
const ONE = 1;
const TWO = 2;

/* ================================================================ the goal of the lift */

export const SHEET_GOALS = ["power", "strength", "hypertrophy", "endurance"] as const;
export type SheetGoal = (typeof SHEET_GOALS)[number];
export const SHEET_GOAL_LABEL: Record<SheetGoal, string> = {
  power: "Power",
  strength: "Strength",
  hypertrophy: "Hypertrophy",
  endurance: "Muscular endurance",
};

/* THE FIELD'S STANDARD REP AND LOAD BANDS for a training goal, as taught in strength and
 * conditioning: power 1-5 reps at a lighter load moved fast; strength up to 6 reps at 85% of a
 * max or more; hypertrophy 6-12 reps at 67-85%; muscular endurance 12 or more reps at 67% or
 * less. Printed as a suggestion, never a rule that refuses a coach's prescription. */
export const POWER_MAX_REPS = 5;
export const STRENGTH_MAX_REPS = 6;
export const STRENGTH_MIN_PERCENT = 85;
export const HYPERTROPHY_MAX_REPS = 12;
export const HYPERTROPHY_MIN_PERCENT = 67;
export const ENDURANCE_MIN_REPS = 12;

/* THE FIELD'S STANDARD REST between sets for each goal: power and strength 2-5 minutes,
 * hypertrophy 30-90 seconds, muscular endurance 30 seconds or less. */
export const STANDARD_REST: Record<SheetGoal, string> = {
  power: "2-5 min",
  strength: "2-5 min",
  hypertrophy: "30-90 s",
  endurance: "30 s or less",
};

/** Library categories whose lifts are power work whatever the reps say. */
const POWER_CATEGORIES = new Set(["olympic", "plyometric"]);
const SECONDS_PER_MINUTE = 60;
const PAD_SECONDS = 2;

/** The goal words a program's own notes may name, so a coach's "strength day" is read as said. */
const GOAL_WORDS: { goal: SheetGoal; words: string[] }[] = [
  { goal: "power", words: ["power", "explosive", "speed strength"] },
  { goal: "strength", words: ["strength", "max strength"] },
  { goal: "hypertrophy", words: ["hypertrophy", "size", "muscle growth"] },
  { goal: "endurance", words: ["endurance", "muscular endurance"] },
];

// A time rather than a rep count: matches "30s", "45 sec", "1 min"; rejects "5" and "8-10".
// https://regex101.com/?regex=%5Cd%5Cs*%28s%7Csec%7Csecs%7Cseconds%7Cmin%7Cmins%7Cminutes%29%5Cb&testString=30s
const TIMED_SET = /\d\s*(s|sec|secs|seconds|min|mins|minutes)\b/;
// Every whole number in a rep prescription: matches "8" and "10" in "8-10"; rejects "AMRAP".
// https://regex101.com/?regex=%5Cd%2B&testString=8-10
const WHOLE_NUMBERS = /\d+/g;

/** The rep count that decides a goal: the top of a range ("8-10" -> 10), the bigger side of
 * "5/5", null for a timed or open set ("30s", "AMRAP"). */
export function repsForGoal(reps: string | null | undefined): number | null {
  const text = String(reps ?? "").toLowerCase();
  if (!text.trim() || TIMED_SET.test(text)) return null;
  const numbers = (text.match(WHOLE_NUMBERS) ?? []).map(Number).filter((n) => n > ZERO);
  return numbers.length === ZERO ? null : Math.max(...numbers);
}

// A percentage: matches "75%" and "@ 82.5 % 1RM"; rejects "75" and "RPE 8".
// https://regex101.com/?regex=%28%5Cd%2B%28%3F%3A%5C.%5Cd%2B%29%3F%29%5Cs*%25&testString=%40+82.5%25+1RM
const PERCENT_TEXT = /(\d+(?:\.\d+)?)\s*%/;
// An RPE: matches "RPE 8" and "rpe8.5"; rejects "8" and "75%".
// https://regex101.com/?regex=rpe%5Cs*%28%5Cd%2B%28%3F%3A%5C.%5Cd%2B%29%3F%29&testString=RPE+8.5
const RPE_TEXT = /rpe\s*(\d+(?:\.\d+)?)/i;

/** A percentage or an RPE written in a prescribed load: "75%", "@ 80% 1RM", "RPE 8". */
export function parseIntensity(text: string | null | undefined): { percent: number | null; rpe: number | null } {
  const value = String(text ?? "");
  const pct = value.match(PERCENT_TEXT);
  const rpe = value.match(RPE_TEXT);
  return { percent: pct ? Number(pct[ONE]) : null, rpe: rpe ? Number(rpe[ONE]) : null };
}

/** The goal a program's notes name, if they name exactly one. */
export function goalNamedIn(text: string | null | undefined): SheetGoal | null {
  const lower = ` ${normalizeSearchText(String(text ?? ""))} `;
  const named = GOAL_WORDS.filter((g) => g.words.some((w) => lower.includes(` ${w} `))).map((g) => g.goal);
  const distinct = Array.from(new Set(named));
  return distinct.length === ONE ? distinct[ZERO] : null;
}

export type GoalInput = {
  reps: string | null | undefined;
  percent: number | null;
  category?: string | null;
  notes?: string | null;
};

const isPowerCategory = (category: string | null | undefined) => category != null && POWER_CATEGORIES.has(category);

/** The goal of a lift that day: the program's own word first, otherwise the standard bands.
 * Null when the prescription says too little (a timed set with no load). */
export function deriveGoal(input: GoalInput): { goal: SheetGoal; source: "program" | "derived" } | null {
  const named = goalNamedIn(input.notes);
  if (named) return { goal: named, source: "program" };
  const reps = repsForGoal(input.reps);
  const pct = input.percent;
  if (isPowerCategory(input.category) && (reps == null || reps <= POWER_MAX_REPS)) return { goal: "power", source: "derived" };
  if (reps == null) return null;
  const lightForEndurance = pct != null && pct <= HYPERTROPHY_MIN_PERCENT;
  const bands: { goal: SheetGoal; when: boolean }[] = [
    { goal: "endurance", when: reps > ENDURANCE_MIN_REPS || (reps >= ENDURANCE_MIN_REPS && lightForEndurance) },
    { goal: "power", when: reps <= POWER_MAX_REPS && pct != null && pct < STRENGTH_MIN_PERCENT },
    { goal: "strength", when: reps <= STRENGTH_MAX_REPS && (pct == null || pct >= STRENGTH_MIN_PERCENT) },
    { goal: "hypertrophy", when: reps <= HYPERTROPHY_MAX_REPS },
  ];
  const band = bands.find((b) => b.when);
  return { goal: band?.goal ?? "endurance", source: "derived" };
}

/** Rest between sets as printed: the program's rest when it sets one, else the goal's standard. */
export function restLabel(restSeconds: number | null | undefined, goal: SheetGoal | null): string {
  if (restSeconds == null || restSeconds <= ZERO) return goal ? STANDARD_REST[goal] : "";
  if (restSeconds < SECONDS_PER_MINUTE) return `${restSeconds} s`;
  const minutes = Math.floor(restSeconds / SECONDS_PER_MINUTE);
  const seconds = restSeconds % SECONDS_PER_MINUTE;
  if (seconds === ZERO) return `${minutes} min`;
  return `${minutes}:${String(seconds).padStart(PAD_SECONDS, "0")}`;
}

/** The effort the program prescribes, printed beside the target: "75%", "RPE 8", or both. */
export function effortLabel(percent: number | null, rpe: number | null): string {
  return [percent != null ? `${percent}%` : null, rpe != null ? `RPE ${rpe}` : null].filter(Boolean).join(" · ");
}

/* ================================================================ the order of the lifts */

export type MovementRank = 0 | 1 | 2;
const RANK_POWER: MovementRank = 0;
const RANK_MULTI: MovementRank = 1;
const RANK_SINGLE: MovementRank = 2;
/** The library's movementType values that are multi-joint lifts. */
const MULTI_JOINT_MOVEMENTS = new Set(["squat", "hinge", "press", "push", "pull", "lunge", "carry", "combination"]);

type Classifiable = { category?: string | null; movementType?: string | null };

/** 0 power, 1 multi-joint, 2 single-joint; null when the library does not say. */
export function movementRank(ex: Classifiable): MovementRank | null {
  if (isPowerCategory(ex.category)) return RANK_POWER;
  if (ex.category === "accessory") return RANK_SINGLE;
  const movement = String(ex.movementType ?? "").toLowerCase();
  if (ex.category === "strength" && MULTI_JOINT_MOVEMENTS.has(movement)) return RANK_MULTI;
  return null;
}

/** Power first, then multi-joint, then single-joint, when the library classifies every lift.
 * If it cannot classify one, the program's own order is kept untouched. */
export function defaultLiftOrder<T extends Classifiable>(lifts: readonly T[]): T[] {
  const ranks = lifts.map(movementRank);
  if (ranks.some((r) => r == null)) return [...lifts];
  return lifts
    .map((lift, at) => ({ lift, at, rank: ranks[at] as number }))
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .map((x) => x.lift);
}

/** True when an order puts a lift ahead of one that usually comes before it. Screen-only advice. */
export function liftsOutOfUsualOrder(lifts: readonly Classifiable[]): boolean {
  const ranks = lifts.map(movementRank);
  if (ranks.some((r) => r == null)) return false;
  return ranks.some((rank, i) => i > ZERO && (rank as number) < (ranks[i - ONE] as number));
}

export const USUAL_ORDER_NOTE = "Power lifts usually go first when you're fresh, then the big multi-joint lifts, then single-joint work.";

/** The day's warm-up: lifts the library calls mobility or activation work. Printed at the top. */
const WARMUP_MOVEMENTS = new Set(["activation", "mobility"]);
export function isWarmupLift(ex: Classifiable): boolean {
  return ex.category === "mobility" || WARMUP_MOVEMENTS.has(String(ex.movementType ?? "").toLowerCase());
}

/* ================================================================ supersets */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export type SupersetSlot = {
  label: string;
  letter: string;
  /** In a superset of two or more. */
  grouped: boolean;
  first: boolean;
  last: boolean;
  /** The group rests once, after its last lift (the builder's "After The Group"). */
  groupOnly: boolean;
  /** The label of the group's last lift, for "Rest 90 s after B2". */
  lastLabel: string;
  restAfter: boolean;
};

/** A, B1, B2, C, exactly as the app's computeExerciseLabels (client/src/lib/supersets.ts) labels
 * the same day: lifts the builder linked (adjacent, same supersetGroup) share a letter with a
 * number; a lift on its own takes a bare letter. With restAfterGroupOnly, only the group's last
 * lift rests; otherwise the group rests between each. */
export function supersetLabels(
  lifts: readonly { supersetGroup?: string | null; restAfterGroupOnly?: boolean | null }[],
): SupersetSlot[] {
  const slotOf = lifts.reduce<number[]>((acc, lift, i) => {
    const prev = lifts[i - ONE];
    const joins = i > ZERO && lift.supersetGroup != null && prev?.supersetGroup === lift.supersetGroup;
    acc.push(joins ? acc[i - ONE] : (acc[i - ONE] ?? -ONE) + ONE);
    return acc;
  }, []);
  return lifts.map((lift, i) => {
    const slot = slotOf[i];
    const members = slotOf.map((s, j) => (s === slot ? j : -ONE)).filter((j) => j >= ZERO);
    const letter = LETTERS[slot % LETTERS.length];
    const grouped = members.length > ONE;
    const groupOnly = grouped && members.some((j) => lifts[j].restAfterGroupOnly === true);
    const lastIndex = members[members.length - ONE];
    return {
      label: grouped ? `${letter}${members.indexOf(i) + ONE}` : letter,
      letter,
      grouped,
      first: i === members[ZERO],
      last: i === lastIndex,
      groupOnly,
      lastLabel: grouped ? `${letter}${members.length}` : letter,
      restAfter: !groupOnly || i === lastIndex,
    };
  });
}

/** The rest line a superset prints under its group: "Rest 90 s after B2" when the builder set
 * "After The Group", "Rest 90 s between each" otherwise. Only the group's last lift carries it. */
export function supersetRestLine(slot: SupersetSlot, rest: string): string {
  if (!slot.last || !rest) return "";
  return slot.groupOnly ? `Rest ${rest} after ${slot.lastLabel}` : `Rest ${rest} between each`;
}

/* ================================================================ loads */

export type WeightUnit = "lbs" | "kg";
export const LBS_PER_KG = 2.20462;
const LB_STEP = 5;
const KG_STEP = 2.5;
/** The nearest plate jump: 5 lb on a pound bar, 2.5 kg on a kilo bar. */
export const LOAD_STEP: Record<WeightUnit, number> = { lbs: LB_STEP, kg: KG_STEP };
const PERCENT_SCALE = 100;
const ONE_DECIMAL = 10;

export function convertLoad(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value;
  return to === "kg" ? value / LBS_PER_KG : value * LBS_PER_KG;
}

export function roundToStep(value: number, unit: WeightUnit): number {
  const step = LOAD_STEP[unit];
  return Math.round(value / step) * step;
}

/** The target for one athlete, or null when there is no max or no percentage to take of it. */
export function targetLoad(max: number | null, percent: number | null, unit: WeightUnit): number | null {
  if (max == null || percent == null || !(max > ZERO) || !(percent > ZERO)) return null;
  return roundToStep((max * percent) / PERCENT_SCALE, unit);
}

export const NO_VALUE = "—";
export const unitLabel = (unit: WeightUnit) => (unit === "kg" ? "kg" : "lb");
const tidy = (value: number) => Math.round(value * ONE_DECIMAL) / ONE_DECIMAL;
export const formatLoad = (value: number | null, unit: WeightUnit) => (value == null ? NO_VALUE : `${tidy(value)} ${unitLabel(unit)}`);

/* The standard bar and plates: a 45 lb bar with 45/35/25/10/5/2.5 plates, or a 20 kg bar with
 * 25/20/15/10/5/2.5/1.25 plates. Both are editable in the toolbar. */
const LB_BAR = 45;
const KG_BAR = 20;
const LB_PLATES = [45, 35, 25, 10, 5, 2.5]; // eslint-disable-line ts-patterns/no-magic-numbers -- the standard pound plate set, named by this const
const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25]; // eslint-disable-line ts-patterns/no-magic-numbers -- the standard kilo plate set, named by this const
export const DEFAULT_BAR: Record<WeightUnit, number> = { lbs: LB_BAR, kg: KG_BAR };
export const DEFAULT_PLATES: Record<WeightUnit, number[]> = { lbs: LB_PLATES, kg: KG_PLATES };
/** Plate arithmetic is done in hundredths so 2.5 and 1.25 add up exactly. */
const HUNDREDTHS = 100;

/** The plates for one side of the bar, largest first, or null when the target is no more than the
 * bar. `remainder` is what the plate set cannot make (a 187 lb target on 2.5 lb change plates). */
export function platesPerSide(target: number | null, bar: number, plates: readonly number[]): { plates: number[]; remainder: number } | null {
  if (target == null || !(target > bar)) return null;
  const sorted = plates.filter((p) => p > ZERO).map((p) => Math.round(p * HUNDREDTHS)).sort((a, b) => b - a);
  const perSide = Math.round(((target - bar) / TWO) * HUNDREDTHS);
  const result = sorted.reduce<{ left: number; used: number[] }>(
    (acc, plate) => {
      const count = Math.floor(acc.left / plate);
      return { left: acc.left - count * plate, used: [...acc.used, ...Array.from({ length: count }, () => plate)] };
    },
    { left: perSide, used: [] },
  );
  return { plates: result.used.map((p) => p / HUNDREDTHS), remainder: result.left / HUNDREDTHS };
}

export function platesLabel(target: number | null, bar: number, plates: readonly number[]): string {
  const side = platesPerSide(target, bar, plates);
  if (target == null) return "";
  if (!side) return "bar only";
  const base = `${tidy(target)} = ${side.plates.map(tidy).join("+") || "bar"} per side`;
  return side.remainder > ZERO ? `${base} (+${tidy(side.remainder)} short)` : base;
}

export type LoggedSet = { date: string; weight: number; reps: number; unit: WeightUnit };

/** The heaviest set of the most recent session before `before`, as "225×5". Hand-logged and
 * filmed sets both count; only weight and reps are ever read. Blank with no prior session. */
export function lastTimeLabel(history: readonly LoggedSet[], before: string, unit: WeightUnit): string {
  const earlier = history.filter((s) => s.date < before && s.weight > ZERO && s.reps > ZERO);
  if (earlier.length === ZERO) return "";
  const latest = earlier.reduce((d, s) => (s.date > d ? s.date : d), earlier[ZERO].date);
  const top = earlier
    .filter((s) => s.date === latest)
    .map((s) => ({ ...s, weight: convertLoad(s.weight, s.unit, unit) }))
    .reduce((best, s) => (s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best));
  return `${tidy(roundToStep(top.weight, unit))}×${top.reps}`;
}

/** The best estimated one-rep max (Epley, at most 12 reps) before `before`, in `unit`. */
export function bestEstimatedMax(history: readonly LoggedSet[], before: string, unit: WeightUnit): number | null {
  const values = history
    .filter((s) => s.date < before)
    .map((s) => estimatedOneRepMax(convertLoad(s.weight, s.unit, unit), s.reps))
    .filter((v): v is number => v != null);
  return values.length === ZERO ? null : Math.max(...values);
}

/** Whether hitting `target` for the prescribed reps would beat the athlete's best estimated max.
 * No history means no star: a first session is not marked as a record. */
export function wouldBePr(target: number | null, reps: string | null | undefined, best: number | null): boolean {
  const count = repsForGoal(reps);
  if (target == null || best == null || count == null) return false;
  const e1rm = estimatedOneRepMax(target, count);
  return e1rm != null && e1rm > best;
}

/* ================================================================ the sheet code */

/* A short code printed in the sheet's corner (optional; the coach can turn it off) so an
 * uploaded photo says which team, day and program day it is, and which VERSION of the day's
 * prescription was printed: "FS-<team>-<yyyymmdd>-<programDay>-<version>-<check>", ids in base
 * 36, the version a short hash of the day's lifts and one check letter, so a misread character
 * is caught rather than logged against the wrong team. Each athlete's own assignment is found from
 * the team, the date and the program day; the code never carries an athlete. */
const CODE_PREFIX = "FS";
const BASE36 = 36;
const CHECK_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const ISO_DATE_LENGTH = 10;
const YEAR_END = 4;
const MONTH_END = 6;
const GROUP_TEAM = 1;
const GROUP_DATE = 2;
const GROUP_DAY = 3;
const GROUP_VERSION = 4;
const GROUP_CHECK = 5;
/* FNV-1a, 32 bit: a short, stable fingerprint of a prescription, not a security hash. */
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const VERSION_LENGTH = 5;

function checkLetter(body: string): string {
  const sum = Array.from(body).reduce((acc, ch, i) => acc + ch.charCodeAt(ZERO) * (i + ONE), ZERO);
  return CHECK_ALPHABET[sum % CHECK_ALPHABET.length];
}

type VersionedLift = { programExerciseId: number; exerciseId: number; sets: number; reps: string; weight: string | null; restSeconds: number | null };

/** A fingerprint of the day's prescription at print time, so an upload can tell the day changed. */
export function prescriptionVersion(lifts: readonly VersionedLift[]): string {
  const text = [...lifts]
    .sort((a, b) => a.programExerciseId - b.programExerciseId)
    .map((l) => [l.programExerciseId, l.exerciseId, l.sets, l.reps, l.weight ?? "", l.restSeconds ?? ""].join("|"))
    .join(";");
  const hash = Array.from(text).reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(ZERO), FNV_PRIME) >>> ZERO, FNV_OFFSET);
  return hash.toString(BASE36).toUpperCase().padStart(VERSION_LENGTH, "0").slice(-VERSION_LENGTH);
}

type DescribedLift = { programExerciseId: number; name: string; sets: number; reps: string; weight: string | null };

/** What changed between the printed prescription and today's, in sentences for the review. */
export function prescriptionChanges(printed: readonly DescribedLift[], current: readonly DescribedLift[]): string[] {
  const now = new Map(current.map((l) => [l.programExerciseId, l]));
  const then = new Map(printed.map((l) => [l.programExerciseId, l]));
  const describe = (l: DescribedLift) => `${l.sets}×${l.reps}${l.weight ? ` @ ${l.weight}` : ""}`;
  const removed = printed.filter((l) => !now.has(l.programExerciseId)).map((l) => `${l.name} was taken off the day.`);
  const added = current.filter((l) => !then.has(l.programExerciseId)).map((l) => `${l.name} was added to the day.`);
  const edited = printed
    .filter((l) => now.has(l.programExerciseId) && describe(l) !== describe(now.get(l.programExerciseId) as DescribedLift))
    .map((l) => `${l.name}: printed ${describe(l)}, now ${describe(now.get(l.programExerciseId) as DescribedLift)}.`);
  return [...removed, ...added, ...edited];
}

const compactDate = (date: string) => date.slice(ZERO, ISO_DATE_LENGTH).split("-").join("");

export function encodeSheetCode(teamId: number, date: string, programDayId: number, version: string): string {
  const day = programDayId.toString(BASE36).toUpperCase();
  const body = `${CODE_PREFIX}-${teamId.toString(BASE36).toUpperCase()}-${compactDate(date)}-${day}-${version}`;
  return `${body}-${checkLetter(body)}`;
}

// The code anywhere in what was read: matches "FS-C-20261121-9N-0A1B2-K"; rejects "FS-C-2026-9N-K".
// https://regex101.com/?regex=FS-%28%5B0-9A-Z%5D%2B%29-%28%5Cd%7B8%7D%29-%28%5B0-9A-Z%5D%2B%29-%28%5B0-9A-Z%5D%2B%29-%28%5BA-Z%5D%29&testString=FS-C-20261121-9N-0A1B2-K
const SHEET_CODE = /FS-([0-9A-Z]+)-(\d{8})-([0-9A-Z]+)-([0-9A-Z]+)-([A-Z])/;
// Whitespace, to read a code a camera split across a line: matches " " and a newline; rejects "-".
// https://regex101.com/?regex=%5Cs%2B&testString=FS-C+-2026
const WHITESPACE = /\s+/g;

export type SheetCode = { teamId: number; date: string; programDayId: number; version: string };

export function decodeSheetCode(text: string | null | undefined): SheetCode | null {
  const cleaned = String(text ?? "").toUpperCase().replace(WHITESPACE, "");
  const m = cleaned.match(SHEET_CODE);
  if (!m) return null;
  const body = `${CODE_PREFIX}-${m[GROUP_TEAM]}-${m[GROUP_DATE]}-${m[GROUP_DAY]}-${m[GROUP_VERSION]}`;
  if (checkLetter(body) !== m[GROUP_CHECK]) return null;
  const digits = m[GROUP_DATE];
  const date = `${digits.slice(ZERO, YEAR_END)}-${digits.slice(YEAR_END, MONTH_END)}-${digits.slice(MONTH_END)}`;
  const teamId = parseInt(m[GROUP_TEAM], BASE36);
  const programDayId = parseInt(m[GROUP_DAY], BASE36);
  if (!(teamId > ZERO) || !(programDayId > ZERO) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return null;
  return { teamId, date, programDayId, version: m[GROUP_VERSION] };
}

/* ================================================================ what the boxes hold */

export type BoxKind = "load" | "time" | "distance" | "hold";
export const BOX_HINT: Record<BoxKind, string> = { load: "wt × reps", time: "time", distance: "distance", hold: "sec" };

// A distance in a prescription: matches "40yd", "20 m", "100 meters"; rejects "5" and "30s".
// https://regex101.com/?regex=%5Cd%5Cs*%28m%7Cmeters%3F%7Cmetres%3F%7Cyd%7Cyds%7Cyards%3F%7Cft%7Cfeet%29%5Cb&testString=40yd
const DISTANCE_TEXT = /\d\s*(m|meters?|metres?|yd|yds|yards?|ft|feet)\b/;
const HOLD_MOVEMENTS = new Set(["isometric"]);
const DISTANCE_MOVEMENTS = new Set(["carry"]);

export type BoxInput = {
  reps: string;
  movementType: string | null;
  laterality: string | null;
  usesWeight: boolean;
  usesBodyweight: boolean;
};

/** What a lift's boxes ask for, from its prescription and library fields: a load and reps; a
 * time or a distance for timed and distance work; seconds for a hold; L and R for a one-side
 * prescription; and "BW" in place of a target for a bodyweight move. */
export function boxesFor(input: BoxInput): { kind: BoxKind; sides: boolean; bodyweight: boolean } {
  const reps = input.reps.toLowerCase();
  const movement = String(input.movementType ?? "").toLowerCase();
  const kinds: { kind: BoxKind; when: boolean }[] = [
    { kind: "distance", when: DISTANCE_TEXT.test(reps) },
    { kind: "hold", when: HOLD_MOVEMENTS.has(movement) && TIMED_SET.test(reps) },
    { kind: "time", when: TIMED_SET.test(reps) },
    { kind: "distance", when: DISTANCE_MOVEMENTS.has(movement) && repsForGoal(reps) == null },
  ];
  return {
    kind: kinds.find((k) => k.when)?.kind ?? "load",
    sides: input.laterality === "unilateral",
    bodyweight: input.usesBodyweight && !input.usesWeight,
  };
}

/* ================================================================ the coach's layout */

const MAX_SETS = 12;
const MAX_PERCENT = 150;
const NOTE_MAX = 300;
const OVERRIDE_MAX = 40;
const LIST_MAX = 1000;
const MAX_BAR = 100;
const MAX_PLATE = 100;
const MAX_PLATES = 12;
const MAX_CUSTOM = 10;

export const SHEET_VIEWS = ["team", "across", "cards"] as const;
export type SheetView = (typeof SHEET_VIEWS)[number];
export const SHEET_VIEW_LABEL: Record<SheetView, string> = {
  team: "Team sheet (a table per lift)",
  across: "Athletes across (a row per athlete)",
  cards: "One card per athlete",
};
export const GROUP_BY = ["none", "rosterGroup", "position"] as const;
export const SORT_BY = ["last", "first", "custom"] as const;
export const RPE_MODES = ["lift", "set", "off"] as const;

/* EVERY ELEMENT ON THE SHEET IS OPTIONAL (Scott: "everything on it is optional"). One toggle per
 * element; branding is the only thing on a sheet that is not here, because it is the program's
 * own look from the Branding page and the sheet only displays it. */
export const SHEET_TOGGLES = {
  code: { label: "Sheet code", default: true },
  qr: { label: "QR code", default: true },
  note: { label: "Note line", default: true },
  phaseLine: { label: "Phase and week", default: true },
  warmup: { label: "Warm-up", default: true },
  goal: { label: "Goal", default: true },
  rest: { label: "Rest", default: true },
  effort: { label: "Effort (% or RPE)", default: true },
  supersets: { label: "Superset labels", default: true },
  cues: { label: "Cues and tempo", default: false },
  max: { label: "Max", default: false },
  target: { label: "Target", default: true },
  boldTargets: { label: "Bold, larger targets", default: true },
  lastTime: { label: "Last time", default: true },
  plates: { label: "Plates per side", default: true },
  prMarker: { label: "PR star", default: true },
  coachNotes: { label: "Coach notes strip", default: false },
  orderNote: { label: "Lift order tip (screen only)", default: true },
  acrossLastTime: { label: "Last time (athletes across)", default: false },
  acrossPlates: { label: "Plates (athletes across)", default: false },
} as const;
export type SheetToggle = keyof typeof SHEET_TOGGLES;
export const SHEET_TOGGLE_KEYS = Object.keys(SHEET_TOGGLES) as SheetToggle[];

const togglesSchema = z.object(
  Object.fromEntries(SHEET_TOGGLE_KEYS.map((k) => [k, z.boolean().default(SHEET_TOGGLES[k].default)])) as Record<
    SheetToggle,
    z.ZodDefault<z.ZodBoolean>
  >,
);

/** What is SAVED per coach and team as the default for next time: every toggle, the view, the
 * page, the unit, grouping and sorting, the bar and plates, the lift order, the hidden lifts, the
 * set count and percentage per lift, and a hand-made athlete order. Keyed by library exercise id,
 * so a different program day with the same lifts keeps the choices. No branding field: branding
 * is set on the Branding page and a sheet route cannot write it (`.strict()` refuses one). */
export const sheetLayoutSchema = z
  .object({
    toggles: togglesSchema.prefault({}),
    rpe: z.enum(RPE_MODES).default("lift"),
    view: z.enum(SHEET_VIEWS).default("team"),
    page: z
      .object({ size: z.enum(["letter", "a4"]), orientation: z.enum(["portrait", "landscape"]).nullable() })
      .default({ size: "letter", orientation: null }),
    unit: z.enum(["lbs", "kg"]).nullable().default(null),
    groupBy: z.enum(GROUP_BY).default("none"),
    sortBy: z.enum(SORT_BY).default("last"),
    bar: z.number().min(ZERO).max(MAX_BAR).nullable().default(null),
    plates: z.array(z.number().positive().max(MAX_PLATE)).max(MAX_PLATES).nullable().default(null),
    liftOrder: z.array(z.number().int().positive()).max(LIST_MAX).default([]),
    hiddenLifts: z.array(z.number().int().positive()).max(LIST_MAX).default([]),
    setsByLift: z.record(z.string(), z.number().int().min(ONE).max(MAX_SETS)).default({}),
    percentByLift: z.record(z.string(), z.number().min(ZERO).max(MAX_PERCENT)).default({}),
    athleteOrder: z.array(z.number().int().positive()).max(LIST_MAX).default([]),
    customColumns: z
      .array(z.object({ id: z.string().min(ONE).max(OVERRIDE_MAX), header: z.string().trim().min(ONE).max(OVERRIDE_MAX) }).strict())
      .max(MAX_CUSTOM)
      .default([]),
    customBlocks: z
      .array(
        z
          .object({
            id: z.string().min(ONE).max(OVERRIDE_MAX),
            text: z.string().max(NOTE_MAX),
            /** Printed before this lift (library exercise id); null prints it after the last lift. */
            beforeExerciseId: z.number().int().positive().nullable(),
          })
          .strict(),
      )
      .max(MAX_CUSTOM)
      .default([]),
  })
  .strict();
export type SheetLayout = z.infer<typeof sheetLayoutSchema>;
export const DEFAULT_SHEET_LAYOUT: SheetLayout = sheetLayoutSchema.parse({});

/** The page orientation printed: the coach's choice, else landscape for "athletes across". */
export function orientationFor(layout: SheetLayout): "portrait" | "landscape" {
  if (layout.page.orientation) return layout.page.orientation;
  return layout.view === "across" ? "landscape" : "portrait";
}

/** What applies to THIS day's sheet only and is never saved: the note line, who is left off, and
 * any cell the coach typed over (one athlete's target, a lift's goal, rest or effort). */
export const sheetDayEditsSchema = z
  .object({
    note: z.string().max(NOTE_MAX).default(""),
    excludedAthletes: z.array(z.number().int().positive()).max(LIST_MAX).default([]),
    targetOverrides: z.record(z.string(), z.record(z.string(), z.string().max(OVERRIDE_MAX))).default({}),
    goalOverrides: z.record(z.string(), z.string().max(OVERRIDE_MAX)).default({}),
    restOverrides: z.record(z.string(), z.string().max(OVERRIDE_MAX)).default({}),
    effortOverrides: z.record(z.string(), z.string().max(OVERRIDE_MAX)).default({}),
  })
  .strict();
export type SheetDayEdits = z.infer<typeof sheetDayEditsSchema>;
export const EMPTY_DAY_EDITS: SheetDayEdits = sheetDayEditsSchema.parse({});

/* ================================================================ the sheet model */

export type SheetSourceLift = VersionedLift & {
  name: string;
  notes: string | null;
  category: string | null;
  movementType: string | null;
  equipment: string | null;
  laterality: string | null;
  usesWeight: boolean;
  usesBodyweight: boolean;
  supersetGroup: string | null;
  restAfterGroupOnly: boolean;
};
export type SheetSourceAthlete = {
  athleteId: number;
  name: string;
  displayName: string;
  position: string | null;
  groupLabel: string | null;
  /** Whether this athlete has this program day on this date. */
  onDay: boolean;
  /** Per library exercise id: a tested max in lb (or null) and the logged history. */
  lifts: Record<string, { testedLbs: number | null; history: LoggedSet[] }>;
};
export type SheetSource = {
  teamId: number;
  teamName: string;
  date: string;
  programDayId: number;
  dayTitle: string;
  programName: string;
  coachName: string;
  /** "Accumulation, week 3 of 8". Null when the program says nothing about it. */
  phaseLine: string | null;
  lighterWeek: boolean;
  /** Where the QR code points: the day in the app, route and date only. */
  qrUrl: string | null;
  /** The coach's own unit, used unless the team's sheet sets one. */
  coachUnit: WeightUnit;
  lifts: SheetSourceLift[];
  athletes: SheetSourceAthlete[];
};

export type SheetCell = {
  max: string | null;
  maxSource: "tested" | "estimated" | null;
  target: string | null;
  targetComputed: string;
  targetChanged: boolean;
  plates: string | null;
  last: string | null;
  pr: boolean;
};
export type SheetAthleteRow = { athleteId: number; displayName: string; onDay: boolean; cells: SheetCell[] };
export type SheetGroup = { label: string | null; rows: SheetAthleteRow[] };
export type SheetBlock = {
  programExerciseId: number;
  exerciseId: number;
  name: string;
  slot: string | null;
  /** The superset this lift is in, when the toggle is on and it is in one. */
  superset: { letter: string; first: boolean; last: boolean } | null;
  /** Text blocks the coach placed before this lift. */
  textBefore: string[];
  cues: string | null;
  kind: BoxKind;
  sides: boolean;
  bodyweight: boolean;
  sets: number;
  setsChanged: boolean;
  reps: string;
  percent: number | null;
  percentChanged: boolean;
  goal: string | null;
  goalComputed: string;
  goalChanged: boolean;
  rest: string | null;
  restComputed: string;
  restChanged: boolean;
  effort: string | null;
  effortComputed: string;
  effortChanged: boolean;
};
export type SheetModel = {
  code: string | null;
  version: string;
  qrUrl: string | null;
  teamName: string;
  date: string;
  dayTitle: string;
  programName: string;
  coachName: string;
  phaseLine: string | null;
  lighterWeek: boolean;
  warmup: string[] | null;
  note: string | null;
  unit: WeightUnit;
  bar: number;
  plates: number[];
  layout: SheetLayout;
  orientation: "portrait" | "landscape";
  rpe: (typeof RPE_MODES)[number];
  boldTargets: boolean;
  coachNotes: boolean;
  blocks: SheetBlock[];
  groups: SheetGroup[];
  hiddenLifts: { exerciseId: number; name: string }[];
  /** Screen only, never printed; null when the coach turned the tip off. */
  orderNote: string | null;
  customColumns: { id: string; header: string }[];
  /** Text blocks placed after the last lift. */
  textAfter: string[];
};

function orderByPreferred<T>(items: readonly T[], keyOf: (t: T) => number, preferred: readonly number[]): T[] {
  const at = new Map(preferred.map((id, i) => [id, i]));
  const known = items.filter((i) => at.has(keyOf(i))).sort((a, b) => (at.get(keyOf(a)) as number) - (at.get(keyOf(b)) as number));
  return [...known, ...items.filter((i) => !at.has(keyOf(i)))];
}

const lastNameOf = (name: string) => {
  const parts = name.trim().split(" ").filter(Boolean);
  return parts[parts.length - ONE] ?? "";
};

/** Sorts a roster: by last name, by first name, or in the coach's own dragged order. */
export function sortAthletes<T extends { athleteId: number; name: string }>(athletes: readonly T[], sortBy: SheetLayout["sortBy"], custom: readonly number[]): T[] {
  if (sortBy === "custom") return orderByPreferred(athletes, (a) => a.athleteId, custom);
  const key = (a: T) => (sortBy === "last" ? `${lastNameOf(a.name)} ${a.name}` : a.name).toLowerCase();
  return [...athletes].sort((a, b) => key(a).localeCompare(key(b)));
}

const UNGROUPED = "Unassigned";

/** Splits a roster into the groups that each start a new page. One unlabeled group for "none". */
export function groupAthletes<T extends { position: string | null; groupLabel: string | null }>(athletes: readonly T[], groupBy: SheetLayout["groupBy"]): { label: string | null; athletes: T[] }[] {
  if (groupBy === "none") return [{ label: null, athletes: [...athletes] }];
  const labelOf = (a: T) => (groupBy === "position" ? a.position : a.groupLabel)?.trim() || UNGROUPED;
  const labels = Array.from(new Set(athletes.map(labelOf))).sort((a, b) => {
    if (a === UNGROUPED) return ONE;
    if (b === UNGROUPED) return -ONE;
    return a.localeCompare(b);
  });
  return labels.map((label) => ({ label, athletes: athletes.filter((a) => labelOf(a) === label) }));
}

const shown = <T,>(on: boolean, value: T): T | null => (on ? value : null);

function maxSourceOf(tested: number | null, best: number | null): "tested" | "estimated" | null {
  if (tested != null) return "tested";
  return best != null ? "estimated" : null;
}

/** The whole sheet, from the day's data, the saved layout and this day's edits. */
export function buildSheet(source: SheetSource, layout: SheetLayout, edits: SheetDayEdits): SheetModel {
  const on = layout.toggles;
  const across = layout.view === "across";
  const showLast = across ? on.acrossLastTime : on.lastTime;
  const showPlates = across ? on.acrossPlates : on.plates;
  const warmupLifts = source.lifts.filter(isWarmupLift);
  const working = source.lifts.filter((l) => !isWarmupLift(l));
  const ordered = layout.liftOrder.length > ZERO ? orderByPreferred(working, (l) => l.exerciseId, layout.liftOrder) : defaultLiftOrder(working);
  const hidden = new Set(layout.hiddenLifts);
  const visible = ordered.filter((l) => !hidden.has(l.exerciseId));
  const slots = supersetLabels(visible);
  const unit: WeightUnit = layout.unit ?? source.coachUnit;
  const bar = layout.bar ?? DEFAULT_BAR[unit];
  const plates = layout.plates ?? DEFAULT_PLATES[unit];
  const version = prescriptionVersion(source.lifts);
  const barbellLift = new Set(source.lifts.filter((l) => String(l.equipment ?? "").toLowerCase().includes("barbell")).map((l) => l.exerciseId));

  const blocks = visible.map((lift, i): SheetBlock => {
    const key = String(lift.exerciseId);
    const prescribed = parseIntensity(lift.weight);
    const chosen = layout.percentByLift[key];
    const percent = chosen != null && chosen > ZERO ? chosen : prescribed.percent;
    const goal = deriveGoal({ reps: lift.reps, percent, category: lift.category, notes: lift.notes });
    const goalComputed = goal ? SHEET_GOAL_LABEL[goal.goal] : "";
    const slot = slots[i];
    const ownRest = restLabel(lift.restSeconds, goal?.goal ?? null);
    const restComputed = on.supersets && slot.grouped ? supersetRestLine(slot, ownRest) : ownRest;
    const effortComputed = effortLabel(percent, prescribed.rpe);
    const sets = layout.setsByLift[key] ?? lift.sets;
    const boxes = boxesFor(lift);
    const typed = (map: Record<string, string>) => map[key];
    const changed = (map: Record<string, string>, computed: string) => typed(map) != null && typed(map) !== computed;
    return {
      programExerciseId: lift.programExerciseId,
      exerciseId: lift.exerciseId,
      name: lift.name,
      slot: shown(on.supersets, slot.label),
      superset: on.supersets && slot.grouped ? { letter: slot.letter, first: slot.first, last: slot.last } : null,
      textBefore: layout.customBlocks.filter((b) => b.beforeExerciseId === lift.exerciseId).map((b) => b.text),
      cues: shown(on.cues, lift.notes?.trim() || null),
      kind: boxes.kind,
      sides: boxes.sides,
      bodyweight: boxes.bodyweight,
      sets,
      setsChanged: sets !== lift.sets,
      reps: lift.reps,
      percent,
      percentChanged: percent !== prescribed.percent,
      goal: shown(on.goal, typed(edits.goalOverrides) ?? goalComputed),
      goalComputed,
      goalChanged: changed(edits.goalOverrides, goalComputed),
      rest: shown(on.rest, typed(edits.restOverrides) ?? restComputed),
      restComputed,
      restChanged: changed(edits.restOverrides, restComputed),
      effort: shown(on.effort, typed(edits.effortOverrides) ?? effortComputed),
      effortComputed,
      effortChanged: changed(edits.effortOverrides, effortComputed),
    };
  });

  const excluded = new Set(edits.excludedAthletes);
  const kept = source.athletes.filter((a) => !excluded.has(a.athleteId));
  const sorted = sortAthletes(kept, layout.sortBy, layout.athleteOrder);
  const cellFor = (a: SheetSourceAthlete, block: SheetBlock): SheetCell => {
    const lift = a.lifts[String(block.exerciseId)];
    const best = lift ? bestEstimatedMax(lift.history, source.date, unit) : null;
    const tested = lift?.testedLbs != null ? convertLoad(lift.testedLbs, "lbs", unit) : null;
    const max = tested ?? best;
    const loadsTarget = !block.bodyweight && block.kind === "load";
    const targetValue = loadsTarget ? targetLoad(max, block.percent, unit) : null;
    const computed = block.bodyweight ? "BW" : formatLoad(targetValue, unit);
    const typedTarget = edits.targetOverrides[String(a.athleteId)]?.[String(block.exerciseId)];
    const lastText = lift ? lastTimeLabel(lift.history, source.date, unit) : "";
    return {
      max: shown(on.max, max != null ? formatLoad(roundToStep(max, unit), unit) : NO_VALUE),
      maxSource: maxSourceOf(tested, best),
      target: shown(on.target, typedTarget ?? computed),
      targetComputed: computed,
      targetChanged: typedTarget != null && typedTarget !== computed,
      plates: shown(showPlates && barbellLift.has(block.exerciseId) && typedTarget == null && targetValue != null, platesLabel(targetValue, bar, plates)),
      last: shown(showLast, lastText),
      pr: on.prMarker && on.target && typedTarget == null && wouldBePr(targetValue, block.reps, best),
    };
  };
  const rowFor = (a: SheetSourceAthlete): SheetAthleteRow => ({
    athleteId: a.athleteId,
    displayName: a.displayName,
    onDay: a.onDay,
    cells: blocks.map((block) => cellFor(a, block)),
  });

  return {
    code: shown(on.code, encodeSheetCode(source.teamId, source.date, source.programDayId, version)),
    version,
    qrUrl: shown(on.qr, source.qrUrl),
    teamName: source.teamName,
    date: source.date,
    dayTitle: source.dayTitle,
    programName: source.programName,
    coachName: source.coachName,
    phaseLine: shown(on.phaseLine, source.phaseLine),
    lighterWeek: on.phaseLine && source.lighterWeek,
    warmup: shown(on.warmup && warmupLifts.length > ZERO, warmupLifts.map((l) => `${l.name} ${l.sets}×${l.reps}`)),
    note: shown(on.note, edits.note),
    unit,
    bar,
    plates,
    layout,
    orientation: orientationFor(layout),
    rpe: layout.rpe,
    boldTargets: on.boldTargets,
    coachNotes: on.coachNotes,
    blocks,
    groups: groupAthletes(sorted, layout.groupBy).map((g) => ({ label: g.label, rows: g.athletes.map(rowFor) })),
    hiddenLifts: ordered.filter((l) => hidden.has(l.exerciseId)).map((l) => ({ exerciseId: l.exerciseId, name: l.name })),
    orderNote: shown(on.orderNote && liftsOutOfUsualOrder(visible), USUAL_ORDER_NOTE),
    customColumns: layout.customColumns,
    textAfter: layout.customBlocks
      .filter((b) => b.beforeExerciseId == null || !visible.some((l) => l.exerciseId === b.beforeExerciseId))
      .map((b) => b.text),
  };
}

/* ================================================================ paging */

/** Rows that fit on a page after a header of `headerHeight`, never splitting a row. At least one. */
export function rowsPerPage(pageHeight: number, headerHeight: number, rowHeight: number): number {
  return Math.max(ONE, Math.floor((pageHeight - headerHeight) / rowHeight));
}

/** Items cut into pages of `perPage`, whole items only. Cards are four to a page. */
export function paginate<T>(items: readonly T[], perPage: number): T[][] {
  const size = Math.max(ONE, Math.floor(perPage));
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
}
export const CARDS_PER_PAGE = 4;

/** The narrowest a write-in box may print and still take a handwritten "225": about half an inch (0.55 in). */
export const POINTS_PER_INCH = 72;
const MIN_BOX_INCHES = 0.55;
export const MIN_BOX_WIDTH_PT = MIN_BOX_INCHES * POINTS_PER_INCH;

/** The "athletes across" layout: which lifts share each band of columns. Every lift's boxes are
 * shrunk to fit the page; when a band would push a box under MIN_BOX_WIDTH_PT, the next lift
 * starts a second band. A lift wider than a whole page on its own still gets a band to itself. */
export function acrossBands(boxesPerLift: readonly number[], availableWidth: number): number[][] {
  const maxBoxes = Math.max(ONE, Math.floor(availableWidth / MIN_BOX_WIDTH_PT));
  return boxesPerLift.reduce<{ bands: number[][]; used: number }>(
    (acc, boxes, i) => {
      const current = acc.bands[acc.bands.length - ONE];
      if (current && acc.used + boxes <= maxBoxes) {
        current.push(i);
        return { bands: acc.bands, used: acc.used + boxes };
      }
      return { bands: [...acc.bands, [i]], used: boxes };
    },
    { bands: [], used: ZERO },
  ).bands;
}

/** How many boxes a lift's block takes in the "athletes across" layout: a target cell, one per set
 * (two per set on a one-side lift) and the RPE boxes. */
export function boxesInBlock(block: { sets: number; sides: boolean }, model: { rpe: (typeof RPE_MODES)[number] }, targetShown: boolean): number {
  const setBoxes = block.sides ? block.sets * TWO : block.sets;
  const rpeBoxes = { lift: ONE, set: block.sets, off: ZERO }[model.rpe];
  return (targetShown ? ONE : ZERO) + setBoxes + rpeBoxes;
}

/* ================================================================ reading a filled sheet */

/** Common short forms of first names, both ways. A sheet says "Mike" for Michael. */
const NAME_SHORT_FORMS: Record<string, string[]> = {
  mike: ["michael"], mikey: ["michael"], matt: ["matthew"], chris: ["christopher", "christian", "christina"],
  nick: ["nicholas"], nate: ["nathan", "nathaniel"], jake: ["jacob"], josh: ["joshua"], will: ["william"],
  bill: ["william"], billy: ["william"], alex: ["alexander", "alexandra", "alexis"], tony: ["anthony"],
  joe: ["joseph"], joey: ["joseph"], dan: ["daniel"], danny: ["daniel"], dave: ["david"], ben: ["benjamin"],
  sam: ["samuel", "samantha"], tom: ["thomas"], tommy: ["thomas"], jim: ["james"], jimmy: ["james"],
  bob: ["robert"], rob: ["robert"], bobby: ["robert"], zach: ["zachary"], zack: ["zachary"],
  andy: ["andrew"], drew: ["andrew"], ed: ["edward"], eddie: ["edward"], tim: ["timothy"],
  greg: ["gregory"], kate: ["katherine", "kathryn", "katelyn"], katie: ["katherine", "kathryn", "katelyn"],
  liz: ["elizabeth"], beth: ["elizabeth"], jen: ["jennifer"], jenny: ["jennifer"], abby: ["abigail"],
  maddie: ["madison", "madeline"], gabe: ["gabriel"], jon: ["jonathan"], johnny: ["john", "jonathan"],
  steve: ["steven", "stephen"],
};

const tokensOf = (name: string) => normalizeSearchText(name).split(" ").filter(Boolean);

function firstNameForms(first: string): Set<string> {
  const longs = NAME_SHORT_FORMS[first] ?? [];
  const shorts = Object.entries(NAME_SHORT_FORMS).filter(([, l]) => l.includes(first)).map(([s]) => s);
  return new Set([first, ...longs, ...shorts]);
}

export type NameMatch =
  | { status: "matched"; athleteId: number }
  | { status: "ambiguous"; candidateIds: number[] }
  | { status: "unmatched" };

/** Who a name written on a sheet is, from THIS roster only (the coach's in-scope athletes on the
 * team). The most specific reading that finds anybody decides; finding two is ambiguous. */
export function matchAthleteName(written: string, roster: readonly { id: number; name: string }[]): NameMatch {
  const words = tokensOf(written);
  if (words.length === ZERO) return { status: "unmatched" };
  const people = roster.map((r) => {
    const t = tokensOf(r.name);
    return { id: r.id, first: t[ZERO] ?? "", last: t.length > ONE ? t[t.length - ONE] : "", full: t.join(" ") };
  });
  const joined = words.join(" ");
  const firstWritten = words[ZERO];
  const lastWritten = words.length > ONE ? words[words.length - ONE] : "";
  const firstMatches = (p: { first: string }) => firstNameForms(p.first).has(firstWritten) || firstNameForms(firstWritten).has(p.first);

  const levels: ((p: (typeof people)[number]) => boolean)[] = [
    (p) => p.full === joined,
    (p) => lastWritten.length > ONE && firstMatches(p) && p.last === lastWritten,
    (p) => lastWritten.length === ONE && firstMatches(p) && p.last.startsWith(lastWritten),
    (p) => words.length === ONE && firstMatches(p),
    (p) => words.length === ONE && p.last === firstWritten,
  ];
  const decided = levels.map((level) => people.filter(level).map((p) => p.id)).find((hits) => hits.length > ZERO);
  if (!decided) return { status: "unmatched" };
  return decided.length === ONE ? { status: "matched", athleteId: decided[ZERO] } : { status: "ambiguous", candidateIds: decided };
}

/** Weight-room shorthand a sheet uses that the library search does not already know. */
const LIFT_SHORTHAND: Record<string, string> = {
  bs: "back squat",
  fs: "front squat",
  bp: "bench press",
  bench: "bench press",
  squat: "back squat",
  sq: "squat",
  inc: "incline",
  hc: "hang clean",
  pc: "power clean",
  pp: "push press",
};

export type LiftMatch =
  | { status: "matched"; programExerciseId: number }
  | { status: "ambiguous"; candidateIds: number[] }
  | { status: "unmatched" };

/** Which of the DAY's lifts a written lift name is. Matched only when exactly one of them answers
 * it; two answers is ambiguous and the coach chooses. */
export function matchLift(written: string, dayLifts: readonly { programExerciseId: number; name: string }[]): LiftMatch {
  const typed = normalizeSearchText(written);
  if (!typed) return { status: "unmatched" };
  const expanded = typed.split(" ").map((w) => LIFT_SHORTHAND[w] ?? w).join(" ");
  const exact = dayLifts.filter((l) => [typed, expanded].includes(normalizeSearchText(l.name)));
  if (exact.length === ONE) return { status: "matched", programExerciseId: exact[ZERO].programExerciseId };
  const queries = Array.from(new Set([typed, expanded]));
  const hits = dayLifts.filter((l) => queries.some((q) => exerciseMatchScore({ name: l.name }, q) != null));
  if (hits.length === ONE) return { status: "matched", programExerciseId: hits[ZERO].programExerciseId };
  if (hits.length > ONE) return { status: "ambiguous", candidateIds: hits.map((h) => h.programExerciseId) };
  return { status: "unmatched" };
}

export type ParsedSet = { reps: string; weight: string | null; unit: WeightUnit | null };
export type ParsedCell = { sets: ParsedSet[]; uncertain: boolean };

/** A load bigger than this is a weight rather than a set count or a rep count. */
const LOAD_NOT_REPS_ABOVE = 20;
/** More sets than this in "AxB" reads as something else, not a set count. */
const MAX_SETS_IN_NOTATION = 10;
const TALLY_FIVE = 5;

// A kilo unit: matches "100kg" and "100 kgs"; rejects "100" and "100 lbs".
// https://regex101.com/?regex=%28kg%7Ckgs%7Ckilo%7Ckilos%29%5Cb&testString=100kg
const KILO_UNIT = /(kg|kgs|kilo|kilos)\b/;
// A pound unit: matches "225lb", "225 lbs" and "225#"; rejects "225" and "100kg".
// https://regex101.com/?regex=%28lbs%3F%7C%23%29&testString=225+lbs
const POUND_UNIT = /(lbs?|#)/;
// Any unit word, to strip it: matches "kg", "kilos", "lbs", "#"; rejects "x" and "@".
// https://regex101.com/?regex=%28kgs%3F%7Ckilos%3F%7Clbs%3F%7C%23%29&testString=100kg
const ANY_UNIT = /(kgs?|kilos?|lbs?|#)/g;
// Tally marks only: matches "||||" and "| | |"; rejects "4" and "|| 5".
// https://regex101.com/?regex=%5E%5B%7C%5C%2F%5Cs%E5%8D%8C%5D%2B%24&testString=%7C%7C%7C%7C
const TALLY_ONLY = /^[|/\s卌]+$/;
// One tally stroke: matches each "|" in "|||"; rejects "/".
// https://regex101.com/?regex=%5C%7C&testString=%7C%7C%7C
const TALLY_STROKE = /\|/g;
// A five-gate tally character: matches "卌"; rejects "|".
// https://regex101.com/?regex=%E5%8D%8C&testString=%E5%8D%8C
const TALLY_GATE = /卌/g;
// Sets x reps at a weight: matches "3x5 225", "3x5@225", "3 x 5 x 225"; rejects "225x5".
// https://regex101.com/?regex=%5E%28%5Cd%2B%29%5Cs*x%5Cs*%28%5Cd%2B%29%5Cs*%28%3F%3A%40%7Cx%7Cat%29%3F%5Cs*%28%5Cd%2B%28%3F%3A%5C.%5Cd%2B%29%3F%29%24&testString=3x5+225
const SETS_REPS_WEIGHT = /^(\d+)\s*x\s*(\d+)\s*(?:@|x|at)?\s*(\d+(?:\.\d+)?)$/;
// Reps at a weight: matches "5@225" and "5 at 225"; rejects "225x5".
// https://regex101.com/?regex=%5E%28%5Cd%2B%29%5Cs*%28%3F%3A%40%7Cat%29%5Cs*%28%5Cd%2B%28%3F%3A%5C.%5Cd%2B%29%3F%29%24&testString=5%40225
const REPS_AT_WEIGHT = /^(\d+)\s*(?:@|at)\s*(\d+(?:\.\d+)?)$/;
// Two numbers joined by x, / or *: matches "225x5", "225/5", "5x5"; rejects "3x5 225".
// https://regex101.com/?regex=%5E%28%5Cd%2B%28%3F%3A%5C.%5Cd%2B%29%3F%29%5Cs*%5Bx%2F*%5D%5Cs*%28%5Cd%2B%28%3F%3A%5C.%5Cd%2B%29%3F%29%24&testString=225x5
const NUMBER_PAIR = /^(\d+(?:\.\d+)?)\s*[x/*]\s*(\d+(?:\.\d+)?)$/;
// One number: matches "5" and "102.5"; rejects "5x5".
// https://regex101.com/?regex=%5E%5Cd%2B%28%3F%3A%5C.%5Cd%2B%29%3F%24&testString=5
const ONE_NUMBER = /^\d+(?:\.\d+)?$/;
const FIRST = 1;
const SECOND = 2;
const THIRD = 3;

function unitIn(raw: string): WeightUnit | null {
  if (KILO_UNIT.test(raw)) return "kg";
  return POUND_UNIT.test(raw) ? "lbs" : null;
}

const repeatSet = (count: number, set: ParsedSet): ParsedSet[] => Array.from({ length: count }, () => ({ ...set }));

/** One cell of a filled sheet, as written, into sets. Understood: "225x5", "225/5", "5@225",
 * "3x5 225", "3x5@225", "3 x 5 x 225", a bare number under a weight column (reps at that
 * weight), tally marks ("||||" is 4 reps), and "kg" or "lb" on any of them. Null when nothing can
 * be read. A reading that could mean two things ("5x5" with no load) is returned, marked uncertain. */
export function parseSetCell(textIn: string | null | undefined, columnWeight?: string | null): ParsedCell | null {
  const raw = String(textIn ?? "").trim().toLowerCase();
  if (!raw) return null;
  const unit = unitIn(raw);
  const text = raw.replace(ANY_UNIT, " ").replace(WHITESPACE, " ").trim();
  const given = columnWeight ?? null;

  if (TALLY_ONLY.test(raw)) {
    const reps = (raw.match(TALLY_GATE) ?? []).length * TALLY_FIVE + (raw.match(TALLY_STROKE) ?? []).length;
    return reps > ZERO ? { sets: [{ reps: String(reps), weight: given, unit }], uncertain: false } : null;
  }
  const srw = text.match(SETS_REPS_WEIGHT);
  if (srw && Number(srw[FIRST]) <= MAX_SETS_IN_NOTATION && Number(srw[THIRD]) > LOAD_NOT_REPS_ABOVE) {
    return { sets: repeatSet(Number(srw[FIRST]), { reps: srw[SECOND], weight: srw[THIRD], unit }), uncertain: false };
  }
  const rat = text.match(REPS_AT_WEIGHT);
  if (rat) return { sets: [{ reps: rat[FIRST], weight: rat[SECOND], unit }], uncertain: false };
  const pair = text.match(NUMBER_PAIR);
  if (pair) {
    const a = Number(pair[FIRST]);
    const b = Number(pair[SECOND]);
    if (a > LOAD_NOT_REPS_ABOVE && b <= LOAD_NOT_REPS_ABOVE) return { sets: [{ reps: pair[SECOND], weight: pair[FIRST], unit }], uncertain: false };
    if (b > LOAD_NOT_REPS_ABOVE && a <= LOAD_NOT_REPS_ABOVE) return { sets: [{ reps: pair[FIRST], weight: pair[SECOND], unit }], uncertain: true };
    if (a <= MAX_SETS_IN_NOTATION) return { sets: repeatSet(a, { reps: pair[SECOND], weight: given, unit }), uncertain: true };
    return null;
  }
  if (ONE_NUMBER.test(text)) {
    if (given) return { sets: [{ reps: text, weight: given, unit }], uncertain: false };
    if (Number(text) <= LOAD_NOT_REPS_ABOVE) return { sets: [{ reps: text, weight: null, unit }], uncertain: true };
    return { sets: [{ reps: "", weight: text, unit }], uncertain: true };
  }
  return null;
}

/* ================================================================ attendance off a sheet */

/** Scott, 2026-11-21: attendance comes from the numbers alone. An athlete with at least one set
 * written on the sheet was there that day; an athlete with nothing written is NOT MARKED, never
 * absent. Nothing here marks anybody absent. */
export type SheetAttendance = "present" | "not_marked";
export function presenceFromSets(loggedSets: number): SheetAttendance {
  return loggedSets > ZERO ? "present" : "not_marked";
}
