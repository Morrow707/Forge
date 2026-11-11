import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACCURACY_LEDGER } from "@shared/accuracy-ledger";
import { errorPctFor } from "./ledger-replay";

/* TWO OF THE THREE FIXES OF 2026-11-11, after Scott: "every week we start high, get it dialed in,
 * then the next week they are high again".
 *
 * 1. THE SWEEP READS THE SAME PIPELINE THE LEDGER PINS. scripts/sweep-lift-setting.ts chooses a
 *    lift's settings step across every set on record; if its replay disagreed with the pinned
 *    replay it would be choosing on a pipeline no phone runs.
 *
 * 2. A ONE-ARM LIFT'S HIDDEN WORKING HAND SENDS THE TAKE TO THE FILE. Set 3 of the single-arm row
 *    (11-10) found 4 of 8 pulls: the working wrist was unseen for 1.36s and one pull vanished in
 *    the hole, while the live gate read only the BODY's gap (0.19s) and kept the take live. The
 *    native side now counts each wrist's unseen time, reads the wrist that travelled further as
 *    the working one, and on a unilateral take (flag sent at Record by the bar dialog) refuses a
 *    live trace whose working wrist was gone past 1.0s. There is no Swift test target, so the
 *    Swift is read with its comments stripped, the way shared/tracker-arbiter.test.ts does. */

const PINNED_TO_PCT = 0.05;
/** Quotes before a `//` come in pairs when it sits outside a string; both paths emit the telemetry. */
const PAIR = 2;
const BOTH_PATHS = 2;
const ROOT = join(__dirname, "..", "..", "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
const stripComments = (src: string): string =>
  src
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      return at >= 0 && (line.slice(0, at).split('"').length - 1) % PAIR === 0 ? line.slice(0, at) : line;
    })
    .join("\n")
    // A block comment whose opener starts its line, through its first close: matches
    // "  /* note */" and "/** a\n * b */"; leaves `let x = "/*"` alone because the opener is not
    // at the start of its line. https://regex101.com/?regex=%5E%5Cs*%5C%2F%5C*%5B%5Cs%5CS%5D*%3F%5C*%5C%2F&flags=gm
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, "");
const swift = stripComments(read("ios/App/App/AvBodyTrackingPlugin.swift"));

describe("the sweep and the hand gate", () => {
  it.each(ACCURACY_LEDGER.map((r) => [r.id, r] as const))("%s: the sweep's replay is the pinned one", (_id, row) => {
    expect(Math.abs(errorPctFor(row) - row.liveErrorPct)).toBeLessThanOrEqual(PINNED_TO_PCT);
  });

  it("every body-producing frame feeds the per-wrist counters, on both paths", () => {
    expect(swift).toContain("Self.recordWristSighting(state: state, at: timestampSeconds, left: leftWristJoint, right: rightWristJoint)");
    expect(swift.split('result["wristGaps"] = Self.wristGapTelemetry(state)').length - 1).toBe(BOTH_PATHS);
  });

  it("the live gate holds a one-arm take's working wrist, and only a one-arm take's", () => {
    expect(swift).toContain('liveUnilateralLift = call.getBool("unilateralLift") ?? false');
    expect(swift).toContain("let workingWristGap = liveUnilateralLift ? (Self.workingWristGapSeconds(run.state)?.gap ?? 0) : 0");
    expect(swift).toContain("workingWristGap <= Self.maxLiveWorkingWristGapSeconds else {");
    expect(swift).toContain("maxLiveWorkingWristGapSeconds = 1.0\n");
  });

  it("the bar dialog says so at Record, and the hook forwards it to the phone", () => {
    expect(read("client/src/components/av-bar-tracker-dialog.tsx")).toContain('unilateralLift: laterality === "unilateral"');
    const hook = read("client/src/lib/use-av-body-tracking.ts");
    expect(hook).toContain("unilateralLift: options?.unilateralLift,");
    expect(hook).toContain("arbiterTunables: options?.arbiterTunables,");
  });

  it("the export keeps it: the schema declares wristGaps, so zod does not strip it", () => {
    expect(read("shared/schema.ts")).toContain("wristGaps: z\n        .object({");
  });
});
