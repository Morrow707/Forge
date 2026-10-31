import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeTrackedSet } from "./bar-tracking";
import { firstMoveForExercise, romBucketForExercise } from "./exercise-camera-profile";
import { cameraTunablesFor } from "@shared/camera-tunables-by-lift";

/**
 * A REPORTED VELOCITY'S DISTANCE AND TIME COME FROM THE SAME WINDOW. ALL OF THEM, NOT JUST THE
 * REP'S.
 *
 * Found 2026-10-31 on the bench's set 3, and the whole finding is that this file already said it.
 * `romM`'s own comment in bar-tracking.ts, written 2026-10-06, is headed "THE DISTANCE AND THE
 * TIME MUST COME FROM THE SAME WINDOW" and explains at length that pairing the WHOLE PHASE's
 * distance with the DRIVE window's time credits the whole rep's travel to only the fast part's
 * time. It fixed the REP's mean. The SET's mean is a separate aggregation one function down, and
 * it went on summing `romM` over `driveDuration` -- the exact pairing that comment names -- for
 * twenty-five days, because `driveRomM` was never put on the record for it to sum.
 *
 * WHAT IT COST, measured on the twelve traced sensor-paired takes: the set mean ran 0-10% high,
 * so seven takes that read HIGH all improved (the bench's set 3 +10.4% -> +2.9%, the 10-02 row
 * +7.1% -> -2.1%, the 10-02 push press +2.4% -> -1.3%) and five that read LOW got worse by one to
 * three points. A fix that removes a one-sided inflation does exactly that, and the five are the
 * takes whose low read the inflation was masking.
 *
 * AND IT VOIDED A FITTED CONSTANT'S EVIDENCE WITHOUT CHANGING ITS VALUE, which is the part worth
 * keeping. The Bench Press's own `driveOnsetFraction` (0.03, round four) was fitted against this
 * mean: narrowing the window used to move only the DENOMINATOR, so a smaller fraction always
 * dragged a too-high mean down. With both sums from the drive window it is INERT on both of the
 * takes it was fitted on, and still earns its keep on the older corpus. FITTED_OVERRIDE_EVIDENCE
 * carries the re-measured sweep. Before fitting any window constant against a velocity, check
 * which windows that velocity's numerator and denominator come from.
 *
 * THE RULE THIS FILE HOLDS IS STATED AS WHAT IS FORBIDDEN, and the subjects are DISCOVERED: every
 * `reduce` in bar-tracking.ts that sums a distance off the concentric records is read out of the
 * source, and none of them may sum `romM` -- the phase's distance -- while its sibling sums
 * `driveDuration`. A list of the two sites that were fixed could not fail for the third somebody
 * writes.
 */

const BAR = join(__dirname, "bar-tracking.ts");

/**
 * Comments off before the scan, and here the strip is LOAD-BEARING rather than defensive: the
 * `romM` comment this whole file is about quotes `romM` and `driveDuration` in the same sentence,
 * and so do the two fixes' own explanations. An unstripped scan finds that prose and reds on the
 * corrected file. CLAUDE.md calls a negative source assertion over raw source its most repeated
 * self-inflicted failure.
 *
 * LINE-AWARE, NOT THE TWO-REGEX STRIP, for the reason `skills-need-entitlement.test.ts` measured:
 * a non-greedy block matcher pairs a `/*` inside a string or a regex with the next real close
 * thousands of lines away and silently empties the haystack. bar-tracking.ts is 4,000+ lines of
 * exactly that kind of prose.
 */
function strip(s: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of s.split("\n")) {
    const t = line.trim();
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
      out.push("");
      continue;
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) inBlock = true;
      out.push("");
      continue;
    }
    if (t.startsWith("//")) {
      out.push("");
      continue;
    }
    let cut = -1;
    let quote: string | null = null;
    for (let i = 0; i < line.length - 1; i++) {
      const c = line[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "/" && line[i + 1] === "/") { cut = i; break; }
    }
    out.push(cut >= 0 ? line.slice(0, cut) : line);
  }
  return out.join("\n");
}

/**
 * Every statement that aggregates over the concentric records, bounded by MATCHING ITS OWN
 * BRACKETS from the `reduce` outward -- never a character window and never "the next semicolon",
 * since both aggregations here are inside an IIFE that contains several.
 */
function aggregationsOverConcentrics(src: string): string[] {
  const found: string[] = [];
  const re = /setConcentric\.reduce\(/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let i = src.indexOf("(", m.index + "setConcentric.reduce".length);
    let depth = 0;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") { depth--; if (depth === 0) { i++; break; } }
    }
    found.push(src.slice(m.index, i));
  }
  return found;
}

/** The statement a `reduce` is assigned to, so a numerator and its denominator can be read as a
 *  pair: from the line's start to the end of the reduce call. */
function statementsAround(src: string): { line: string; sums: string }[] {
  return src.split("\n").filter((l) => l.includes("setConcentric.reduce("))
    .map((l) => ({ line: l.trim(), sums: l }));
}

describe("a reported velocity's distance and time come from the same window", () => {
  const src = strip(readFileSync(BAR, "utf8"));

  it("the rule has subjects: bar-tracking aggregates over the concentric records", () => {
    const aggs = aggregationsOverConcentrics(src);
    expect(aggs.length).toBeGreaterThanOrEqual(4);
    // Both halves of the pairing are present somewhere, or the forbidden-form case below is
    // scanning for a shape the file no longer has and would pass by vacuity.
    expect(aggs.some((a) => a.includes("driveRomM"))).toBe(true);
    expect(aggs.some((a) => a.includes("driveDuration"))).toBe(true);
  });

  it("FORBIDDEN: no distance sum pairs the PHASE's romM with the DRIVE window's time", () => {
    // The two are only ever wrong TOGETHER, so the rule is about the pair and not about either
    // name on its own: `romM` is legitimately summed nowhere today, and if a future aggregation
    // wants the phase's distance it must divide it by the phase's own time.
    const lines = statementsAround(src);
    const phaseDistance = lines.filter((l) => /\ba\s*\+\s*c\.romM\b/.test(l.line));
    const driveTime = lines.filter((l) => /\ba\s*\+\s*c\.driveDuration\b/.test(l.line));
    expect(
      driveTime.length,
      "the drive window's time is summed, so this rule has something to be about",
    ).toBeGreaterThan(0);
    expect(
      phaseDistance.map((l) => l.line),
      "a set-level sum of the PHASE's distance (romM) beside a sum of the DRIVE window's time is " +
        "the 2026-10-06 bug returning at the set level -- sum driveRomM instead",
    ).toEqual([]);
  });

  it("the record carries the drive window's own distance, so nothing has to reach for romM", () => {
    // The field's absence is WHY the bug survived: the set-level code summed the only distance on
    // the record. Its presence is the structural half of the fix.
    expect(src).toMatch(/^\s*driveRomM,\s*$/m);
  });

  it("the set mean really is the drive window's distance over its time, driven not scanned", () => {
    // A scan over an aggregation can only see the names it is written with, never which way it
    // goes -- the form-check-destination lesson. So this drives the real summariser on the real
    // bench trace and checks the identity holds to the hundredth it is rounded to.
    const fixtures = JSON.parse(
      readFileSync(join(__dirname, "__fixtures__", "ovr-2026-10-30-export.json"), "utf8"),
    );
    const f = fixtures.find((x: any) => x.exerciseName === "Bench Press");
    const points = f.barPathTrace.map((p: any) => ({ t: p.t, x: p.x / 100, y: p.y / 100, z: 0, confidence: p.c ?? 1 }));
    const romKind = romBucketForExercise("Bench Press");
    const m: any = summarizeTrackedSet(
      points, f.loadKg ?? undefined, f.heightIn ?? undefined, firstMoveForExercise("Bench Press"), [],
      f.trackingDiagnostics?.calibration?.positionScaleCorrection ?? 1, false, romKind,
      { x: 0, y: 1 }, f.loggedReps ?? null, cameraTunablesFor("Bench Press", romKind),
    );
    expect(m).toBeTruthy();
    const sum = (pick: (w: any) => number) =>
      m.repBreakdown.reduce((a: number, r: any) => a + pick(r.windows), 0);
    const driveTime = sum((w) => w.driveSeconds);
    const fromDrive = sum((w) => w.driveRomCm) / 100 / driveTime;
    const fromPhase = sum((w) => w.phaseRomCm) / 100 / driveTime;
    // The windows differ on this take, so the two candidates are distinguishable -- without that
    // the assertion below would hold whichever one the code used.
    expect(Math.abs(fromPhase - fromDrive)).toBeGreaterThan(0.01);
    expect(m.meanVelocityMps).toBeCloseTo(fromDrive, 2);
    expect(m.meanVelocityMps).not.toBeCloseTo(fromPhase, 2);
    // The REPORTED range of motion still spans the whole phase: that is the rep's real travel and
    // it is the number the sensor already agrees with. Two windows, two jobs.
    expect(m.romCm).toBeGreaterThan(0);
  });

  it("the comment strip really strips, though nothing in bar-tracking.ts needs it to yet", () => {
    // DRIVEN, NOT INFERRED FROM A MUTATION, AND THE STRIP IS INERT TODAY -- said rather than
    // implied, because measuring it is what established that. The 10-06 comment and both 10-31
    // ones name `romM` and `driveDuration` in prose, but none of them writes the reducer form
    // `a + c.romM` that the forbidden-form case matches, so removing the strip changes no result
    // in this file today. It stays because the next explanation written over one of these lines
    // will quote the line, and because the direction of this failure is the dangerous one:
    // CLAUDE.md calls a negative source assertion over raw source its most repeated
    // self-inflicted failure, and prose turning a scan GREEN is the worse half.
    const synthetic = [
      "      /* the old shape, kept for the record:",
      "         const dist = setConcentric.reduce((a, c) => a + c.romM, 0);",
      "       */",
      "      // const dist = setConcentric.reduce((a, c) => a + c.romM, 0);",
      "      const dist = setConcentric.reduce((a, c) => a + c.driveRomM, 0); // was a + c.romM",
      "      const time = setConcentric.reduce((a, c) => a + c.driveDuration, 0);",
    ].join("\n");
    const forbidden = (text: string) =>
      statementsAround(text).filter((l) => /\ba\s*\+\s*c\.romM\b/.test(l.line)).length;
    // Three shapes, one per pass: a block comment, a line comment, and an end-of-line comment on
    // a line that is otherwise correct. All three must disappear.
    expect(forbidden(strip(synthetic))).toBe(0);
    // And without it every one of the three reads as a live sum of the phase's distance -- the
    // false red on correct source that gets the case deleted rather than the comment.
    expect(forbidden(synthetic)).toBe(3);
    // The real file is clean either way today, which is the fact being recorded.
    expect(forbidden(readFileSync(BAR, "utf8"))).toBe(0);
  });
});
