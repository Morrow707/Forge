import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cameraTunablesFor, FITTED_OVERRIDES } from "@shared/camera-tunables-by-lift";
import { romBucketForExercise } from "./exercise-camera-profile";
import { VELOCITY_SMOOTHING_MS } from "./bar-tracking";

/**
 * A DIAGNOSTIC THAT NAMES A PER-LIFT NUMBER MUST NAME THE ONE THIS LIFT WAS HANDED.
 *
 * Found 2026-10-31, pairing the build-705 set-3 takes against the OVR. The export said
 * `velocitySmoothingMs: 165` on a Bench Press that had really been smoothed at 200 -- round
 * four's `FITTED_OVERRIDES["Bench Press"].velocitySmoothingMs`. The PIPELINE was correct the
 * whole time (`bar-tracking.ts` differences `speedsReportedMps` over `tune.velocitySmoothingMs`);
 * only the RECORD was wrong, because the dialog wrote the shared module constant into the blob.
 *
 * It was the right value for as long as every lift shared it, and it stopped being right on the
 * day the first per-lift override shipped -- which is to say the first export that NEEDED this
 * field to be true is the first one in which it was false. A correction wired to one of two
 * paths, invisible because the path that IS taken looks like it worked; CLAUDE.md has recorded
 * that shape eight times and this is the ninth.
 *
 * WHY IT MATTERS MORE THAN A COSMETIC FIELD. The export is the only way to tell which number a
 * take was handed: `FITTED_OVERRIDES` is the machinery for calibrating one lift without moving
 * the others, and a diagnostic that reports the SHARED value makes a per-lift fit and its absence
 * look identical on the row where it is read. That is the same argument `calibration.scaleBlend`
 * was built on -- "without the name on the row you cannot tell whose numbers produced the
 * weights" -- and the 2026-10-19 Box Jump is the standing example of a take nobody could
 * attribute.
 *
 * THE RULE IS STATED AS WHAT IS FORBIDDEN, never as a list of the fields that were fixed. A list
 * cannot fail for a field nobody put on it, and the next diagnostic added will not be on anybody's
 * list. So the subjects are DISCOVERED: every `calibrationDiagnostics.<field> =` assignment whose
 * field name is also a key of the per-lift record has to take its value from a
 * `cameraTunablesFor(...)` resolution.
 */

const DIALOG = join(__dirname, "..", "components", "av-bar-tracker-dialog.tsx");

/**
 * Comments off before every scan below, and THE STRIP IS INERT TODAY -- said rather than implied,
 * because mutation-testing it is what established that. Removing it leaves all five cases green,
 * for a reason worth knowing: every forbidden word these cases look for sits in a docblock ABOVE
 * the span they bound, and `assignedExpression` stops at the assignment's own brackets, so no
 * comment currently falls inside one. The dialog holds 19 `calibrationDiagnostics.X =` writes and
 * not one of them appears in prose, measured.
 *
 * It stays because the next case added will not know that, and because the direction of this
 * failure is the dangerous one: CLAUDE.md calls a negative source assertion over raw source its
 * most repeated self-inflicted failure, and prose turning a scan GREEN is the worse half, since
 * nothing announces it. The last case below drives the strip directly instead of resting on a
 * mutation that cannot reach it.
 *
 * LINE-AWARE, NOT THE TWO-REGEX STRIP, for the reason `skills-need-entitlement.test.ts` measured:
 * a non-greedy block matcher pairs a `/*` inside a string or a regex with the next real close
 * thousands of lines away and silently empties the haystack. A block comment counts only when its
 * opener starts the line; an end-of-line comment is cut only where the `//` has balanced quotes
 * before it.
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
      else if (c === "/" && line[i + 1] === "/") {
        cut = i;
        break;
      }
    }
    out.push(cut >= 0 ? line.slice(0, cut) : line);
  }
  return out.join("\n");
}

/**
 * The expression an assignment assigns, bounded by MATCHING ITS OWN BRACKETS rather than by a
 * character count or "the next semicolon". CLAUDE.md forbids a character window in so many words,
 * and the semicolon version is the same bug with a better disguise: the value here spans four
 * lines and contains a call, so the first `;` on the line is the end of nothing.
 *
 * The `depth <= 0` on the semicolon is DEFENSIVE and says so rather than implying coverage:
 * removing it changes nothing today, because no diagnostic write in the dialog carries a `;`
 * inside its own brackets. It is there for the arrow-function or block expression somebody writes
 * next, which would otherwise end the span in the middle of itself.
 */
function assignedExpression(src: string, at: number): string {
  let i = src.indexOf("=", at);
  if (i < 0) throw new Error("no `=` after the assignment target");
  i += 1;
  let depth = 0;
  const out: string[] = [];
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === ";" && depth <= 0) break;
    out.push(c);
  }
  return out.join("");
}

/** Every `calibrationDiagnostics.<field> =` write in the dialog, with the field it writes. */
function diagnosticWrites(src: string): { field: string; expression: string }[] {
  const found: { field: string; expression: string }[] = [];
  const re = /calibrationDiagnostics\.([A-Za-z0-9_]+)\s*=(?!=)/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    found.push({ field: m[1], expression: assignedExpression(src, m.index) });
  }
  return found;
}

/** The keys of the per-lift record, read off a real record rather than retyped. */
const TUNABLE_KEYS = new Set(
  Object.keys(cameraTunablesFor("Bench Press", romBucketForExercise("Bench Press")).values),
);

describe("a diagnostic that names a per-lift number names this lift's own", () => {
  it("the premise: a lift really can carry its own smoothing, and one does", () => {
    // Without this the whole file is vacuous -- a scan for "reads the record" means nothing if
    // every record holds the same number. It is the Bench Press today (round four, 2026-10-30).
    const bench = cameraTunablesFor("Bench Press", romBucketForExercise("Bench Press")).values;
    const shared = cameraTunablesFor("Front Squat", romBucketForExercise("Front Squat")).values;
    expect(shared.velocitySmoothingMs).toBe(VELOCITY_SMOOTHING_MS);
    expect(bench.velocitySmoothingMs).not.toBe(shared.velocitySmoothingMs);
    expect(FITTED_OVERRIDES["Bench Press"]?.velocitySmoothingMs).toBe(bench.velocitySmoothingMs);
  });

  it("the dialog writes at least one tunable-named diagnostic, so the rule has a subject", () => {
    const writes = diagnosticWrites(strip(readFileSync(DIALOG, "utf8")));
    expect(writes.length).toBeGreaterThan(5);
    const tunableWrites = writes.filter((w) => TUNABLE_KEYS.has(w.field));
    expect(tunableWrites.map((w) => w.field)).toContain("velocitySmoothingMs");
  });

  it("every tunable-named diagnostic resolves the record, and none states a module constant", () => {
    const writes = diagnosticWrites(strip(readFileSync(DIALOG, "utf8")));
    for (const w of writes.filter((x) => TUNABLE_KEYS.has(x.field))) {
      // POSITIVE: the value comes from the registry. Either resolved inline, or off a `.values`
      // handle the surrounding block already resolved -- both are reading this lift's record.
      expect(
        /cameraTunablesFor\(|\.values\b|\btune\b|Tunables\b/.test(w.expression),
        `calibrationDiagnostics.${w.field} must take its value from this lift's record, not from ` +
          `"${w.expression.trim()}"`,
      ).toBe(true);
      // FORBIDDEN: a SCREAMING_CASE module constant, which is the exact form this fixed, and a
      // bare number, which is the form somebody reaches for next. Stated as what is refused so it
      // accepts every correct spelling, including ones nobody has written yet -- CLAUDE.md's
      // enumerate-accepted-forms lesson, paid for three times in `height-ruler-uncertainty`.
      expect(
        /\b[A-Z][A-Z0-9_]{3,}\b/.test(w.expression),
        `calibrationDiagnostics.${w.field} states a module constant: "${w.expression.trim()}"`,
      ).toBe(false);
      expect(
        /^\s*-?\d+(\.\d+)?\s*$/.test(w.expression),
        `calibrationDiagnostics.${w.field} states a literal: "${w.expression.trim()}"`,
      ).toBe(false);
    }
  });

  it("the comment strip really strips, even though nothing in the dialog needs it to yet", () => {
    // DRIVEN, not inferred from a mutation. The mutation that removes the strip leaves every case
    // above green (see the note on `strip`), so the only honest way to show the mechanism works is
    // to hand it the input it exists for. Three shapes, one per pass -- a block comment, a line
    // comment, and a comment INSIDE a multi-line expression -- and the third is placed so the
    // end-of-line pass is exercised rather than decorative: a trailing comment AFTER the
    // semicolon never enters the bounded span, so the one that matters sits INSIDE the call's own
    // parentheses, which is where a multi-line resolution puts it.
    const synthetic = [
      "      /* An older note, kept:",
      "         calibrationDiagnostics.maxPeakToMeanRatio = MAX_PEAK_TO_MEAN_RATIO;",
      "       */",
      "      // calibrationDiagnostics.velocitySmoothingMs = VELOCITY_SMOOTHING_MS;",
      "      calibrationDiagnostics.driveOnsetFraction = cameraTunablesFor(",
      "        exerciseName, // DRIVE_ONSET_FRACTION was read here until round four",
      "        romBucketForExercise(exerciseName),",
      "      ).values.driveOnsetFraction;",
    ].join("\n");
    const writes = diagnosticWrites(strip(synthetic));
    expect(writes.map((w) => w.field)).toEqual(["driveOnsetFraction"]);
    expect(/\b[A-Z][A-Z0-9_]{3,}\b/.test(writes[0].expression)).toBe(false);
    // And without it, the first line reads as a real write of a module constant -- the false red
    // on correct source, and the shape that would make somebody delete the case rather than the
    // comment.
    const unstripped = diagnosticWrites(synthetic);
    expect(unstripped.map((w) => w.field)).toEqual([
      "maxPeakToMeanRatio",
      "velocitySmoothingMs",
      "driveOnsetFraction",
    ]);
    expect(/\b[A-Z][A-Z0-9_]{3,}\b/.test(unstripped[0].expression)).toBe(true);
  });

  it("the reported velocity really is differenced over the record's window, not the constant", () => {
    // The field is a RECORD of what the pipeline did, so the pipeline has to be doing it. One
    // positive read, stated as the rule rather than the line: the array a velocity is REPORTED
    // from takes the record's window. `speedsMps` deliberately does not -- see its own comment,
    // "read ONLY where a velocity is reported, never where one is used to decide something".
    const bar = readFileSync(join(__dirname, "bar-tracking.ts"), "utf8");
    const at = strip(bar).indexOf("speedsReportedMps");
    expect(at).toBeGreaterThan(0);
    expect(assignedExpression(strip(bar), at)).toMatch(/tune\.velocitySmoothingMs/);
  });
});
