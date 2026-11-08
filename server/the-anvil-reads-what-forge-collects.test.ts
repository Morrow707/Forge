import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ANVIL_SIGNALS, isPresent } from "@shared/anvil-inputs";
import { assembleAnvilState, type AnvilStateInput } from "@shared/anvil-athlete-state";
import {
  BESIDE_IN_ORDER,
  NOT_BESIDE_THE_MORNING,
  besideLine,
  coverageLine,
  dayContextFrom,
  fixableAcrossDays,
  fixableLine,
  formatBeside,
  readableUnit,
  signalLabel,
} from "@shared/anvil-day-context";
import { captureDeviceKeyFrom, captureWasRefused } from "@shared/anvil-capture-identity";

/**
 * THE DEFECT THIS FILE EXISTS FOR: `assembleAnvilState` HAD NO CALLER.
 *
 * `shared/anvil-inputs.ts` declares fifty-three signals across thirteen of Forge's tables and
 * `shared/anvil-athlete-state.ts` maps rows onto every one of them. Both shipped 2026-11-07 with
 * full unit coverage, and a grep across `server/`, `client/` and `shared/` found the mapping's own
 * declaration and two comments -- **no production caller at all**. So the signals reached no screen
 * and no page, and the one reading an athlete and a coach saw was the Anvil's own four tasks.
 *
 * Nothing announced it, which is the part worth keeping. The unit suite over the mapping was
 * thorough and green and is structurally blind to whether anybody calls it -- the same blindness
 * `strength-profile.itest.ts` had when it set `isForgeOfficial: true` on its own fixture row and
 * so could not see that nothing in the real library was ever flagged. A test that supplies the
 * input it is meant to be checking for cannot fail for the input being absent.
 *
 * And the agreement an adult ticks already promised it: "Forge also reads training information you
 * already give it -- logged sets, filmed lifts, sleep, soreness, your food log -- so that a change
 * in these numbers can be read beside what else was happening that week." A promise in a consent
 * document the code does not keep is the worst untrue sentence this repo can ship.
 *
 * SO THESE CASES STATE WHAT IS FORBIDDEN, and the first of them is the only one that would have
 * caught it: the mapping must have a caller, the caller must reach a route, and the route's answer
 * must reach both a screen and the printed page.
 *
 * SIX MUTATIONS, EACH CAUGHT BY THE RIGHT CASE: the route stops calling `fetchAnvilContext`; the
 * context loop filters `ANVIL_SIGNALS` down to one id instead of visiting it; a take with no
 * diagnostics reads as refused; the OS version joins the device key; the PDF stops printing the
 * line; and a remedy is written for `no_data`.
 *
 * **THE SIXTH IS THE ONE WORTH KEEPING.** Adding `no_data` to `ABSENCE_REMEDY` left every case
 * green on the first draft, because `assembleAnvilState` already keeps `no_data` out of
 * `fixableAbsences` -- so the sentence was unreachable through the real mapping and the case that
 * was meant to forbid it was asserting a property somebody else already guaranteed. It drives
 * `dayContextFrom` on a synthetic state now. A guard you cannot reach is a guard you cannot prove.
 *
 * **AND THE COMMENT STRIP IS LOAD-BEARING AND PROVEN, not assumed:** `dayContextFrom`'s own
 * comment names three signal ids on purpose, so the "no list of its own" case goes red with the
 * strip removed and green with it in -- the failure this repo calls its most repeated
 * self-inflicted one, demonstrated in the file that would suffer from it.
 */

const SERVER = join(import.meta.dirname, "..", "server");
const CLIENT = join(import.meta.dirname, "..", "client", "src");
const SHARED = join(import.meta.dirname, "..", "shared");

/**
 * LINE-AWARE COMMENT STRIP. The two-regex form this repo recommends for short files destroys long
 * ones -- a non-greedy block-comment regex pairs an opener inside a string with the next real
 * closer thousands of lines away, measured at 413,000 of `routes.ts`'s 734,000 characters deleted
 * silently. A block comment counts only when its opener starts its line; an end-of-line comment is
 * cut only where the quotes before `//` are balanced.
 */
function stripComments(src: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of src.split("\n")) {
    const t = line.trimStart();
    if (inBlock) {
      out.push("");
      if (t.includes("*/")) inBlock = false;
      continue;
    }
    if (t.startsWith("/*")) {
      out.push("");
      if (!t.includes("*/")) inBlock = true;
      continue;
    }
    if (t.startsWith("//")) {
      out.push("");
      continue;
    }
    let cut = -1;
    let dq = 0;
    let sq = 0;
    let bt = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const c = line[i];
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === '"') dq ^= 1;
      else if (c === "'") sq ^= 1;
      else if (c === "`") bt ^= 1;
      else if (c === "/" && line[i + 1] === "/" && !dq && !sq && !bt) {
        cut = i;
        break;
      }
    }
    out.push(cut === -1 ? line : line.slice(0, cut));
  }
  return out.join("\n");
}

function read(...parts: string[]): string {
  return stripComments(readFileSync(join(...parts), "utf8"));
}

/** A day with a check-in, a clean capture, a food log and a weigh-in. */
function fullDay(overrides: Partial<AnvilStateInput> = {}): AnvilStateInput {
  return {
    date: "2026-11-08",
    athlete: {
      dateOfBirth: "1990-03-04",
      gender: "male",
      sport: "football",
      position: "linebacker",
      seasonPhase: "in_season",
      heightIn: 75,
      trackingOptOut: false,
    },
    wellness: {
      date: "2026-11-08",
      sleepHours: 5.2,
      soreness: 4,
      stress: 3,
      hydration: 3,
      mentalFocus: 2,
      bodyPainMap: ["left_knee"],
      restingHeartRate: null,
      hrv: null,
      respiratoryRate: null,
      bodyMass: null,
      heartRateRecovery: null,
    },
    healthEverConnected: false,
    captures: [
      {
        date: "2026-11-08",
        exerciseId: 7,
        setNumber: 1,
        deviceKey: "iPhone 15 Pro | wide | 1920x1080",
        refusedByPipeline: false,
        velocityLossPercent: 12,
        meanVelocityMps: 0.74,
        peakVelocityMps: 1.1,
        meanPowerWatts: 900,
        jumpHeightsCm: null,
        reactiveStrengthIndex: null,
        groundContactSeconds: null,
        rpe: 8,
      },
    ],
    modalDeviceKey: "iPhone 15 Pro | wide | 1920x1080",
    skills: [],
    testing: null,
    nutrition: { caloriesKcal: 2400, proteinG: 150, ironMg: 11, vitaminB12Mcg: 3, vitaminDMcg: 12 },
    bodyMassLbs: 205,
    datedHeightsCm: [],
    openInjuries: ["left_knee"],
    restrictedJointAngleDeg: null,
    caraTrainingMinutes: 62,
    trainingLoad: 11_400,
    sessionCompleted: true,
    importedVelocityMps: null,
    importedPowerWatts: null,
    seatIsParked: false,
    ...overrides,
  };
}

describe("the mapping has a production caller, which is the whole defect", () => {
  it("assembleAnvilState is called by production code outside its own module", () => {
    // THE ONE CASE THAT WOULD HAVE CAUGHT IT. Comments stripped, because the mapping's own
    // docblock explains at length why it had no caller and quotes its own name doing it -- which
    // is this repo's most repeated self-inflicted failure, in the file that documents the reason.
    const callers = [
      ["server/anvil-state-source.ts", read(SERVER, "anvil-state-source.ts")],
      ["server/anvil-report.ts", read(SERVER, "anvil-report.ts")],
      ["server/routes.ts", read(SERVER, "routes.ts")],
    ].filter(([, source]) => /assembleAnvilState\s*\(/.test(source as string));
    expect(
      callers.map(([path]) => path),
      "shared/anvil-athlete-state.ts maps fifty-three declared signals and nothing called it for a " +
        "day. A mapping with no caller is a promise in the Anvil's agreement that the code does not keep.",
    ).not.toEqual([]);
  });

  it("the caller's answer reaches a route, a screen and the printed page", () => {
    const routes = read(SERVER, "routes.ts");
    expect(routes, "the context never reaches an HTTP answer").toMatch(/fetchAnvilContext\s*\(/);
    expect(routes, "the week is assembled and the context is never attached to it").toMatch(
      /attachDayContext\s*\(/,
    );

    const report = read(SERVER, "anvil-report.ts");
    // THE PRINTED PAGE IS THE ONE THAT OUTLIVES THE SCREEN. A coach forwards the PDF; whatever is
    // only on screen is gone the moment they close the tab.
    expect(report, "the PDF prints a morning with none of the week's own facts beside it").toMatch(
      /besideLine\s*\(/,
    );

    const coachWeek = read(CLIENT, "pages", "coach", "anvil-week.tsx");
    expect(coachWeek, "the coach's week draws no context").toMatch(/besideLine\s*\(/);
    // ONCE PER ATHLETE, NEVER ONCE PER MORNING. Both the page and the paper must group the
    // blanks; drawing `fixable` straight off a day is the twenty-thousand-pixel wall of amber
    // that looking at the real page found.
    for (const [name, source] of [
      ["the coach's week", coachWeek],
      ["the PDF", report],
    ] as const) {
      expect(source, `${name} groups the blanks`).toMatch(/fixableAcrossDays\s*\(/);
      expect(
        source,
        `${name} draws a day's own fixable list, which repeats the same sentence every morning`,
      ).not.toMatch(/\.context\??\.fixable/);
    }
    const athlete = read(CLIENT, "pages", "anvil.tsx");
    expect(athlete, "the athlete cannot see what Forge has about their own morning").toMatch(
      /besideLine\s*\(/,
    );
  });

  it("dayContextFrom visits the declaration rather than a list of signal names", () => {
    // DISCOVERED, NEVER ENUMERATED. A record literal of the signals it carries would silently omit
    // a signal added to `ANVIL_SIGNALS` next year, and the omission would look exactly like a
    // signal the day had no value for -- which is the absence this whole module exists to make
    // different from a blank.
    const source = read(SHARED, "anvil-day-context.ts");
    expect(source, "the context must iterate ANVIL_SIGNALS").toMatch(
      /for\s*\(\s*const\s+\w+\s+of\s+ANVIL_SIGNALS\s*\)/,
    );
    // AND IT MUST NOT CARRY A LIST OF ITS OWN. The only signal ids spelled in that module are the
    // five it EXCLUDES and the presentation order -- both of which this file holds against the
    // declaration -- so a hard-coded roster of what to include cannot hide in it.
    const spelled = new Set(Array.from(source.matchAll(/"([a-z0-9_]{4,})"/g)).map((m) => m[1]));
    const declaredIds = new Set<string>(ANVIL_SIGNALS.map((x) => x.id));
    const allowed = new Set([...Object.keys(NOT_BESIDE_THE_MORNING), ...BESIDE_IN_ORDER]);
    for (const id of spelled) {
      if (!declaredIds.has(id)) continue;
      expect(
        allowed.has(id),
        `${id} is spelled in anvil-day-context.ts outside the exclusion list and the reading order`,
      ).toBe(true);
    }
  });
});

describe("what a reader is shown beside a morning", () => {
  it("carries every present signal except the five that are facts about the person", () => {
    const context = dayContextFrom(assembleAnvilState(fullDay()));
    const ids = new Set(context.beside.map((b) => b.signalId));
    expect(ids.has("sleep_hours")).toBe(true);
    expect(ids.has("soreness")).toBe(true);
    expect(ids.has("training_load")).toBe(true);
    expect(ids.has("mean_velocity_mps")).toBe(true);
    expect(ids.has("calories_kcal")).toBe(true);
    expect(ids.has("injury")).toBe(true);
    // AND NOT ONE DEMOGRAPHIC. A date of birth printed on a page a coach forwards is a person's
    // identity riding along on a working document for no reason.
    for (const id of Object.keys(NOT_BESIDE_THE_MORNING)) {
      expect(ids.has(id), `${id} is not news about a week`).toBe(false);
    }
  });

  it("every excluded signal is a real declared signal with a real reason", () => {
    const declared = new Set<string>(ANVIL_SIGNALS.map((s) => s.id));
    for (const [id, why] of Object.entries(NOT_BESIDE_THE_MORNING)) {
      expect(declared.has(id), `${id} is not a declared signal`).toBe(true);
      expect(why.length, `${id} needs a reason, not a label`).toBeGreaterThan(40);
    }
  });

  it("every name in the reading order is a declared signal", () => {
    // The order is a PRESENTATION choice over whatever the day read, so a typo in it would simply
    // never render -- silently, for good. That is the shape `TRACKER_FOR_TRACKING_LEVEL` is held
    // exhaustive against the pgEnum for.
    const declared = new Set<string>(ANVIL_SIGNALS.map((s) => s.id));
    for (const id of BESIDE_IN_ORDER) {
      expect(declared.has(id), `${id} is in BESIDE_IN_ORDER and is not a declared signal`).toBe(true);
    }
  });

  it("reads the units the values are stored in and never rounds to a nicer number", () => {
    const context = dayContextFrom(assembleAnvilState(fullDay()));
    const line = besideLine(context);
    expect(line).toContain("sleep hours 5.2");
    expect(line).not.toContain("sleep hours 5.2 hours");
    expect(line).toContain("soreness 4");
    expect(line).not.toContain("sleep hours 5 ");
    expect(signalLabel("resting_heart_rate")).toBe("resting heart rate");
    expect(formatBeside({ signalId: "x", label: "session completed", unit: "none", value: true })).toBe(
      "session completed: yes",
    );
    expect(formatBeside({ signalId: "x", label: "injury", unit: "none", value: [] })).toBe("injury: none");
  });

  it("says an account-wide blank once, and a per-morning blank with its dates", () => {
    const connected = dayContextFrom(assembleAnvilState(fullDay({ healthEverConnected: false })));
    const otherPhone = dayContextFrom(
      assembleAnvilState(fullDay({ date: "2026-11-07", healthEverConnected: false, modalDeviceKey: "other" })),
    );
    const summary = fixableAcrossDays([connected, otherPhone]);

    const health = summary.find((f) => f.absent === "health_not_connected")!;
    // EVERY DAY, so no date list: "on every one of these days" is what its absence already means.
    expect(health.dates).toBeNull();
    // AND ONE SENTENCE FOR FIVE READINGS, which is the whole point.
    expect(health.labels.length).toBeGreaterThan(1);
    expect(fixableLine(health)).toContain(health.says);

    const capture = summary.find((f) => f.absent === "capture_not_comparable")!;
    expect(capture.dates).toEqual(["2026-11-07"]);
    expect(fixableLine(capture)).toContain("2026-11-07");
  });

  it("drops a unit that is a scale, or one the label already says", () => {
    // "soreness 2 1-5" reads as two numbers and "sleep hours 7.8 hours" says hours twice. Two
    // mechanical rules, never a per-signal table -- a table is a second place a name lives.
    expect(readableUnit("soreness", "1-5")).toBe("");
    expect(readableUnit("sleep hours", "hours")).toBe("");
    expect(readableUnit("hrv", "ms")).toBe("ms");
    expect(readableUnit("training load", "load units")).toBe("load units");
    expect(readableUnit("session completed", "none")).toBe("");
    const line = besideLine(dayContextFrom(assembleAnvilState(fullDay())));
    expect(line).toContain("soreness 4");
    expect(line).not.toContain("soreness 4 1-5");
    expect(line).not.toContain("hours hours");
  });

  it("states the coverage so a thin read is visible rather than looking like a quiet day", () => {
    const line = coverageLine(dayContextFrom(assembleAnvilState(fullDay())));
    // EVERY CHANNEL, present AND declared. A channel that said nothing and a channel that said
    // "fine" are different claims, and one number for both is how a broken gate and a correct
    // empty state come to look like the same pixels.
    expect(line).toMatch(/fast \d+\/\d+/);
    expect(line).toMatch(/slow \d+\/\d+/);
    expect(line).toMatch(/career \d+\/\d+/);
    expect(line).toMatch(/exclusion \d+\/\d+/);
    expect(line).toMatch(/context \d+\/\d+/);
  });
});

describe("the blanks somebody can close, and the ones they cannot", () => {
  it("names Health as never connected rather than as an empty cell", () => {
    const context = dayContextFrom(assembleAnvilState(fullDay({ healthEverConnected: false })));
    const hrv = context.fixable.find((f) => f.signalId === "hrv");
    expect(hrv, "HRV is blank because Health was never connected and nothing says so").toBeTruthy();
    expect(hrv!.absent).toBe("health_not_connected");
    expect(hrv!.says).toMatch(/Health/);
  });

  it("does not nudge about a day the athlete simply did not log", () => {
    // `no_data` is DELIBERATELY not a remedy. "They did not take a check-in" is a fact about a
    // day, not a fault in the app, and a sentence about it would sit beside every rest day every
    // athlete ever takes.
    const context = dayContextFrom(assembleAnvilState(fullDay({ wellness: null, healthEverConnected: true })));
    expect(context.fixable.map((f) => f.absent)).not.toContain("no_data");
    expect(context.beside.map((b) => b.signalId)).not.toContain("sleep_hours");

    // AND THE FILTER IS DRIVEN DIRECTLY, because the case above cannot see it.
    // `assembleAnvilState` already keeps `no_data` out of `fixableAbsences`, so a remedy written
    // for `no_data` is unreachable through it -- a mutation that adds one stayed green until this
    // assertion existed, which is the reason it does. `dayContextFrom` must drop an absence it has
    // no sentence for rather than render a blank one.
    const synthetic = dayContextFrom({
      date: "2026-11-08",
      readings: {},
      coverage: [],
      fixableAbsences: [
        { signalId: "sleep_hours", absent: "no_data" },
        { signalId: "hrv", absent: "health_not_connected" },
      ],
    });
    expect(synthetic.fixable.map((f) => f.signalId)).toEqual(["hrv"]);
  });

  it("says the capture came from another phone rather than withholding the reason too", () => {
    const day = fullDay({ modalDeviceKey: "iPhone 12 | wide | 1280x720" });
    const context = dayContextFrom(assembleAnvilState(day));
    expect(context.fixable.map((f) => f.absent)).toContain("capture_not_comparable");
    // THE EXPLANATION IS PRESENT WHILE THE NUMBERS ARE ABSENT, which is `captureDeviceReading`'s
    // own stated rule: "today's take was shot on a different phone" is the most useful sentence
    // this file can produce on a day whose numbers are withheld.
    expect(context.beside.map((b) => b.signalId)).toContain("capture_device");
    expect(context.beside.map((b) => b.signalId)).not.toContain("mean_velocity_mps");
  });

  it("says tracking is off, and the two absences are not the same word", () => {
    const optedOut = dayContextFrom(
      assembleAnvilState(fullDay({ athlete: { ...fullDay().athlete, trackingOptOut: true } })),
    );
    expect(optedOut.fixable.map((f) => f.absent)).toContain("tracking_opted_out");
    const notComparable = dayContextFrom(assembleAnvilState(fullDay({ modalDeviceKey: "other" })));
    expect(notComparable.fixable.map((f) => f.absent)).not.toContain("tracking_opted_out");
  });
});

describe("the two derivations the pure mapping refused, because they read a blob", () => {
  it("keys a device on model, lens and format and on nothing that changes with an update", () => {
    expect(
      captureDeviceKeyFrom({ deviceModel: "iPhone15,2", lens: "wide", activeFormat: "1920x1080@120" }),
    ).toBe("iPhone15,2 | wide | 1920x1080@120");
    // THE OS VERSION IS NOT IN THE KEY. A key that moved on a point release would make every
    // athlete's history incomparable with itself after an update, for no measurement reason.
    expect(captureDeviceKeyFrom({ deviceModel: "iPhone15,2", systemVersion: "26.1" })).toBe("iPhone15,2");
    expect(captureDeviceKeyFrom({ deviceModel: "iPhone15,2", systemVersion: "26.2" })).toBe("iPhone15,2");
    // Null for a blob naming none of the three, which `comparableCaptures` reads as comparable --
    // the direction that costs the athlete nothing.
    expect(captureDeviceKeyFrom(null)).toBeNull();
    expect(captureDeviceKeyFrom({})).toBeNull();
    expect(captureDeviceKeyFrom({ deviceModel: "   " })).toBeNull();
  });

  it("treats only the pipeline's own word for a clean take as a clean take", () => {
    expect(captureWasRefused({ outcome: "tracked" })).toBe(false);
    expect(captureWasRefused({ outcome: "empty_calibration_failed" })).toBe(true);
    expect(captureWasRefused({ outcome: "scale_free_only" })).toBe(true);
    expect(captureWasRefused({ outcome: "scale_suspect" })).toBe(true);
    // A TAKE WITH NO DIAGNOSTICS IS NOT REFUSED, and this is the case that matters most: null
    // means a hand-logged set or a camera set from before the blob existed. Reading it as a
    // refusal would silently discard the older half of every athlete's history.
    expect(captureWasRefused(null)).toBe(false);
    expect(captureWasRefused(undefined)).toBe(false);
    expect(captureWasRefused({})).toBe(false);
  });

  it("keeps the set's own numbers whatever it decides, which is Rule #1's half of this", () => {
    // Refusing a COMPARISON is not withholding a number. The set keeps its velocity, its row and
    // its clip; what changes is only whether the Anvil may hold it against this athlete's other
    // mornings, and the answer arrives as a stated absence with a sentence on it.
    const day = fullDay();
    day.captures[0].refusedByPipeline = true;
    const context = dayContextFrom(assembleAnvilState(day));
    const velocity = context.beside.find((b) => b.signalId === "mean_velocity_mps");
    expect(velocity, "a refused take must not contribute a compared velocity").toBeUndefined();
    expect(context.fixable.map((f) => f.absent)).toContain("capture_not_comparable");
    // And the state still carries a reading or a stated absence for every declared signal: never
    // an absent key.
    const state = assembleAnvilState(day);
    for (const signal of ANVIL_SIGNALS) {
      expect(state.readings[signal.id], `${signal.id} has no entry at all`).toBeTruthy();
    }
    expect(Object.values(state.readings).filter((r) => isPresent(r)).length).toBeGreaterThan(0);
  });
});
