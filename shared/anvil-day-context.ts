import {
  ANVIL_SIGNALS,
  anvilSignal,
  isPresent,
  type AnvilAbsence,
  type AnvilCoverage,
} from "./anvil-inputs";
import type { AnvilAthleteState } from "./anvil-athlete-state";

/**
 * WHAT ELSE WAS HAPPENING THAT MORNING, BESIDE THE FOUR TASKS.
 *
 * `shared/anvil-inputs.ts` declares which of Forge's columns the Anvil may read and
 * `shared/anvil-athlete-state.ts` maps rows onto them. Both were written, tested and **wired to
 * nothing**: `assembleAnvilState` had no caller in the repo, so the fifty-one declared signals
 * reached no screen and no page. This module is the shape that carries them to one.
 *
 * It matters because the agreement an adult ticks already promises it in words -- "Forge also
 * reads training information you already give it ... so that a change in these numbers can be
 * read beside what else was happening that week" -- and a promise in a consent document that the
 * code does not keep is the worst kind of untrue sentence this repo can ship. The fix is to keep
 * it, not to soften the sentence.
 *
 * **IT CARRIES AND NEVER DECIDES.** Nothing here is a threshold, a z-score or a flag. The only
 * claim the Anvil makes is `weeklyVerdict`'s, it needs two channels of three at z 2.0 before it
 * makes one, and today two of those three are not computable at all. A context reading on a day
 * is a FACT beside a number -- "they slept 5.2 hours", "the take was shot on a different phone" --
 * and reading one as a cause is the thing the vocabulary scan exists to keep off the screen.
 *
 * **AND AN ABSENCE IS CARRIED AS LOUDLY AS A VALUE**, which is the Rule #1 half. A blank beside a
 * morning has at least five different meanings (nothing logged, the watch was never connected, the
 * take came off the web tracker, the athlete turned tracking off, the take is not comparable) and
 * flattening them into one empty cell is how "nothing was wrong" and "nothing could be read" come
 * to look like the same pixels. `fixable` is the subset somebody can act on.
 */

/**
 * The five signals that are facts about the PERSON rather than about the week, left out of the
 * line a coach reads beside a morning.
 *
 * Named with a reason rather than filtered by a guess, because the membership rule here is
 * exclusion: everything declared is carried unless it is on this list, so a signal added to
 * `ANVIL_SIGNALS` next year appears beside the morning the day it exists rather than waiting for
 * somebody to add it to an accepted list. That direction is this repo's standing lesson -- a scan
 * enumerating accepted forms fails on every correct change and gets "fixed" by lengthening the
 * list.
 *
 * They are not SECRET and they are not unread: the eligibility gate reads the date of birth and
 * the state record still carries all five. They are simply not news about this week, and a date of
 * birth printed on a page a coach forwards is a person's identity riding along on a working
 * document for no reason.
 */
export const NOT_BESIDE_THE_MORNING: Record<string, string> = {
  date_of_birth: "A fact about the person, read by the eligibility gate and never news about a week.",
  gender: "A profile field. It cannot change between two mornings, so it explains no change between them.",
  sport: "A profile field, and the same argument as gender.",
  position: "A profile field, and the same argument as gender.",
  height_in: "Typed once by the athlete. The camera's rulers read it; a coach reading a morning does not.",
};

/**
 * SIGNALS THAT ARE NEWS ABOUT THE WEEK AND NOT ABOUT A MORNING: said once per athlete, never on a
 * day's line.
 *
 * The third membership class, and it exists because wiring the first one found the gap.
 * `growth_velocity` is computed over a span of at least four months, so its value is identical on
 * every morning of any week by construction -- and `besideLine` prints the first FIVE present
 * fields, where it sits eleventh. On an ordinary day with a check-in it was therefore never drawn
 * at all, and on a quiet day with no check-in it WOULD be: the same fact appearing or vanishing
 * depending on how many unrelated fields that morning happened to have. Invisible on the days that
 * matter is the camera registry's own failure -- 270 records shipped and read by one tracker of
 * fifteen -- and inconsistent is worse than either.
 *
 * NOT a constancy check over the data, which was the first design and is wrong: a week in which an
 * athlete happens to sleep 7.8 hours every night is not a week in which sleep stopped being news
 * about each morning. Whether a signal CAN change between two mornings is a property of the
 * signal, so it is declared, with its reason, exactly as the five above are.
 *
 * It is still a PRESENT reading and still carried in `beside` -- this decides only where it is
 * drawn. `weekBeside` is the reader.
 */
export const BESIDE_THE_WEEK_NOT_THE_MORNING: Record<string, string> = {
  growth_velocity:
    "Centimetres per year over a span of at least four months, so it holds the same value on every morning of a week. Drawn once per athlete beside the blanks, where a reader meets it instead of losing it off the end of a five-field line.",
};

/** One present reading, ready to render. */
export type BesideTheMorning = {
  signalId: string;
  /** Derived from the id, never a second list that can drift out of step with it. */
  label: string;
  unit: string;
  value: number | boolean | string | string[];
};

/** One absence a person could actually do something about, and the sentence that says what. */
export type FixableAbsence = {
  signalId: string;
  label: string;
  absent: AnvilAbsence;
  says: string;
};

export type AnvilDayContext = {
  date: string;
  /** Per channel: how many signals it declared, how many it got. A count, never a verdict. */
  coverage: AnvilCoverage[];
  beside: BesideTheMorning[];
  fixable: FixableAbsence[];
};

/**
 * `resting_heart_rate` -> "resting heart rate". Derived rather than declared on purpose: a label
 * table beside `ANVIL_SIGNALS` is a second place a signal's name lives, and the two drift the
 * first time one is renamed -- which this repo has paid for in `searchableRolesFor`, in the
 * height ruler's uncertainty and in the shoulder span's own spelling.
 */
export function signalLabel(signalId: string): string {
  return signalId.replace(/_/g, " ");
}

/**
 * What to tell somebody about a blank they can close.
 *
 * `no_data` is deliberately NOT in here, and the omission is BELT AND BRACES rather than the thing
 * doing the work: `assembleAnvilState` already keeps `no_data` out of `fixableAbsences` ("An
 * athlete who simply did not train today is not in here"), so a remedy written for it could not
 * fire today. It stays absent because the day somebody widens that upstream rule, "they did not
 * log a check-in" must not become a nudge beside every rest day every athlete ever takes -- and
 * `dayContextFrom` dropping an absence with no remedy is what makes this list, rather than the
 * upstream filter, the place that decides. The test drives that path directly, because a mutation
 * that adds `no_data` here is invisible through `assembleAnvilState`.
 */
export const ABSENCE_REMEDY: Partial<Record<AnvilAbsence, string>> = {
  health_not_connected:
    "Apple Health has never sent this account a value. Turning Health on in Settings is what fills it.",
  not_a_native_capture:
    "The take came from the web tracker, which does not compute this. Filming in the app fills it.",
  tracking_opted_out:
    "Camera tracking is off for this account, so there is no capture to read. Only the athlete, or their guardian, can turn it back on.",
  // THE CAPTURE PIPELINE'S WORD FOR ITS OWN RECORD IS "diagnostics", AND THAT WORD MAY NOT GO ON
  // AN ANVIL SURFACE. `shared/anvil-vocabulary.ts` forbids it because "the tasks resemble sideline
  // testing, so the word on an Anvil surface invites exactly the reading the product refuses" --
  // and a reader meeting it next to a reaction time does not know it is about a camera. "own
  // record" says the same thing and carries none of that.
  capture_not_comparable:
    "A capture exists and its own record says it cannot be compared with this athlete's others -- a different phone, or a take the camera pipeline did not trust.",
  // THE SENTENCE NAMES THE SPAN, which is what makes one remedy honest for all four of the growth
  // module's reasons. "No height on file" and "two heights measured a month apart" need the same
  // next action and differ only in when it pays off, so a reader who is told the span can work out
  // which case they are in; a four-way taxonomy here would say less and read as an error list.
  needs_two_dated_heights:
    "A growth rate needs two standing heights measured at least four months apart. Recording one today is what starts it.",
};

/**
 * The state record reduced to the two things a reader needs: the present readings that are news
 * about the week, and the blanks somebody can close.
 *
 * Pure, and it adds nothing the state did not already carry -- `fixableAbsences` is
 * `assembleAnvilState`'s own output and this only puts a sentence on each.
 */
export function dayContextFrom(state: AnvilAthleteState): AnvilDayContext {
  // DISCOVERED FROM THE DECLARATION, which is why no signal id is written below. On an ordinary day
  // this loop yields things like "sleep_hours", "mean_velocity_mps" and "training_load" -- and
  // naming any of them in the CODE is the defect, because a roster of what to include cannot see a
  // signal added to `ANVIL_SIGNALS` next year. The ratchet in
  // server/the-anvil-reads-what-forge-collects.test.ts forbids exactly that, over source with the
  // comments stripped -- so this paragraph, which quotes three of them, is what proves the strip
  // is doing work rather than sitting there.
  const beside: BesideTheMorning[] = [];
  for (const signal of ANVIL_SIGNALS) {
    if (NOT_BESIDE_THE_MORNING[signal.id]) continue;
    const r = state.readings[signal.id];
    if (!r || !isPresent(r)) continue;
    beside.push({
      signalId: signal.id,
      label: signalLabel(signal.id),
      unit: signal.unit,
      value: r.value,
    });
  }

  const fixable: FixableAbsence[] = [];
  for (const entry of state.fixableAbsences) {
    const says = ABSENCE_REMEDY[entry.absent];
    if (!says) continue;
    fixable.push({
      signalId: entry.signalId,
      label: signalLabel(entry.signalId),
      absent: entry.absent,
      says,
    });
  }

  return { date: state.date, coverage: state.coverage, beside, fixable };
}

/**
 * The four or five a coach reads first, in words, for the printed page and the narrow phone card.
 *
 * It is a PRESENTATION order over whatever `beside` already holds, not a second membership rule:
 * every signal the day read is in `beside`, and this picks which fit on one line. A signal named
 * here that the day did not read contributes nothing rather than an empty slot.
 */
export const BESIDE_IN_ORDER: readonly string[] = [
  "sleep_hours",
  "soreness",
  "stress",
  "mental_focus",
  "hrv",
  "resting_heart_rate",
  "training_load",
  "session_completed",
  "cara_training_minutes",
  "injury",
  "seat_is_parked",
];

export function besideLine(context: AnvilDayContext, limit = 5): string {
  const byId = new Map(
    // A WEEK-SHAPED SIGNAL NEVER COMPETES FOR ONE OF THE FIVE SLOTS. Filtered here rather than
    // left out of BESIDE_IN_ORDER, so that a signal added to that order and to the week map is
    // drawn once rather than twice -- the ordering list says WHERE a day field goes and this says
    // whether it is a day field at all.
    context.beside.filter((b) => !(b.signalId in BESIDE_THE_WEEK_NOT_THE_MORNING)).map((b) => [b.signalId, b]),
  );
  const bits: string[] = [];
  for (const id of BESIDE_IN_ORDER) {
    if (bits.length >= limit) break;
    const b = byId.get(id);
    if (!b) continue;
    bits.push(formatBeside(b));
  }
  return bits.join("  ·  ");
}

/** A reading in words, with its own unit. Never rounded to a cleaner-looking number. */
export function formatBeside(b: BesideTheMorning): string {
  const name = b.label;
  if (typeof b.value === "boolean") return `${name}: ${b.value ? "yes" : "no"}`;
  if (Array.isArray(b.value)) return b.value.length === 0 ? `${name}: none` : `${name}: ${b.value.join(", ")}`;
  if (typeof b.value === "number") {
    const n = Number.isInteger(b.value) ? String(b.value) : b.value.toFixed(1);
    const unit = readableUnit(name, b.unit);
    return unit ? `${name} ${n} ${unit}` : `${name} ${n}`;
  }
  return `${name}: ${b.value}`;
}

/**
 * The unit, unless printing it makes the line worse. Two mechanical rules rather than a per-signal
 * table, because a table is a second place a signal's name lives:
 *
 *  - A SCALE IS NOT A UNIT. `soreness` is declared `1-5`, and "soreness 2 1-5" reads as two
 *    numbers. The bounds belong in a tooltip, not between a value and the next field.
 *  - A UNIT THE LABEL ALREADY SAYS IS NOISE. The id is `sleep_hours` and the unit is `hours`, so
 *    the honest line is "sleep hours 7.8" rather than "sleep hours 7.8 hours".
 */
export function readableUnit(label: string, unit: string): string {
  if (!unit || unit === "none") return "";
  if (/^\d+\s*-\s*\d+$/.test(unit.trim())) return "";
  if (label.toLowerCase().split(/\s+/).includes(unit.toLowerCase())) return "";
  return unit;
}

/** Every channel's declared/present pair in one short string, so a thin read is visible. */
export function coverageLine(context: AnvilDayContext): string {
  return context.coverage
    .map((c) => `${c.channel} ${c.present}/${c.declared}`)
    .join("  ·  ");
}

/** True when a signal id is declared at all -- used by the ratchet, not by a screen. */
export function isDeclaredSignal(id: string): boolean {
  return anvilSignal(id) != null;
}

/**
 * THE SAME BLANK, SAID ONCE PER ATHLETE INSTEAD OF ONCE PER MORNING.
 *
 * Written after looking at the real page. Drawing `fixable` under each day put the SAME five
 * sentences under all seven mornings -- "Apple Health has never sent this account a value",
 * thirty-five times, on a roster of three -- and turned a week into a twenty-thousand-pixel wall
 * of amber. A warning repeated that many times is read as broken rather than as information, which
 * is the opposite of what the sentences are for.
 *
 * It is also the wrong SHAPE for most of them: "Health was never connected" and "camera tracking
 * is off" are facts about the ACCOUNT, true on every day in the window by construction. Only
 * `capture_not_comparable` is genuinely per-morning, and that is why the dates are carried and
 * printed -- but only when the blank is not every day, since "on every one of these days" is what
 * the absence of a date list already means.
 */
export type FixableAcrossDays = {
  absent: AnvilAbsence;
  says: string;
  /** Every reading this blank costs, in the order the declaration lists them. */
  labels: string[];
  /** The days it applied to, or null when it applied to every day that was read. */
  dates: string[] | null;
};

export function fixableAcrossDays(contexts: readonly AnvilDayContext[]): FixableAcrossDays[] {
  const read = contexts.filter((c) => c != null);
  const byAbsence = new Map<AnvilAbsence, { says: string; labels: Set<string>; dates: Set<string> }>();
  for (const context of read) {
    for (const fix of context.fixable) {
      const entry = byAbsence.get(fix.absent) ?? { says: fix.says, labels: new Set(), dates: new Set() };
      entry.labels.add(fix.label);
      entry.dates.add(context.date);
      byAbsence.set(fix.absent, entry);
    }
  }
  return Array.from(byAbsence.entries()).map(([absent, entry]) => ({
    absent,
    says: entry.says,
    labels: [...entry.labels],
    dates: entry.dates.size === read.length ? null : [...entry.dates].sort(),
  }));
}

/**
 * THE WEEK-SHAPED READINGS, ONCE PER ATHLETE, in the order the declaration lists them.
 *
 * The present-reading sibling of `fixableAcrossDays`: that one groups a blank somebody can close,
 * this one groups a value that cannot change between two mornings. Reads the LAST day that carried
 * each, so a height recorded mid-window is reflected rather than averaged away -- the value is a
 * rate over months and the newest one is the current answer.
 */
export function weekBeside(contexts: readonly AnvilDayContext[]): BesideTheMorning[] {
  const latest = new Map<string, BesideTheMorning>();
  for (const context of contexts.filter((c) => c != null)) {
    for (const b of context.beside) {
      if (!(b.signalId in BESIDE_THE_WEEK_NOT_THE_MORNING)) continue;
      latest.set(b.signalId, b);
    }
  }
  return Object.keys(BESIDE_THE_WEEK_NOT_THE_MORNING)
    .map((id) => latest.get(id))
    .filter((b): b is BesideTheMorning => b != null);
}

/** One line: what is blank, on which days, and what closes it. */
export function fixableLine(fix: FixableAcrossDays): string {
  const where = fix.dates == null ? "" : ` (${fix.dates.join(", ")})`;
  return `${fix.labels.join(", ")}${where} — ${fix.says}`;
}
