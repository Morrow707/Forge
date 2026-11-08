import { TAPPING_TRIALS } from "./anvil-part-metrics";
import { SEQUENCE_RERANDOMIZES_PER_TRIAL } from "./anvil-baseline";

/**
 * THE FOUR TASKS AS NUMBERS, IN ONE PLACE.
 *
 * The client runs them and the intro states how long they take, and both read this -- because a
 * duration typed on a screen goes stale the first time a trial count moves, and "about three and
 * a half minutes" was already wrong by the time best-of-three tapping was measured (the mock ran
 * one ten-second burst; `TAPPING_TRIALS` is 3). `estimatedSeconds` is derived, so the sentence an
 * athlete reads cannot disagree with the check they then take.
 *
 * Every number here is either measured elsewhere and imported, or a timing the task needs in
 * order to be the task. **None of them is a threshold**: nothing is judged against anything in
 * this file, which is why it carries no uncertainty and no fitted value.
 */

// ---------------------------------------------------------------------------
// Part 1 -- simple reaction time.
// ---------------------------------------------------------------------------

/** 25 trials. The median is the headline and 25 is what supports one. */
export const RT_TRIALS = 25;
/** How long the shape stays up before the trial is scored as a miss. */
export const RT_RESPONSE_WINDOW_MS = 1_000;
/**
 * The gap before the shape appears: 2–5 s, uniform.
 *
 * Random and at least two seconds because a FIXED interval is anticipated -- an athlete learns
 * the rhythm and starts moving before the signal, which measures their timing rather than their
 * latency. The floor is what makes anticipation unprofitable; the spread is what makes it
 * impossible.
 */
export const RT_WAIT_MIN_MS = 2_000;
export const RT_WAIT_SPAN_MS = 3_000;

// ---------------------------------------------------------------------------
// Part 2 -- go / leave / hold.
// ---------------------------------------------------------------------------

/**
 * 16 trials: 11 go, 3 leave, 2 hold.
 *
 * The go share (69%) is what makes the response PREPOTENT -- inhibition is only measurable
 * against a habit, and a 50/50 task measures choice instead. The hold trials are doubled from one
 * so the hold is measured more than once; two is not many and the part carries the lowest weight
 * in `PART_WEIGHT_ORDER` partly for that reason.
 */
export const GNG_TRIALS = 16;
export const GNG_MIX = { go: 11, leave: 3, hold: 2 } as const;
/** How long there is to START pressing on a hold trial. */
export const HOLD_START_WINDOW_MS = 1_300;
/**
 * The hold's own required length, randomised per trial: 0.9–1.9 s.
 *
 * Random because a fixed hold is a count rather than a hold -- an athlete who knows it is a
 * second releases on their own clock and never watches the bar.
 */
export const HOLD_MIN_MS = 900;
export const HOLD_SPAN_MS = 1_000;

/**
 * THE ORDER IS CONSTRAINED, NOT JUST SHUFFLED, and each clause is doing a job:
 *
 *  - it STARTS on a go, so the response is already prepotent before anything asks for it to be
 *    withheld -- a leave trial first measures nothing but surprise;
 *  - never two inhibition trials back to back, because the second one is no longer inhibiting a
 *    habit, it is continuing a pause;
 *  - never a run of go longer than four, which is where the task stops being a task and becomes
 *    part 1 again.
 */
export function gngOrderIsValid(plan: readonly string[]): boolean {
  if (plan[0] !== "go") return false;
  let run = 0;
  for (let i = 0; i < plan.length; i++) {
    if (plan[i] === "go") {
      run++;
      if (run > 4) return false;
    } else {
      run = 0;
      if (i > 0 && plan[i - 1] !== "go") return false;
    }
  }
  return true;
}

/** Shuffles until the constraints hold. Takes the random source so a test can be deterministic. */
export function buildGngPlan(random: () => number = Math.random): string[] {
  const base: string[] = [
    ...Array(GNG_MIX.go).fill("go"),
    ...Array(GNG_MIX.leave).fill("leave"),
    ...Array(GNG_MIX.hold).fill("hold"),
  ];
  let last = base.slice();
  for (let attempt = 0; attempt < 400; attempt++) {
    const plan = base.slice();
    for (let i = plan.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [plan[i], plan[j]] = [plan[j], plan[i]];
    }
    if (gngOrderIsValid(plan)) return plan;
    last = plan;
  }
  // A SHUFFLE THAT NEVER SATISFIES THE CONSTRAINTS STILL HAS TO PRODUCE A ROUND. Rule #1 on a
  // task: refusing to run part 2 would cost the athlete the whole part to protect an ordering
  // preference, and `partsRun` records what really happened either way.
  return last;
}

// ---------------------------------------------------------------------------
// Part 3 -- sequence span.
// ---------------------------------------------------------------------------

export const SEQ_START = 3;
export const SEQ_MAX = 7;
export const SEQ_PADS = 6;
/** How long each pad lights, and the gap between two flashes. */
export const SEQ_FLASH_MS = 420;
export const SEQ_GAP_MS = 220;

/**
 * Builds one round's sequence. A pad may repeat, never twice in a row -- two flashes of the same
 * pad in succession is one long flash on a touchscreen and is not a sequence item.
 */
export function buildSequence(length: number, random: () => number = Math.random): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    let n = 0;
    do {
      n = Math.floor(random() * SEQ_PADS);
    } while (i > 0 && n === out[i - 1]);
    out.push(n);
  }
  return out;
}

/**
 * THE GRID IS RE-LAID OUT EVERY ROUND, and this is the one thing in part 3 that is a measured
 * decision rather than a timing.
 *
 * `SEQUENCE_RERANDOMIZES_PER_TRIAL` is true in `anvil-baseline.ts`: the published flat practice
 * curve this part's one-check burn-in rests on comes from re-randomising BOTH the sequence and
 * the LAYOUT. A fixed grid lets somebody learn six positions by muscle memory, which is exactly
 * the drift the burn-in assumes does not happen. Read rather than re-stated, so the two cannot
 * disagree.
 */
export const SEQ_RELAYOUT_EACH_ROUND = SEQUENCE_RERANDOMIZES_PER_TRIAL;

// ---------------------------------------------------------------------------
// Part 4 -- maximal tapping.
// ---------------------------------------------------------------------------

/** Ten seconds per trial, three trials, the best reported (`reportedTapCount`). */
export const TAP_TRIAL_MS = 10_000;
export const TAP_REST_MS = 6_000;

// ---------------------------------------------------------------------------
// What the intro says.
// ---------------------------------------------------------------------------

/** Which parts an account runs. Four today; the under-15 two-part check is parked with the
 *  minors the Anvil does not accept, so there is deliberately no age branch here yet. */
export const ANVIL_PARTS = ["reaction_time", "go_no_go", "sequence_span", "tapping"] as const;
export type AnvilPartId = (typeof ANVIL_PARTS)[number];

/**
 * HOW LONG THE CHECK TAKES, DERIVED. Averages for the random waits, the measured flash timings
 * for part 3, and one "ready" tap between parts. Rounded to the nearest half minute on the
 * screen, because a check that says 4:12 and takes 3:51 reads as broken while "about four
 * minutes" is simply true.
 */
export function estimatedSeconds(): number {
  const meanWait = (RT_WAIT_MIN_MS + RT_WAIT_MIN_MS + RT_WAIT_SPAN_MS) / 2;
  const part1 = RT_TRIALS * (meanWait + 300);
  const part2 =
    GNG_TRIALS * (meanWait + 300) + GNG_MIX.hold * (HOLD_MIN_MS + HOLD_SPAN_MS / 2);
  const flashes = [SEQ_START, SEQ_START + 1, SEQ_START + 2, SEQ_START + 3, SEQ_MAX];
  const part3 = flashes.reduce((a, n) => a + n * (SEQ_FLASH_MS + SEQ_GAP_MS) + n * 450, 0);
  const part4 = TAPPING_TRIALS * TAP_TRIAL_MS + (TAPPING_TRIALS - 1) * TAP_REST_MS;
  const readyTaps = (ANVIL_PARTS.length - 1) * 2_500;
  return Math.round((part1 + part2 + part3 + part4 + readyTaps) / 1000);
}

/** "about four minutes", to the nearest half minute. */
export function estimatedLabel(): string {
  const halves = Math.round(estimatedSeconds() / 30);
  const minutes = halves / 2;
  return `about ${minutes % 1 === 0 ? minutes : minutes.toFixed(1)} minutes`;
}
