import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  anvilRange,
  anvilRawCheck,
  assembleAnvilWeek,
  buildAnvilWeekPdf,
  dayLine,
  minutesLabel,
  verdictSentence,
} from "./anvil-report";
import { ANVIL_ACCURACY_CAVEAT, ANVIL_NOT_A_MEDICAL_TEST } from "@shared/anvil-agreement";
import { CORROBORATION_Z } from "@shared/anvil-corroboration";
import type { AnvilCheck } from "@shared/schema";

/**
 * THE PACKAGE AND THE PAPER, TESTED WITH NO POSTGRES.
 *
 * `server/anvil-report.ts` is deliberately pure -- rows in, a package out, a buffer out -- which
 * is what lets this be a `.test.ts` rather than an itest. The same argument
 * `the-reset-survives-an-unawaited-write.test.ts` makes: nobody should need a database running to
 * check that a coach's weekly line says the right thing.
 */

/**
 * THE LINE-AWARE COMMENT STRIP. Not the two-regex form CLAUDE.md records, which pairs a `/*`
 * inside a string with the next real `*\/` thousands of lines away and silently empties the
 * haystack -- 413,000 characters of routes.ts, once. A block comment counts only when its opener
 * starts its line; an end-of-line comment is cut only where the `//` has balanced quotes before
 * it.
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

let nextId = 1;
let seed = 11;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

function row(over: Partial<AnvilCheck> = {}): AnvilCheck {
  const date = (over.date as string) ?? "2026-11-07";
  return {
    id: nextId++,
    athleteId: 42,
    date,
    takenAt: new Date(`${date}T07:00:00Z`),
    window: "in_window",
    trialsMs: Array.from({ length: 25 }, () => 265 + (rnd() - 0.5) * 50),
    omissions: 0,
    rulesMissed: 1,
    goTrialsMs: null,
    sequenceBest: 5,
    tapCounts: [60, 63, 61],
    partsRun: ["reaction_time", "go_no_go", "sequence_span", "tapping"],
    timerResolutionMs: 1,
    createdAt: new Date(`${date}T07:00:00Z`),
    ...over,
  } as AnvilCheck;
}

/** `n` consecutive mornings ending the day before 2026-11-07, oldest first. */
function mornings(n: number): AnvilCheck[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.parse("2026-11-06T00:00:00Z") - (n - 1 - i) * 86_400_000);
    return row({ date: d.toISOString().slice(0, 10) });
  });
}

describe("the range is inclusive at both ends", () => {
  it("counts today as one of the days", () => {
    expect(anvilRange("2026-11-07", 7)).toEqual({ from: "2026-11-01", to: "2026-11-07" });
    expect(anvilRange("2026-11-07", 1)).toEqual({ from: "2026-11-07", to: "2026-11-07" });
  });

  it("crosses a month boundary without arithmetic of its own", () => {
    expect(anvilRange("2026-03-02", 7)).toEqual({ from: "2026-02-24", to: "2026-03-02" });
  });
});

describe("the week is scored on the whole history and reported for the range", () => {
  it("compares a day inside a one-week range using checks from before it", () => {
    // THE CASE THAT CATCHES THE TEMPTING SHORTCUT. Trimming the rows to the range before scoring
    // reads as the obvious thing and re-learns the athlete's normal from seven mornings, so
    // somebody who has taken it for a month would be told they are still "learning".
    const rows = [...mornings(30), row({ date: "2026-11-07" })];
    const week = assembleAnvilWeek(42, rows, anvilRange("2026-11-07", 7));
    expect(week.days).toHaveLength(7);
    for (const day of week.days) {
      expect(day.reading.comparison.kind).toBe("compared");
    }
  });

  it("marks the attempt that counts and keeps the one that does not", () => {
    const first = row({ date: "2026-11-07", takenAt: new Date("2026-11-07T06:10:00Z") });
    const second = row({ date: "2026-11-07", takenAt: new Date("2026-11-07T07:50:00Z") });
    const week = assembleAnvilWeek(42, [...mornings(25), first, second], anvilRange("2026-11-07", 7));
    const today = week.days.filter((d) => d.date === "2026-11-07");
    expect(today).toHaveLength(2);
    expect(today.find((d) => d.counts)!.id).toBe(first.id);
    expect(today.find((d) => !d.counts)!.id).toBe(second.id);
  });

  it("never asserts anything on one witness, and names the channels it is missing", () => {
    // The fast channel is a real witness here -- thirty mornings and a week of compared days --
    // and the verdict is still cannot_judge, because two of three is the rule. That is the whole
    // of Rule #4 applied to this surface and is the case that reds if somebody "simplifies" the
    // verdict to read the fast channel alone.
    const week = assembleAnvilWeek(42, mornings(30), anvilRange("2026-11-06", 7));
    expect("z" in week.fast).toBe(true);
    expect(week.verdict.kind).toBe("cannot_judge");
    if (week.verdict.kind === "cannot_judge") {
      expect(week.verdict.reason).toContain("slow");
      expect(week.verdict.reason).toContain("career");
      expect(week.verdict.available).toBe(1);
    }
    expect(week.channelsNotBuilt).toHaveLength(2);
  });

  it("only lets the counting attempt vote in the week", () => {
    // A retake is kept, shown, and gets no vote. Asserted on the WITNESS COUNT rather than on
    // the z, which is the version that works: the fast channel is a median, so feeding it five
    // extra 900 ms retakes beside twelve ordinary days leaves the median where it was and the
    // mutation survives. Here two days carry three attempts each -- two counting mornings, which
    // is under the three-day floor, against six rows if every attempt voted.
    const days = ["2026-11-07", "2026-11-08"];
    const rows = days.flatMap((date) => [
      row({ date, takenAt: new Date(`${date}T06:00:00Z`) }),
      row({ date, takenAt: new Date(`${date}T07:00:00Z`) }),
      row({ date, takenAt: new Date(`${date}T08:00:00Z`) }),
    ]);
    const week = assembleAnvilWeek(42, [...mornings(25), ...rows], {
      from: "2026-11-07",
      to: "2026-11-08",
    });
    expect(week.days).toHaveLength(6);
    expect(week.days.filter((d) => d.counts)).toHaveLength(2);
    expect(
      "absent" in week.fast,
      "six rows across two mornings is two witnesses, not six: a week that reads every attempt " +
        "lets somebody retake their way to a channel",
    ).toBe(true);
  });

  it("returns an empty week rather than a thrown one for somebody who took none", () => {
    const week = assembleAnvilWeek(42, [], anvilRange("2026-11-07", 7));
    expect(week.days).toEqual([]);
    expect("absent" in week.fast).toBe(true);
    expect(week.verdict.kind).toBe("cannot_judge");
  });
});

describe("the daily line states a number and never a verdict", () => {
  const dayOf = (rows: AnvilCheck[], date: string) =>
    assembleAnvilWeek(42, rows, anvilRange(date, 1)).days[0];

  it("says where the morning sat and how many trials were slow", () => {
    const line = dayLine(dayOf([...mornings(30), row({ date: "2026-11-07" })], "2026-11-07"));
    expect(line).toContain("2026-11-07");
    expect(line).toMatch(/\d+ ms/);
    expect(line).toMatch(/[+-]\d+\.\d\d SD vs own normal/);
    expect(line).toMatch(/slow trials?/);
  });

  it("says it is learning rather than printing a number it cannot support", () => {
    const line = dayLine(dayOf([row({ date: "2026-11-07" })], "2026-11-07"));
    expect(line).toContain("learning their normal");
    expect(line).not.toContain("SD");
    // AND IT STILL PRINTS WHAT WAS MEASURED. Rule #1: the comparison is what is withheld, never
    // the number, and a line with no milliseconds on it would be the refusal this forbids.
    expect(line).toMatch(/\d+ ms/);
  });

  it("names a late check and a practice run as what they are", () => {
    expect(dayLine(dayOf([row({ date: "2026-11-07", window: "late" })], "2026-11-07"))).toContain(
      "outside the morning window",
    );
    expect(
      dayLine(dayOf([row({ date: "2026-11-07", window: "practice" })], "2026-11-07")),
    ).toContain("practice run");
  });

  it("prints a check with no trials at all instead of dropping it", () => {
    const line = dayLine(dayOf([row({ date: "2026-11-07", trialsMs: [] })], "2026-11-07"));
    expect(line).toContain("no trials");
  });
});

describe("the week's one sentence", () => {
  it("tells a quiet week from one it cannot judge", () => {
    const cannot = verdictSentence({
      ...assembleAnvilWeek(42, [], anvilRange("2026-11-07", 7)),
    });
    expect(cannot).toContain("not enough to judge");
    const quiet = verdictSentence({
      ...assembleAnvilWeek(42, [], anvilRange("2026-11-07", 7)),
      verdict: { kind: "quiet", witnesses: ["fast", "slow"] },
    });
    expect(quiet).toContain("nothing stood out");
    // The two must not read alike: "nothing was wrong" and "nothing could be judged" being one
    // blank is the distinction the 2026-10-04 box jump lost.
    expect(quiet).not.toBe(cannot);
  });

  it("reports the weaker witness on a finding", () => {
    const sentence = verdictSentence({
      ...assembleAnvilWeek(42, [], anvilRange("2026-11-07", 7)),
      verdict: { kind: "finding", witnesses: ["fast", "career"], z: 2.31 },
    });
    expect(sentence).toContain("fast and career");
    expect(sentence).toContain("2.31");
    expect(sentence).toContain("weaker");
  });
});

describe("the printout", () => {
  it("is a PDF, and renders a roster with somebody who took none", async () => {
    const buf = await buildAnvilWeekPdf({
      coachName: "Coach Riley",
      generatedAt: new Date("2026-11-07T12:00:00Z"),
      week: {
        from: "2026-11-01",
        to: "2026-11-07",
        athletes: [
          {
            athleteId: 42,
            athleteName: "Jordan Reyes",
            week: assembleAnvilWeek(42, mornings(30), anvilRange("2026-11-06", 7)),
          },
          {
            athleteId: 43,
            athleteName: "Sam Okafor",
            week: assembleAnvilWeek(43, [], anvilRange("2026-11-06", 7)),
          },
        ],
        noChecks: [{ athleteId: 44, athleteName: "Ali Haddad" }],
      },
    });
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(2_000);
  });

  it("carries the caveat and the refusal by RENDERING the constants, never re-typing them", () => {
    // pdfkit writes standard-font runs as hex strings, so searching the buffer for a sentence is
    // not a test (see institutional-agreement-download.itest.ts on exactly that). What IS
    // checkable, and is the property worth holding, is that this module reads the two constants
    // rather than carrying its own wording -- a second copy would be a second thing for counsel
    // to review under question 18, and the vocabulary sweep over this file is what catches one.
    const src = readFileSync(join(import.meta.dirname, "anvil-report.ts"), "utf8");
    const body = stripComments(src);
    expect(body).toContain("ANVIL_ACCURACY_CAVEAT");
    expect(body).toContain("ANVIL_NOT_A_MEDICAL_TEST");
    expect(ANVIL_ACCURACY_CAVEAT.length).toBeGreaterThan(40);
    expect(ANVIL_NOT_A_MEDICAL_TEST.length).toBeGreaterThan(40);
    // The forbidden half. SAID RATHER THAN IMPLIED: the strip is INERT for this case today --
    // no comment in anvil-report.ts currently writes either sentence, so removing the strip
    // leaves this green. It stays because the next person to explain why the caveat is on the
    // paper will quote the sentence in a docblock, which is the shape that has cost this repo
    // four false results in one day. Exercised directly below instead of claimed on faith.
    expect(body.toLowerCase()).not.toContain("not a medical test");
    expect(body.toLowerCase()).not.toContain("concussion");
  });

  it("strips comments in all three forms, proven on input rather than on this file", () => {
    const src = [
      "/** a block docblock quoting concussion */",
      "/* a one-line block quoting not a medical test */",
      "const a = 1; // a trailing comment quoting concussion",
      'const url = "https://x/y"; // a trailing comment after a string with slashes',
      'const kept = "concussion"; // this one is CODE and must survive',
      "/*",
      " * a multi-line block quoting not a medical test",
      " */",
      "const b = 2;",
    ].join("\n");
    const out = stripComments(src);
    expect(out).toContain("const a = 1;");
    expect(out).toContain("const b = 2;");
    expect(out).toContain('const url = "https://x/y";');
    // The one occurrence that is code survives, which is what makes the strip a strip rather
    // than a blanket delete -- a strip that ate the string would make every negative assertion
    // above pass for the wrong reason.
    expect(out).toContain('const kept = "concussion";');
    expect(out.match(/concussion/g)).toHaveLength(1);
    expect(out).not.toContain("not a medical test");
  });
});

/**
 * THE SLOW CHANNEL'S ABSENCE NAMES THE REAL BLOCKER.
 *
 * Until 2026-11-08 it read "no early-season anchor on this account yet" -- a fixed sentence that
 * was true when it was written and would have gone on being printed after the anchor was built.
 * CLAUDE.md records what that costs: an entry that stops being revised reads as live, and two
 * different reasons for "nothing could be judged" must not render as the same blank any more than
 * a quiet week and an unjudgeable one may.
 */
describe("the slow channel", () => {
  it("names the anchor while an athlete has too little history for one", () => {
    const week = assembleAnvilWeek(42, mornings(12), anvilRange("2026-11-06", 7));
    expect("absent" in week.slow).toBe(true);
    expect(week.verdict.kind).toBe("cannot_judge");
    if (week.verdict.kind !== "cannot_judge") return;
    expect(week.verdict.reason).toContain("anchor checks before the window");
  });

  it("names the COHORT once the anchor exists, because that is what is missing then", () => {
    // Enough mornings for the anchor to close before the window opens and for the window to be
    // full: the anchor stops being the blocker and the sentence has to move with it.
    const week = assembleAnvilWeek(42, mornings(120), anvilRange("2026-11-06", 7));
    expect("driftMs" in week.slow).toBe(true);
    if (!("driftMs" in week.slow)) return;
    expect(week.slow.anchor.checks).toBe(20);
    expect(week.verdict.kind).toBe("cannot_judge");
    if (week.verdict.kind !== "cannot_judge") return;
    expect(week.verdict.reason).toContain("no cohort of 90");
    expect(week.verdict.reason).toContain("drift of");
    // And the career channel's reason is still its own, so the two are never conflated.
    expect(week.verdict.reason).toContain("a year earlier");
  });

  it("carries the drift into the printed sentence, so it is not accumulating invisibly", () => {
    const week = assembleAnvilWeek(42, mornings(120), anvilRange("2026-11-06", 7));
    expect(verdictSentence(week)).toContain("not enough to judge on");
    expect(verdictSentence(week)).toContain("no cohort of 90");
    expect(week.channelsNotBuilt.join(" ")).toContain("no cohort of 90");
  });

  it("never prints the sentence the anchor made false", () => {
    // FORBIDDEN FORM, comments stripped, because this file's own explanation quotes it above.
    const src = stripComments(readFileSync(join(__dirname, "anvil-report.ts"), "utf8"));
    expect(src).not.toContain("no early-season anchor");
  });
});
