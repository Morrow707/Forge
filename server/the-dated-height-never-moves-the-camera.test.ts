import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import {
  growthVelocity,
  heightAskDue,
  MIN_GROWTH_SPAN_DAYS,
  MAX_GROWTH_SPAN_DAYS,
  HEIGHT_ASK_CADENCE_DAYS,
} from "../shared/anvil-growth";
import { growthReading } from "../shared/anvil-athlete-state";
import { ANVIL_SIGNALS, signalsForChannel, NOT_AN_ANVIL_SIGNAL } from "../shared/anvil-inputs";
import {
  BESIDE_IN_ORDER,
  BESIDE_THE_WEEK_NOT_THE_MORNING,
  besideLine,
  weekBeside,
  type AnvilDayContext,
} from "../shared/anvil-day-context";
import { recordAthleteHeightSchema } from "../shared/schema";

/**
 * THE RATCHET FOR THE DATED HEIGHT, AND THE RULE IT EXISTS FOR IS THE CAMERA ONE.
 *
 * `athlete_heights` was added so the Anvil's growth signal has an input. The hazard it creates is
 * not in the Anvil: it is that Forge now holds a SERIES of heights beside the single
 * `users.height_in` that the camera's height ruler divides by. Two things must stay true, and
 * neither announces itself if it stops:
 *
 *   1. NO CAMERA PATH READS THE SERIES. `HEIGHT_RULER_UNCERTAINTY` is the heaviest lever on two of
 *      the three lifts under test, and the day `heightIn` first reached the admin account it moved
 *      eight numbers at once -- the rep gates included. A ruler that started reading a dated height
 *      would re-scale every take silently and would make a capture's scale depend on when somebody
 *      last answered a monthly question.
 *   2. `users.height_in` KEEPS ONE WRITER. It is written by signup and by the profile edit. A
 *      weigh-in-shaped surface writing it too would be a fact with two writers, which is the
 *      billing sweep's whole lesson, AND would move the camera's scale from a screen that says
 *      nothing about the camera.
 *
 * STATED AS WHAT IS FORBIDDEN and discovered from the directories, never as a list of the files
 * that exist today: a list cannot fail for a tracker written next year, which is the assertion
 * direction this repo has had to relearn at least nine times.
 */

const ROOT = join(import.meta.dirname ?? __dirname, "..");

/**
 * LINE-AWARE COMMENT STRIP. The two-regex form this repo recommends elsewhere deleted 413,000 of
 * `routes.ts`'s 734,000 characters -- a non-greedy block match pairs a `/*` inside a string with
 * the next real closer thousands of lines away, and the end-of-line pass then eats the tail of
 * every line holding a URL. On a big file that silently empties the haystack, which reads as "the
 * code is clean".
 */
function strip(src: string): string {
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
    if (t.startsWith("//") || t.startsWith("*")) {
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
      if (c === '"') dq++;
      else if (c === "'") sq++;
      else if (c === "`") bt++;
      else if (c === "/" && line[i + 1] === "/" && dq % 2 === 0 && sq % 2 === 0 && bt % 2 === 0) {
        cut = i;
        break;
      }
    }
    out.push(cut === -1 ? line : line.slice(0, cut));
  }
  return out.join("\n");
}

function read(...parts: string[]): string {
  return strip(readFileSync(join(ROOT, ...parts), "utf8"));
}

function filesUnder(dir: string, match: (name: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(join(ROOT, d))) {
      const rel = `${d}/${name}`;
      if (statSync(join(ROOT, rel)).isDirectory()) {
        walk(rel);
        continue;
      }
      if (match(name)) out.push(rel);
    }
  };
  walk(dir);
  return out;
}

/**
 * THE BODY OF A FUNCTION OR METHOD NAMED `name`, bounded by MATCHING ITS OWN BRACES.
 *
 * Never a character window, and never "the next `{` after the name" either: a `Promise<{ ... }>`
 * return type and a `params: { ... }` parameter type each swallow that, and what comes back is a
 * type annotation -- which holds the identifiers a forbidden-token check looks for and none of the
 * code, so the check reds on correct source. The signature's parens are matched first.
 */
function bodyOf(src: string, name: string): string | null {
  const at = src.indexOf(`${name}(`);
  if (at === -1) return null;
  let i = src.indexOf("(", at);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") {
      depth--;
      if (depth === 0) break;
    }
  }
  const open = src.indexOf("{", i);
  if (open === -1) return null;
  depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) return src.slice(open, j + 1);
    }
  }
  return null;
}

const DATED_HEIGHT_TOKENS = [
  "athleteHeights",
  "athlete_heights",
  "datedHeightsCm",
  "growthVelocity",
  "/api/athlete/heights",
];

describe("the dated height feeds the Anvil and never the camera", () => {
  // ---------------------------------------------------------------- rule 1
  it("is read by no camera file, discovered from the directories", () => {
    const cameraFiles = [
      ...filesUnder("client/src/lib", (n) => n.endsWith("-tracking.ts") && !n.includes(".test.")),
      ...filesUnder(
        "client/src/components",
        (n) => n.includes("tracker-dialog") && n.endsWith(".tsx") && !n.includes(".test."),
      ),
      "client/src/lib/pose-tracking.ts",
      "shared/camera-tunables-by-lift.ts",
      "shared/tracker-arbiter.ts",
    ];
    // The scope has to be non-empty or this case certifies nothing, which is the shape that let a
    // camera ratchet pass on a bare literal in 2026-10-20.
    expect(cameraFiles.length).toBeGreaterThan(10);

    const offenders: string[] = [];
    for (const f of cameraFiles) {
      const src = read(f);
      for (const token of DATED_HEIGHT_TOKENS) {
        if (src.includes(token)) offenders.push(`${f} mentions ${token}`);
      }
    }
    expect(
      offenders,
      "A camera file reads the dated height series. The height ruler divides by users.height_in, " +
        "a single value a person edits on purpose; a series would re-scale every take whenever " +
        "somebody answered a monthly question, and nothing on a capture would say so.",
    ).toEqual([]);
  });

  it("leaves the camera's own height ruler reading the profile column", () => {
    // The PREMISE this rests on, so the case above cannot pass by the ruler having moved to
    // something else entirely. If this ever fails the rule above needs rewriting, not deleting.
    const bar = read("client/src/lib/bar-tracking.ts");
    expect(bar).toMatch(/heightIn/);
  });

  // ---------------------------------------------------------------- rule 2
  it("never writes users.heightIn from a function that touches the height series", () => {
    const storage = read("server/storage.ts");
    const offenders: string[] = [];
    for (const method of ["getAthleteHeights", "recordAthleteHeight", "deleteAthleteHeight"]) {
      const body = bodyOf(storage, method);
      expect(body, `${method} not found -- the bounding is wrong`).not.toBeNull();
      // `users` must not appear at all: a read of the profile row here would be the first step
      // toward writing it, and these three need nothing from it.
      if (/\busers\b/.test(body!)) offenders.push(`${method} references the users table`);
    }
    expect(
      offenders,
      "A dated-height method touches the users table. users.height_in has one writer (signup and " +
        "the profile edit) and it is what the camera's ruler divides by.",
    ).toEqual([]);
  });

  it("writes the height series from exactly one storage method", () => {
    const storage = read("server/storage.ts");
    const inserts = [...storage.matchAll(/\.insert\(athleteHeights\)/g)].length;
    expect(
      inserts,
      "A second writer of athlete_heights. One answer per athlete per day is enforced by an upsert " +
        "on the unique index, and a plain insert elsewhere would throw on the correction path.",
    ).toBe(1);
  });

  it("keeps the two height columns apart in the declaration", () => {
    // users.height_in is a fact about the person and is declared as one; the SERIES is only ever
    // read as a rate. Both halves are in NOT_AN_ANVIL_SIGNAL or ANVIL_SIGNALS, and the one that
    // would be wrong is the dated column being read as a signal of its own.
    expect(NOT_AN_ANVIL_SIGNAL["athlete_heights.heightIn"]).toBeDefined();
    // The table contributes a DERIVED rate and no raw column. Asserting the shape rather than the
    // absence of one spelling, because the compiler can prove a string literal mismatch and then
    // the case says nothing -- it has to be a property of whatever signals the table declares.
    const onTable = ANVIL_SIGNALS.filter((s) => s.table === "athlete_heights");
    expect(onTable).toHaveLength(1);
    expect(onTable[0].column.startsWith("derived:")).toBe(true);
  });

  // ---------------------------------------------------------------- the signal
  it("declares the growth rate as an exclusion, so no channel can take it as arithmetic", () => {
    const signal = ANVIL_SIGNALS.find((s) => s.id === "growth_velocity");
    expect(signal).toBeDefined();
    expect(signal!.channel).toBe("exclusion");
    expect(signal!.unit).toBe("cm/yr");
    // Behaviour, not the field: the three channels must not list it.
    for (const channel of ["fast", "slow", "career"] as const) {
      expect(signalsForChannel(channel).some((s) => s.id === "growth_velocity")).toBe(false);
    }
    expect(signalsForChannel("exclusion").some((s) => s.id === "growth_velocity")).toBe(true);
  });

  // ---------------------------------------------------------------- where it renders
  it("is a week-shaped reading and never competes for a morning's five slots", () => {
    expect(BESIDE_THE_WEEK_NOT_THE_MORNING.growth_velocity).toBeDefined();
    expect(BESIDE_IN_ORDER).not.toContain("growth_velocity");

    // DRIVEN, not scanned. A scan over `besideLine` can only see the words the filter is written
    // with, never which way it goes -- the form-check-destination lesson.
    //
    // THE FILTER INSIDE `besideLine` IS BELT AND THE CASE BELOW IS BRACES, AND WHICH ONE IS LOAD-
    // BEARING TODAY IS WORTH SAYING: removing the filter changes nothing observable, because
    // `besideLine` walks BESIDE_IN_ORDER and growth is not in it, so this assertion passes either
    // way. The live guard is the disjointness case below -- somebody adding `growth_velocity` to
    // the order list (a reasonable-looking way to "make it render") is the real mutation, and that
    // is what reds. The filter stays because it is what makes the two lists safe to hold at once.
    const context: AnvilDayContext = {
      date: "2026-11-08",
      coverage: [],
      beside: [
        { signalId: "growth_velocity", label: "growth velocity", unit: "cm/yr", value: 7.4 },
        { signalId: "sleep_hours", label: "sleep hours", unit: "hours", value: 7.8 },
      ],
      fixable: [],
    };
    const line = besideLine(context);
    expect(line).toContain("sleep hours");
    expect(line, "a week-shaped reading was drawn on a morning's line").not.toContain("growth velocity");
    expect(weekBeside([context]).map((b) => b.signalId)).toEqual(["growth_velocity"]);
  });

  it("keeps the day's order list and the week's map disjoint", () => {
    // THE LIVE GUARD. A signal in both lists would be drawn twice -- once competing for one of a
    // morning's five slots and once per athlete -- and the five-slot version is the one that would
    // silently push sleep or soreness off the line.
    const both = BESIDE_IN_ORDER.filter((id) => id in BESIDE_THE_WEEK_NOT_THE_MORNING);
    expect(
      both,
      "A signal is declared both as a morning field and as a week-shaped reading. Pick one: the " +
        "order list says where a DAY field goes, the week map says it is not a day field at all.",
    ).toEqual([]);
    // And every week-shaped id must carry a reason, like the five in NOT_BESIDE_THE_MORNING.
    for (const [id, why] of Object.entries(BESIDE_THE_WEEK_NOT_THE_MORNING)) {
      expect(why.length, `${id} needs a real reason, not a placeholder`).toBeGreaterThan(60);
    }
  });

  it("says a week-shaped reading once for a week, taking the newest answer", () => {
    const day = (date: string, value: number): AnvilDayContext => ({
      date,
      coverage: [],
      beside: [{ signalId: "growth_velocity", label: "growth velocity", unit: "cm/yr", value }],
      fixable: [],
    });
    const out = weekBeside([day("2026-11-02", 6.1), day("2026-11-08", 7.4)]);
    expect(out).toHaveLength(1);
    expect(out[0].value, "a height recorded mid-window must be reflected, not averaged away").toBe(7.4);
  });

  it("is not drawn on the athlete's own Anvil page, which is a decision", () => {
    // A growth rate is a sentence about a child's body, and this repo already refuses those: every
    // coaching line names a MOVEMENT, never a body part. It exists so a COACH does not misread a
    // flag; the athlete typed the height and cannot act on the rate.
    const athletePage = read("client/src/pages/anvil.tsx");
    expect(athletePage).not.toMatch(/weekBeside/);
    expect(athletePage).not.toMatch(/growth_velocity/);
  });

  // ---------------------------------------------------------------- the prompt
  it("asks for a height in exactly one place in the client", () => {
    const clientFiles = filesUnder("client/src", (n) => n.endsWith(".ts") || n.endsWith(".tsx")).filter(
      (f) => !f.includes(".test."),
    );
    const callers = clientFiles.filter((f) => /heightAskDue\(/.test(read(f)));
    expect(
      callers,
      "The monthly height prompt has more than one implementation. Two copies of a prompt is how a " +
        "correction reaches one surface and not the other -- the shape CLAUDE.md records nine times.",
    ).toEqual(["client/src/components/standing-height-panel.tsx"]);
  });

  it("does not put the prompt on any Anvil surface", () => {
    // The Anvil READS this series and must never collect it: a body measurement typed on the page
    // that shows a cognitive reading is the start of what "the camera measures the athlete and the
    // athlete never types a body measurement for it" exists to refuse.
    const anvilSurfaces = [
      "client/src/pages/anvil.tsx",
      "client/src/pages/coach/anvil-week.tsx",
      "client/src/components/anvil-daily-card.tsx",
      "client/src/components/anvil-athlete-panel.tsx",
      ...filesUnder("client/src/components/anvil", (n) => n.endsWith(".tsx")),
    ];
    for (const f of anvilSurfaces) {
      expect(read(f), `${f} draws the height prompt`).not.toMatch(/StandingHeightPanel/);
    }
  });

  // ---------------------------------------------------------------- the decisions, driven
  it("computes a velocity over the longest span its window allows", () => {
    const v = growthVelocity([
      { onIso: "2026-01-01", cm: 170 },
      { onIso: "2026-06-01", cm: 173 },
      { onIso: "2026-11-01", cm: 176 },
    ]);
    expect("cmPerYear" in v).toBe(true);
    if (!("cmPerYear" in v)) return;
    // Jan -> Nov, not Jun -> Nov: the oldest row inside the window, so the half-inch quantization
    // is divided by as many days as possible.
    expect(v.from).toBe("2026-01-01");
    expect(v.to).toBe("2026-11-01");
    expect(v.cmPerYear).toBeCloseTo((6 / 304) * 365.25, 6);
  });

  it("collapses all four of the module's absences to the one action a reader can take", () => {
    const cases = [
      [],
      [{ onIso: "2026-11-01", cm: 176 }],
      [
        { onIso: "2026-10-01", cm: 175 },
        { onIso: "2026-11-01", cm: 176 },
      ],
      [
        { onIso: "2020-01-01", cm: 160 },
        { onIso: "2026-11-01", cm: 176 },
      ],
    ];
    const absences = new Set<string>();
    for (const heights of cases) {
      const v = growthVelocity(heights);
      expect("absent" in v, `${JSON.stringify(heights)} should be absent`).toBe(true);
      if ("absent" in v) absences.add(v.absent);
      const r = growthReading(heights);
      expect("absent" in r).toBe(true);
      if ("absent" in r) expect(r.absent).toBe("needs_two_dated_heights");
    }
    // All four really are distinct upstream -- the collapse is a decision about the reader, not a
    // module that only ever returns one reason.
    expect(absences.size).toBe(4);
  });

  it("reads a velocity as a value once the series is long enough", () => {
    const r = growthReading([
      { onIso: "2026-05-01", cm: 170 },
      { onIso: "2026-11-01", cm: 176 },
    ]);
    expect(r).toEqual({ value: expect.any(Number) });
  });

  it("asks monthly and measures over months, which are two different numbers", () => {
    expect(HEIGHT_ASK_CADENCE_DAYS).toBeLessThan(MIN_GROWTH_SPAN_DAYS);
    expect(MIN_GROWTH_SPAN_DAYS).toBeLessThan(MAX_GROWTH_SPAN_DAYS);

    expect(heightAskDue([], "2026-11-08")).toEqual({ ask: true, because: "never_recorded" });
    expect(heightAskDue([{ onIso: "2026-10-01", cm: 176 }], "2026-11-08")).toEqual({
      ask: true,
      because: "due",
    });
    const fresh = heightAskDue([{ onIso: "2026-10-20", cm: 176 }], "2026-11-08");
    expect(fresh.ask).toBe(false);
    if (fresh.ask) return;
    expect(fresh.answeredOn).toBe("2026-10-20");
    expect(fresh.nextDueOn).toBe("2026-11-19");
  });

  it("asks off the NEWEST answer, not the first one", () => {
    const out = heightAskDue(
      [
        { onIso: "2020-01-01", cm: 150 },
        { onIso: "2026-11-05", cm: 176 },
      ],
      "2026-11-08",
    );
    expect(out.ask, "an old first answer must not keep the prompt down forever").toBe(false);
  });

  // ---------------------------------------------------------------- the range check
  it("refuses both halves of a missing digit", () => {
    expect(recordAthleteHeightSchema.safeParse({ date: "2026-11-08", heightIn: 7 }).success).toBe(false);
    expect(recordAthleteHeightSchema.safeParse({ date: "2026-11-08", heightIn: 700 }).success).toBe(false);
    expect(recordAthleteHeightSchema.safeParse({ date: "2026-11-08", heightIn: 70.5 }).success).toBe(true);
    // A ten-year-old at three feet and an eight-foot adult both pass, so the check is a typo
    // filter and not a claim about who may be measured.
    expect(recordAthleteHeightSchema.safeParse({ date: "2026-11-08", heightIn: 36 }).success).toBe(true);
    expect(recordAthleteHeightSchema.safeParse({ date: "2026-11-08", heightIn: 96 }).success).toBe(true);
    expect(recordAthleteHeightSchema.safeParse({ date: "not-a-date", heightIn: 70 }).success).toBe(false);
  });

  // ---------------------------------------------------------------- the strip
  it("strips comments, and the strip is DEFENSIVE today rather than load-bearing", () => {
    // SAID RATHER THAN IMPLIED, because mutation-testing it proved the honest answer: removing the
    // strip leaves all eighteen cases above green. No file any scan above reads currently writes a
    // forbidden token in a comment -- the camera files say nothing about the series, and the two
    // places that DO explain these rules in prose (`standing-height-panel.tsx` and this file) are
    // not in any scanned set.
    //
    // It stays because the next case added will not know that, and because the failure it prevents
    // is this repo's most repeated self-inflicted one: prose about what the code no longer does is
    // indistinguishable from the code still doing it. So it is exercised directly, on an input
    // covering all three of its passes, instead of being claimed on faith.
    const src = [
      "// athleteHeights datedHeightsCm",
      "/* growthVelocity",
      "   StandingHeightPanel */",
      'const ok = "kept";',
    ].join("\n");
    const out = strip(src);
    expect(out).not.toMatch(/athleteHeights|datedHeightsCm|growthVelocity|StandingHeightPanel/);
    expect(out).toMatch(/const ok = "kept";/);
  });
});
