// A FLOORED PEAK SAYS HOW FAR IT WAS FLOORED, AND WHAT IT WAS READ FROM.
//
// The 2026-10-08 Romanian deadlift reported peak = mean = 0.72 m/s on every one of its four
// reps, against an OVR that measured 1.70 -- 57.6% low, the worst single number of that
// session. The only trace of it anywhere in the export was `trace.repPeaksFlooredToMean: 4`.
// A count. A rep floored by a hair and a rep floored by a factor of two read identically, so
// the size of the error could not be established from the file at all.
//
// THE FLOOR ITSELF IS RIGHT AND IS NOT TOUCHED HERE. `peakFloored = rawPeak < mean` catches a
// peak below the average of the window it was read over, which is impossible, and replacing it
// with the mean keeps the rep's number physical rather than withholding it (Rule #1, and build
// 577's own reasoning). What was missing is any account of WHY it fired.
//
// And the why is now answerable, because the two numbers are not the same quantity:
//   mean    = net displacement over elapsed time. Immune to confidence, immune to sampling.
//   rawPeak = the 95th percentile of the CONFIDENCE-FILTERED instantaneous speeds, same window.
// The quickest part of a rep is where the hands blur, so the samples the confidence filter
// removes are biased FAST, and what survives can sit below the window's own average. That take
// dropped 105 of 451 points below the visibility floor and carried 130 more from a lone hand.
//
// So: a rawPeak far below the mean with most of the window filtered out is a biased pool; the
// same gap with the window INTACT is the speed series itself. Two different fixes, and until
// now nothing in the export could tell them apart.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { replayCapture, type StoredCapture } from "./capture-replay";

const dir = join(process.cwd(), "client/src/lib/__fixtures__");
const captures: { file: string; capture: StoredCapture }[] = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(dir, file), "utf8"));
  } catch {
    continue;
  }
  for (const c of Array.isArray(parsed) ? parsed : [parsed]) {
    if (c && typeof c === "object" && Array.isArray((c as StoredCapture).barPathTrace)) {
      captures.push({ file, capture: c as StoredCapture });
    }
  }
}

const allReps = () =>
  captures.flatMap(({ file, capture }) =>
    (replayCapture(capture).metrics?.repBreakdown ?? []).map((r, i) => ({ file, i, rep: r as any })),
  );

describe("a floored peak says how far", () => {
  it("has a corpus to check", () => {
    expect(captures.length).toBeGreaterThanOrEqual(15);
    expect(allReps().length).toBeGreaterThan(50);
  });

  it("every rep carries its raw peak and the pool that peak was read from", () => {
    for (const { file, i, rep } of allReps()) {
      const w = rep.windows;
      expect(w, `${file} rep ${i} has no windows`).toBeTruthy();
      for (const field of ["rawPeakMps", "peakSamplesInWindow", "peakSamplesBelowConfidence"]) {
        expect(typeof w[field], `${file} rep ${i} is missing ${field}`).toBe("number");
      }
      expect(typeof w.peakUsedRawFallback).toBe("boolean");
      expect(typeof w.peakFloored, `${file} rep ${i} is missing peakFloored`).toBe("boolean");
      expect(typeof w.peakCapped, `${file} rep ${i} is missing peakCapped`).toBe("boolean");
    }
  });

  it("the pool numbers are consistent with the window they describe", () => {
    for (const { file, i, rep } of allReps()) {
      const w = rep.windows;
      expect(w.peakSamplesBelowConfidence, `${file} rep ${i}`).toBeGreaterThanOrEqual(0);
      // More samples filtered out than the window holds would mean the counter is counting
      // something other than this window.
      expect(w.peakSamplesBelowConfidence, `${file} rep ${i}`).toBeLessThanOrEqual(w.peakSamplesInWindow);
      // driveSamples is the same window counted by the caller, so the two must agree.
      expect(w.peakSamplesInWindow, `${file} rep ${i}`).toBe(w.driveSamples);
      // A fallback happened exactly when the filter took everything.
      if (w.peakSamplesBelowConfidence === w.peakSamplesInWindow && w.peakSamplesInWindow > 0) {
        expect(w.peakUsedRawFallback, `${file} rep ${i} filtered the window empty without saying so`).toBe(true);
      }
    }
  });

  it("THE RAW PEAK IS THE NUMBER BEFORE THE FLOOR, so the gap is recoverable", () => {
    // Keyed on the rep's OWN peakFloored flag, not on comparing the reported numbers. The first
    // version of this test inferred "floored" from rawPeakMps < meanVelocityMps, and
    // mutation-testing caught it: rawPeakMps carries 3 decimals and meanVelocityMps 2, so that
    // comparison picks up rounding noise and the test stayed green with rawPeakMps mutated to
    // copy the REPORTED peak -- the exact failure that would make this field decoration.
    const floored = allReps().filter(({ rep }) => rep.windows.peakFloored === true);
    expect(floored.length, "no floored rep in the corpus -- this test proves nothing").toBeGreaterThan(0);
    for (const { file, i, rep } of floored) {
      // A floored rep reports its mean...
      expect(rep.peakVelocityMps, `${file} rep ${i}: a floored rep should report its mean`).toBeCloseTo(
        rep.meanVelocityMps!,
        2,
      );
      // ...and the number it was floored FROM is still in the file, strictly below it. This is
      // the whole deliverable: the size of the error, which trace.repPeaksFlooredToMean's count
      // could never give.
      expect(rep.windows.rawPeakMps, `${file} rep ${i}: the raw peak must be recoverable and lower`).toBeLessThan(
        rep.peakVelocityMps!,
      );
    }
  });

  it("the per-rep flags agree with the set-level counts they were derived from", () => {
    // The set has carried counts since build 577 and the flags are new, so the two must not be
    // able to disagree -- that is how a diagnostic starts describing a different computation
    // from the one that ran.
    for (const { file, capture } of captures) {
      const m = replayCapture(capture).metrics;
      if (!m?.repBreakdown?.length) continue;
      const reps = m.repBreakdown as any[];
      const flagged = reps.filter((r) => r.windows?.peakFloored === true).length;
      expect(m.repPeaksFlooredToMean ?? 0, `${file}: ${flagged} reps flagged but the set says ${m.repPeaksFlooredToMean}`).toBe(flagged);
      const capped = reps.filter((r) => r.windows?.peakCapped === true).length;
      expect(m.repPeaksCappedToMeanRatio ?? 0, `${file}: cap count disagrees`).toBe(capped);
    }
  });

  it("RECORDS AND GATES NOTHING: the floor fires exactly where it did", () => {
    // Rule #1's standing arrangement for a diagnostic. The reported peak is still either the
    // raw peak, the mean, or the mean times the cap -- never anything derived from the new
    // fields. Checked on every rep in the corpus rather than argued.
    for (const { file, i, rep } of allReps()) {
      const raw = rep.windows.rawPeakMps;
      const reported = rep.peakVelocityMps;
      if (reported == null) continue;
      const isRaw = Math.abs(reported - raw) < 0.011;
      const isMean = Math.abs(reported - (rep.meanVelocityMps ?? NaN)) < 0.011;
      const isCapped = raw > (rep.meanVelocityMps ?? 0) && reported > (rep.meanVelocityMps ?? 0);
      expect(isRaw || isMean || isCapped, `${file} rep ${i}: reported ${reported} is neither the raw peak ${raw}, the mean, nor a cap`).toBe(true);
    }
  });

  it("nothing in the pipeline branches on the new fields", () => {
    const src = readFileSync(join(process.cwd(), "client/src/lib/bar-tracking.ts"), "utf8");
    for (const field of ["rawPeakMps", "peakSamplesInWindow", "peakSamplesBelowConfidence", "peakUsedRawFallback"]) {
      expect(src).not.toMatch(new RegExp("if \\([^)]*windows\\." + field));
    }
  });

  it("is declared in the schema, because zod strips what it does not declare", () => {
    const schema = readFileSync(join(process.cwd(), "shared/schema.ts"), "utf8");
    for (const field of ["rawPeakMps", "peakFloored", "peakCapped", "peakSamplesInWindow", "peakSamplesBelowConfidence", "peakUsedRawFallback"]) {
      expect(schema, `${field} would be stripped on the way into the database`).toContain(field + ":");
    }
  });
});
