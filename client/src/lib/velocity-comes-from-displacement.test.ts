import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// A VELOCITY IS A DISTANCE OVER A TIME, AND THE DISTANCE HAS TO BE THE BAR'S.
//
// Scott's bench, 2026-09-23, against his bar sensor: range of motion 6% low, mean velocity 54%
// high, peak velocity 103% high -- all off ONE trace. The take contradicted itself with no
// sensor needed: 0.70 m/s over a 0.79s concentric is 55cm of travel, on a rep the same take
// measured at 36cm. Position is measured end to end and speed step to step, so a wandering
// tracked point inflates one and not the other.
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const bar = read("client/src/lib/bar-tracking.ts");

describe("reported velocity is differenced over a smoothed position", () => {
  it("smooths, and by a duration rather than a frame count", () => {
    expect(bar).toContain("VELOCITY_SMOOTHING_MS");
    expect(bar).toContain("function smoothForSpeed");
    // Same reasoning as the baseline beside it: one rule that is right at 30, 60 and 120fps.
    const fn = bar.slice(bar.indexOf("function smoothForSpeed"), bar.indexOf("function computeSpeeds"));
    expect(fn).toContain("points[i].t - points[j].t <= half");
    expect(fn).not.toMatch(/j >= i - \d+/);
  });

  // THE PART THAT COST A REP COUNT THE FIRST TIME.
  //
  // The first cut smoothed unconditionally and a stored capture went from 5 reps to 6, because
  // trimPhaseToMovement reads the same series to place a phase's edges -- a gentler curve moved
  // the boundaries, moved the durations, and let a phantom through the duration-ratio filter.
  // Anything that DECIDES keeps the series it was tuned against; only reported numbers change.
  it("leaves the structural decisions on the unsmoothed series", () => {
    expect(bar).toContain("const speedsReportedMps = computeSpeeds(points, ySmoothed, true)");
    // The phase trimmer must still read the raw one.
    expect(bar).toMatch(/trimPhaseToMovement\(speedsMps,/);
    // ...and the reported numbers must read the smoothed one.
    expect(bar).toMatch(/robustPeakSpeed\(speedsReportedMps,/);
    expect(bar).toMatch(/speedsReportedMps\.slice\(/);
  });

  it("records what it walked against what it went, so the next take is readable", () => {
    const dialog = read("client/src/components/av-bar-tracker-dialog.tsx");
    expect(dialog).toContain("calibrationDiagnostics.tracePathCm");
    expect(dialog).toContain("calibrationDiagnostics.traceDisplacementCm");
    expect(dialog).toContain("calibrationDiagnostics.velocitySmoothingMs");
    // Declared on both sides of the parse, or zod strips them on insert -- twice bitten.
    for (const f of ["tracePathCm", "traceDisplacementCm", "velocitySmoothingMs"]) {
      expect(read("shared/schema.ts"), `${f} undeclared`).toContain(f);
      expect(read("client/src/lib/tracking-diagnostics.ts"), `${f} undeclared`).toContain(f);
    }
  });

  it("flags a take that disagrees with itself", () => {
    const report = read("server/tracking-report.ts");
    expect(report).toContain("This take disagrees with itself");
    expect(report).toContain("meanV * concS * 100");
  });
});

// RULE #1 REACHES THE DETECTOR. A wrong number can be calibrated; a refusal cannot.
describe("the object detector never comes back empty when it saw something", () => {
  const swift = read("ios/App/App/AvBodyTrackingPlugin.swift");

  it("counts the drops that used to happen before any counter existed", () => {
    for (const c of ["candidatesSeenOfClass", "candidatesRejectedByConfidence", "bestCandidateConfidence"]) {
      expect(swift, c).toContain(c);
      expect(read("shared/schema.ts"), `${c} undeclared`).toContain(c);
    }
  });

  it("falls back to the best weak candidate rather than nothing", () => {
    expect(swift).toContain("telemetry.lowConfidenceAccepts += 1");
    // The geometric gates stay -- a clipped box is not a whole object and a speck is not an
    // implement. Only the confidence THRESHOLD is relaxed, and only when the alternative is
    // measuring a whole set off an unsupported wrist.
    const fb = swift.slice(swift.indexOf("NOTHING CLEARED THE BAR"), swift.indexOf("telemetry.lowConfidenceAccepts"));
    expect(fb).toContain("candidateBoxIsUsable");
    expect(fb).toContain("objectIsPlausible");
  });
});
