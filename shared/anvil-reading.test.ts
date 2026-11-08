import { describe, it, expect } from "vitest";
import {
  FAST_CHANNEL_MIN_DAYS,
  fastChannelWeek,
  readCheck,
  readSeries,
  type AnvilRawCheck,
} from "./anvil-reading";
import { CORROBORATION_Z } from "./anvil-corroboration";
import { BASELINE_BURN_IN_CHECKS, BASELINE_MIN_CHECKS } from "./anvil-baseline";

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function check(over: Partial<AnvilRawCheck> = {}): AnvilRawCheck {
  return {
    date: "2026-11-07",
    takenAt: "2026-11-07T07:00:00Z",
    window: "in_window",
    trialsMs: Array.from({ length: 25 }, () => 250 + rnd() * 60),
    omissions: 0,
    rulesMissed: 1,
    sequenceBest: 5,
    tapCounts: [60, 62, 61],
    partsRun: ["reaction_time", "go_no_go", "sequence_span", "tapping"],
    ...over,
  };
}

/** n in-window checks centred on `centre`, oldest first. */
function history(n: number, centre = 270): AnvilRawCheck[] {
  return Array.from({ length: n }, (_, i) =>
    check({
      date: `2026-10-${String(i + 1).padStart(2, "0")}`,
      trialsMs: Array.from({ length: 25 }, () => centre + (rnd() - 0.5) * 50),
    }),
  );
}

describe("a check always produces its own numbers", () => {
  it("reports the median and every part, with no history at all", () => {
    const r = readCheck(check(), []);
    expect(r.numbers.medianMs).toBeGreaterThan(0);
    expect(r.numbers.trials).toBe(25);
    expect(r.numbers.rulesMissed).toBe(1);
    expect(r.numbers.sequenceBest).toBe(5);
    expect(r.numbers.tapCount).toBe(62); // best of three, per item 7
    expect(r.comparison.kind).toBe("learning");
  });

  it("says how far off a normal it is, rather than just refusing to compare", () => {
    const r = readCheck(check(), history(4));
    expect(r.comparison.kind).toBe("learning");
    if (r.comparison.kind === "learning") {
      expect(r.comparison.need).toBe(BASELINE_MIN_CHECKS);
      // Four checks, minus the one-check burn-in, is three toward a baseline.
      expect(r.comparison.have).toBe(4 - BASELINE_BURN_IN_CHECKS.reaction_time);
    }
  });

  it("compares once there are enough, and the band is a description", () => {
    const r = readCheck(check(), history(24));
    expect(r.comparison.kind).toBe("compared");
    if (r.comparison.kind === "compared") {
      expect(r.comparison.baselineChecks).toBeGreaterThanOrEqual(BASELINE_MIN_CHECKS);
      expect(r.comparison.bandLowMs).toBeLessThan(r.comparison.baselineMedianMs);
      expect(r.comparison.bandHighMs).toBeGreaterThan(r.comparison.baselineMedianMs);
      expect(r.comparison.lapseThresholdMs).toBeGreaterThan(r.comparison.baselineMedianMs);
    }
  });

  it("moves z the right way for a slow day and a fast one", () => {
    const h = history(24, 270);
    const slow = readCheck(check({ trialsMs: Array(25).fill(340) }), h);
    const fast = readCheck(check({ trialsMs: Array(25).fill(230) }), h);
    if (slow.comparison.kind === "compared" && fast.comparison.kind === "compared") {
      expect(slow.comparison.medianZ).toBeGreaterThan(2);
      expect(fast.comparison.medianZ).toBeLessThan(0);
    }
  });
});

describe("the window decides what joins a normal, never what is scored", () => {
  it("scores a LATE check against the normal but marks it out", () => {
    const r = readCheck(check({ window: "late" }), history(24));
    expect(r.outsideTheWindow).toBe(true);
    expect(r.comparison.kind, "a late check is still compared -- it is the athlete's own number").toBe(
      "compared",
    );
  });

  it("keeps late and practice checks OUT of the baseline", () => {
    // Twenty-four checks, all late: there is no normal to compare against, however many there are.
    const late = history(24).map((h) => ({ ...h, window: "late" as const }));
    expect(readCheck(check(), late).comparison.kind).toBe("learning");
    const practice = history(24).map((h) => ({ ...h, window: "practice" as const }));
    expect(readCheck(check(), practice).comparison.kind).toBe("learning");
  });

  it("marks a practice run as outside the window", () => {
    expect(readCheck(check({ window: "practice" }), history(24)).outsideTheWindow).toBe(true);
  });
});

describe("the burn-in and the no-spread case", () => {
  it("drops the burn-in from the OLD end of the history", () => {
    // Exactly enough once the burn-in is paid, and one short before it.
    const justEnough = BASELINE_MIN_CHECKS + BASELINE_BURN_IN_CHECKS.reaction_time;
    expect(readCheck(check(), history(justEnough)).comparison.kind).toBe("compared");
    expect(readCheck(check(), history(justEnough - 1)).comparison.kind).toBe("learning");
  });

  it("builds the normal from the RECENT checks, not the historical average", () => {
    // THE CASE A FLAT FIXTURE CANNOT WRITE. Reversing the history -- so the burn-in drops from the
    // NEW end and the window keeps the oldest twenty -- left every other case in this file green,
    // because a median over an identically-distributed sample is the same whichever end you take
    // it from. It only shows up against a TREND, which is what a real athlete's history has: the
    // practice curve runs downward through exactly the window the baseline is built in.
    //
    // Thirty checks ramping 400 -> 260. Taken correctly the window is the newest twenty and the
    // normal sits near the recent values; taken from the wrong end it is the oldest twenty and the
    // athlete is measured against a person they no longer are.
    const ramp = Array.from({ length: 30 }, (_, i) =>
      check({
        date: `2026-09-${String(i + 1).padStart(2, "0")}`,
        trialsMs: Array(25).fill(400 - i * (140 / 29)),
      }),
    );
    const r = readCheck(check(), ramp);
    expect(r.comparison.kind).toBe("compared");
    if (r.comparison.kind === "compared") {
      const recentHalf = 400 - 22 * (140 / 29); // around check 22 of 30
      const oldHalf = 400 - 8 * (140 / 29);
      expect(Math.abs(r.comparison.baselineMedianMs - recentHalf)).toBeLessThan(
        Math.abs(r.comparison.baselineMedianMs - oldHalf),
      );
      expect(r.comparison.baselineMedianMs).toBeLessThan(330);
    }
  });

  it("says no_spread rather than dividing by zero when every check is identical", () => {
    // An athlete whose last twenty medians agree to the millisecond means the timer is wrong,
    // not that they are superhumanly consistent. A z-score here would be infinite.
    const flat = Array.from({ length: 24 }, (_, i) =>
      check({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, trialsMs: Array(25).fill(270) }),
    );
    expect(readCheck(check(), flat).comparison.kind).toBe("no_spread");
  });

  it("handles a check whose part 4 was never run", () => {
    const r = readCheck(check({ tapCounts: null }), history(24));
    expect(r.numbers.tapCount).toBeNull();
    if (r.comparison.kind === "compared") expect(r.comparison.tapMoved).toBeNull();
  });
});

describe("a series is scored as it stood, never with hindsight", () => {
  it("scores each check against only the checks before it", () => {
    const series = [...history(24, 270), check()];
    const read = readSeries(series);
    expect(read).toHaveLength(25);
    // The early ones cannot be compared and the late ones can -- which is the whole property:
    // the first day of a second week has a thinner baseline than the last, and says so.
    expect(read[0].reading.comparison.kind).toBe("learning");
    expect(read[read.length - 1].reading.comparison.kind).toBe("compared");
    // And each one matches what readCheck returns on its own prefix, which is what "as it stood"
    // means. Asserted against the real function rather than re-derived here.
    for (const i of [5, 12, 24]) {
      expect(read[i].reading).toEqual(readCheck(series[i], series.slice(0, i)));
    }
  });

  it("never lets a later check change an earlier reading", () => {
    // THE CASE THE DOCBLOCK IS ABOUT. A reading an athlete saw on Tuesday has to stay true, so
    // appending Friday must leave Tuesday byte-identical. Scoring against the whole series --
    // the obvious implementation -- fails this.
    const series = history(24, 270);
    const tuesday = readSeries(series)[20].reading;
    const withMore = readSeries([...series, check({ trialsMs: Array(25).fill(500) })])[20].reading;
    expect(withMore).toEqual(tuesday);
  });
});

describe("the fast channel is one witness, and says so when it has none", () => {
  const compared = () => ({ reading: readCheck(check(), history(24, 270)) });

  it("needs three compared in-window days before it is a witness at all", () => {
    const two = fastChannelWeek([compared(), compared()]);
    expect("absent" in two).toBe(true);
    if ("absent" in two) expect(two.absent).toContain(`of ${FAST_CHANNEL_MIN_DAYS}`);
    expect("z" in fastChannelWeek([compared(), compared(), compared()])).toBe(true);
  });

  it("takes the median of the days and not the mean, so one morning cannot carry a week", () => {
    const h = history(24, 270);
    const ordinary = { reading: readCheck(check({ trialsMs: Array(25).fill(272) }), h) };
    const terrible = { reading: readCheck(check({ trialsMs: Array(25).fill(900) }), h) };
    const week = fastChannelWeek([ordinary, ordinary, ordinary, ordinary, terrible]);
    expect("z" in week).toBe(true);
    if ("z" in week) {
      // The mean of those five z-scores clears the corroboration threshold on its own; the
      // median does not, and that difference is the whole reason this is a median.
      expect(week.z).toBeLessThan(CORROBORATION_Z);
    }
  });

  it("leaves a late check and a practice run out of the week", () => {
    const h = history(24, 270);
    const late = { reading: readCheck(check({ window: "late" }), h) };
    const practice = { reading: readCheck(check({ window: "practice" }), h) };
    const week = fastChannelWeek([late, practice, compared(), compared(), compared()]);
    expect("z" in week).toBe(true);
    // Five readings in, three counted: the two outside the window are kept and shown elsewhere
    // and never vote. One more of either must still leave it a witness, not tip it over.
    const thin = fastChannelWeek([late, practice, compared(), compared()]);
    expect("absent" in thin).toBe(true);
  });
});
