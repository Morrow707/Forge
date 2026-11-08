import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SLOW_ANCHOR_CHECKS,
  SLOW_COHORT_MIN,
  SLOW_WINDOW_DAYS,
  SLOW_WINDOW_MIN_CHECKS,
  slowChannelCohort,
  slowChannelDrift,
  type SlowChannelCheck,
  type SlowCohortEntry,
} from "./anvil-slow-channel";
import { BASELINE_BURN_IN_CHECKS } from "./anvil-baseline";

/**
 * THE SLOW CHANNEL'S ANCHOR IS FROZEN, DISJOINT FROM ITS WINDOW, AND SCORED AGAINST A COHORT.
 *
 * Every number in the module has a measurement and a script behind it; this file holds the
 * PROPERTIES those measurements rest on, which is the half a simulation cannot keep true. Three of
 * them would each silently un-measure the channel:
 *
 *  - **the anchor must not move.** A rolling anchor detects nothing above its own clean floor in
 *    all three simulated worlds (`tools/anvil-sim/countanchor.py`), and it is the shape somebody
 *    reaches for when an athlete's first checks look unrepresentative. So "the FIRST N" is asserted
 *    as behaviour: more checks arriving must not move the anchor by a millisecond.
 *  - **the anchor and the window must not overlap.** The ACWR's acute week sits inside its own
 *    chronic window, which is the coupling that killed it; a reading in both halves makes the
 *    difference partly a number minus itself.
 *  - **the burn-in must drop from the OLD end**, which is the end the anchor is taken from -- so a
 *    practice curve becomes the athlete's permanent normal if the order is ever reversed.
 *
 * It DRIVES the functions rather than scanning them wherever the question is which way a decision
 * goes, which is the `form-check-destination.ts` lesson: a scan over a decision can only see the
 * words it is written with.
 */

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const BASE = Date.parse("2026-01-01T00:00:00.000Z");

/** Checks on explicit day offsets from `BASE`, so a test can put the anchor and the window far
 *  enough apart that the anchor really falls outside the window -- which is the property under
 *  test and not something to leave to arithmetic that happens to work. */
function checksOn(days: readonly number[], medians: readonly number[]): SlowChannelCheck[] {
  return days.map((d, i) => ({ date: iso(BASE + d * DAY), medianMs: medians[i], eligible: true }));
}

/** A run of `n` consecutive days starting at `from`. */
const run = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);
const same = (n: number, v: number) => Array.from({ length: n }, () => v);

const BURN = BASELINE_BURN_IN_CHECKS.reaction_time;

const ANCHOR_RUN = BURN + SLOW_ANCHOR_CHECKS;
/** The window's last day. The anchor sits on days 0..ANCHOR_RUN-1 and the window on the
 *  SLOW_WINDOW_MIN_CHECKS days ending here, which is chosen so the window opens well after the
 *  anchor closes. */
const AS_OF_DAY = 200;
const WINDOW_DAYS_USED = run(AS_OF_DAY - SLOW_WINDOW_MIN_CHECKS + 1, SLOW_WINDOW_MIN_CHECKS);

/** A history that produces a drift: an anchor at `anchorMs`, then a full window at `windowMs`. */
function withDrift(anchorMs: number, windowMs: number) {
  const checks = checksOn(
    [...run(0, ANCHOR_RUN), ...WINDOW_DAYS_USED],
    [...same(ANCHOR_RUN, anchorMs), ...same(SLOW_WINDOW_MIN_CHECKS, windowMs)],
  );
  return { checks, asOf: iso(BASE + AS_OF_DAY * DAY) };
}

describe("the anchor", () => {
  it("is this athlete's first checks and does not move when more arrive", () => {
    const a = withDrift(300, 340);
    const first = slowChannelDrift(a.checks, a.asOf);
    expect("driftMs" in first).toBe(true);
    if (!("driftMs" in first)) return;

    // Twenty more checks at a quite different level, appended between the anchor and the window.
    // The anchor is the FIRST twenty eligible post-burn-in checks, so it must come back as the
    // same milliseconds on the same dates.
    const later = checksOn(
      [...run(0, ANCHOR_RUN), ...run(ANCHOR_RUN, 20), ...WINDOW_DAYS_USED],
      [...same(ANCHOR_RUN, 300), ...same(20, 500), ...same(SLOW_WINDOW_MIN_CHECKS, 340)],
    );
    const after = slowChannelDrift(later, a.asOf);
    expect("driftMs" in after).toBe(true);
    if (!("driftMs" in after)) return;
    expect(after.anchor.medianMs).toBe(first.anchor.medianMs);
    expect(after.anchor.fromDate).toBe(first.anchor.fromDate);
    expect(after.anchor.toDate).toBe(first.anchor.toDate);
    // The recorded dates are the anchor's own first and last, which is what makes "when was this
    // athlete's normal established" answerable -- the question a frozen anchor invites.
    expect(first.anchor.checks).toBe(SLOW_ANCHOR_CHECKS);
    expect(first.anchor.fromDate).toBe(iso(BASE + BURN * DAY));
    expect(first.anchor.toDate).toBe(iso(BASE + (BURN + SLOW_ANCHOR_CHECKS - 1) * DAY));
    expect(first.anchor.toDate > first.anchor.fromDate).toBe(true);
  });

  it("drops the burn-in from the old end, so a practice curve is never the normal", () => {
    // The burn-in checks are wildly fast; if they reached the anchor the anchor's median would
    // sit below 300.
    const checks = checksOn(
      [...run(0, ANCHOR_RUN), ...WINDOW_DAYS_USED],
      [...same(BURN, 100), ...same(SLOW_ANCHOR_CHECKS, 300), ...same(SLOW_WINDOW_MIN_CHECKS, 300)],
    );
    const d = slowChannelDrift(checks, iso(BASE + AS_OF_DAY * DAY));
    expect("driftMs" in d).toBe(true);
    if (!("driftMs" in d)) return;
    expect(d.anchor.medianMs).toBe(300);
  });

  it("never shares a reading with the window", () => {
    const a = withDrift(300, 340);
    const d = slowChannelDrift(a.checks, a.asOf);
    expect("driftMs" in d).toBe(true);
    if (!("driftMs" in d)) return;
    expect(d.anchor.toDate < d.window.from).toBe(true);
    // And the arithmetic proves it: an anchor that leaked into the window would pull the drift
    // toward zero, so the full 40ms separation is itself the disjointness check.
    expect(d.driftMs).toBeCloseTo(40, 6);
  });

  it("refuses an anchor that would sit INSIDE the window, which is every athlete's first weeks", () => {
    // A brand-new athlete checking every morning: fifty-two consecutive days, asked on the last.
    // The window opens forty-five days back, so only the first few checks are outside it and the
    // athlete's "first twenty" would be mostly readings the window also uses. Unguarded, the
    // drift becomes partly a number minus itself -- the coupling that killed the ACWR -- and it
    // reads as a confident near-zero rather than as an absence.
    const n = BURN + SLOW_ANCHOR_CHECKS + SLOW_WINDOW_MIN_CHECKS;
    const checks = checksOn(run(0, n), same(n, 300));
    const asOf = iso(BASE + (n - 1) * DAY);
    const d = slowChannelDrift(checks, asOf);
    expect("absent" in d).toBe(true);
    if (!("absent" in d)) return;
    expect(d.absent).toContain(`of ${SLOW_ANCHOR_CHECKS} anchor checks before the window`);
    // And the count it reports is the checks genuinely outside the window, not the history's
    // size: the window opens SLOW_WINDOW_DAYS before the last day, and the burn-in comes off the
    // old end first.
    const outside = n - 1 - SLOW_WINDOW_DAYS - BURN;
    expect(d.absent.startsWith(`${outside} of`)).toBe(true);
  });

  it("counts only eligible checks", () => {
    const a = withDrift(300, 340);
    const ineligible = a.checks.map((c) => ({ ...c, eligible: false }));
    const d = slowChannelDrift(ineligible, a.asOf);
    expect("absent" in d).toBe(true);
    if (!("absent" in d)) return;
    expect(d.absent).toContain(`0 of ${SLOW_ANCHOR_CHECKS}`);
  });

  it("states a thin history rather than returning a number from four readings", () => {
    const checks = checksOn(run(0, BURN + 5), same(BURN + 5, 300));
    const d = slowChannelDrift(checks, iso(BASE + AS_OF_DAY * DAY));
    expect("absent" in d).toBe(true);
    if (!("absent" in d)) return;
    expect(d.absent).toContain("anchor checks before the window");
    expect(d.absent).toContain("frozen");
  });
});

describe("the window", () => {
  it("carries the fast channel's sign: positive is slower than this athlete's own anchor", () => {
    const up = withDrift(300, 340);
    const down = withDrift(300, 260);
    const slower = slowChannelDrift(up.checks, up.asOf);
    const faster = slowChannelDrift(down.checks, down.asOf);
    expect("driftMs" in slower && slower.driftMs > 0).toBe(true);
    expect("driftMs" in faster && faster.driftMs < 0).toBe(true);
  });

  it("refuses a window with too few checks, and says how many it had", () => {
    const thinDays = WINDOW_DAYS_USED.slice(1);
    const checks = checksOn(
      [...run(0, ANCHOR_RUN), ...thinDays],
      [...same(ANCHOR_RUN, 300), ...same(thinDays.length, 340)],
    );
    const d = slowChannelDrift(checks, iso(BASE + AS_OF_DAY * DAY));
    expect("absent" in d).toBe(true);
    if (!("absent" in d)) return;
    expect(d.absent).toBe(
      `${SLOW_WINDOW_MIN_CHECKS - 1} of ${SLOW_WINDOW_MIN_CHECKS} checks in the last ${SLOW_WINDOW_DAYS} days`,
    );
  });

  it("ignores checks after the day it is asked about", () => {
    const a = withDrift(300, 340);
    // Enough later checks, far enough out and far enough off, that including them would move both
    // the window's median and its count. A single stray would not, which is how a window that
    // ignores `asOf` passes a weaker fixture.
    const laterDays = run(AS_OF_DAY + 1, SLOW_WINDOW_MIN_CHECKS);
    const future = [...a.checks, ...checksOn(laterDays, same(laterDays.length, 900))];
    const d = slowChannelDrift(future, a.asOf);
    expect("driftMs" in d).toBe(true);
    if (!("driftMs" in d)) return;
    expect(d.window.medianMs).toBe(340);
    expect(d.window.checks).toBe(SLOW_WINDOW_MIN_CHECKS);
    expect(d.window.to).toBe(a.asOf);
  });
});

describe("the cohort", () => {
  const cohort = (n: number, drift: (i: number) => number, load: (i: number) => number | null): SlowCohortEntry[] =>
    Array.from({ length: n }, (_, i) => ({ athleteId: i + 1, driftMs: drift(i), loadAu: load(i) }));

  it("refuses a cohort under the measured floor, and names it", () => {
    const r = slowChannelCohort(cohort(SLOW_COHORT_MIN - 1, (i) => i, () => 100));
    expect("absent" in r).toBe(true);
    if (!("absent" in r)) return;
    expect(r.absent).toContain(`${SLOW_COHORT_MIN - 1} of ${SLOW_COHORT_MIN}`);
  });

  it("scores at the floor", () => {
    const r = slowChannelCohort(cohort(SLOW_COHORT_MIN, (i) => (i % 7) - 3, () => 100));
    expect("kind" in r).toBe(true);
    if (!("kind" in r)) return;
    expect(r.cohort).toBe(SLOW_COHORT_MIN);
    expect(r.scores).toHaveLength(SLOW_COHORT_MIN);
  });

  it("keeps the load-regressed residual when the load explains the drift", () => {
    // Drift is load plus a little noise: regressing on load leaves almost nothing, the cohort
    // median leaves the whole load spread.
    const r = slowChannelCohort(cohort(SLOW_COHORT_MIN, (i) => i + (i % 3), (i) => i));
    expect("kind" in r).toBe(true);
    if (!("kind" in r)) return;
    expect(r.form).toBe("load_regressed");
  });

  it("keeps the cohort-median residual when the load explains nothing", () => {
    // Load is pure noise against a drift that does not follow it, so the regression can only add
    // spread. This is the football case measured in form_by_sport.py.
    const drifts = [1, -1, 3, -3, 2, -2, 5, -5];
    const loads = [7, 2, 9, 1, 4, 8, 3, 6];
    const r = slowChannelCohort(
      cohort(SLOW_COHORT_MIN, (i) => drifts[i % drifts.length], (i) => loads[(i * 3) % loads.length]),
    );
    expect("kind" in r).toBe(true);
    if (!("kind" in r)) return;
    expect(r.form).toBe("cohort_median");
  });

  it("centres on the cohort, so the median athlete scores near zero and an outlier scores high", () => {
    const entries = cohort(SLOW_COHORT_MIN, (i) => (i % 5) - 2, () => 100);
    const loud = [...entries.slice(0, -1), { athleteId: 999, driftMs: 500, loadAu: 100 }];
    const r = slowChannelCohort(loud);
    expect("kind" in r).toBe(true);
    if (!("kind" in r)) return;
    const byId = new Map(r.scores.map((s) => [s.athleteId, s.z]));
    expect(Math.abs(byId.get(1) ?? 99)).toBeLessThan(2);
    expect(byId.get(999) ?? 0).toBeGreaterThan(10);
  });

  it("imputes a missing load to the cohort's median and SAYS so on that athlete's row", () => {
    const entries = cohort(SLOW_COHORT_MIN, (i) => (i % 5) - 2, (i) => (i === 3 ? null : 100));
    const r = slowChannelCohort(entries);
    expect("kind" in r).toBe(true);
    if (!("kind" in r)) return;
    const imputed = r.scores.filter((s) => s.loadImputed).map((s) => s.athleteId);
    expect(imputed).toEqual([4]);
  });

  it("refuses a cohort with no spread rather than dividing by zero", () => {
    const r = slowChannelCohort(cohort(SLOW_COHORT_MIN, () => 12, () => 100));
    expect("absent" in r).toBe(true);
    if (!("absent" in r)) return;
    expect(r.absent).toContain("no spread");
  });

  it("drops an entry with no drift rather than counting it toward the floor", () => {
    const entries = [
      ...cohort(SLOW_COHORT_MIN - 1, (i) => (i % 5) - 2, () => 100),
      { athleteId: 9999, driftMs: Number.NaN, loadAu: 100 },
    ];
    const r = slowChannelCohort(entries);
    expect("absent" in r).toBe(true);
  });
});

describe("what the measurements rest on", () => {
  const src = readFileSync(join(__dirname, "anvil-slow-channel.ts"), "utf8");

  it("names the script behind every number it ships", () => {
    for (const script of ["randomanchor.py", "countanchor.py", "ownsigma.py", "cohortfloor.py", "formrule.py"]) {
      expect(src).toContain(script);
    }
  });

  it("states the cohort floor as the worst draw and not the mean", () => {
    // The trap the floor exists for: a cohort of six has a respectable MEAN clean rate and a
    // worst draw that flags every clean athlete in it. If the comment ever reads as though the
    // mean were the basis, the number is indefensible.
    expect(src).toContain("worst draw");
    expect(SLOW_COHORT_MIN).toBe(90);
  });

  it("does not reuse the fast channel's finite-sample correction on a cohort", () => {
    // `madCorrectionFor` is keyed on a BASELINE's length, measured for that estimator. Applying it
    // to a cohort's size would be a correction measured for one thing used on another -- which is
    // the shape CLAUDE.md records as a constant fitted on one lift reaching a different one.
    // The IMPORT CLAUSE, not the prose: this file's own comment names both on purpose, to say why
    // they are not used, so scanning the whole source would be satisfied by the explanation.
    const clause = src.slice(src.indexOf("import {"), src.indexOf('from "./anvil-baseline"'));
    expect(clause).not.toContain("madCorrectionFor");
    expect(clause).not.toContain("robustSigma");
    expect(clause).toContain("BASELINE_BURN_IN_CHECKS");
  });
});
