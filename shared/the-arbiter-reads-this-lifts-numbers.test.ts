// OVERWATCH'S THRESHOLDS REACH THE PHONE. The plumbing, pinned.
//
// Scott, 2026-10-06, on being told the four arbiter gates were per-lift in TypeScript and one
// shared value in Swift: "Plumb the arbiter, and the overwatch is fine, it can learn to
// understand the difference, what mattered was calibrating numbers not leaking to other numbers."
//
// Two things to keep straight, because they pull in opposite directions and both are his
// instruction:
//
//  - OVERWATCH IS STILL ONE REFEREE. Nothing here splits it into 270 arbiters, and it is
//    explicitly allowed to generalise across movements -- "it can learn to understand the
//    difference" is permission for the JUDGEMENT to be shared, which Rule #2 requires anyway
//    (one arbiter, owning no sensor).
//  - ITS NUMBERS ARE THE LIFT'S. What may never leak is a fitted threshold, so the three gates
//    travel with the capture and are reset per take on the native side.
//
// This is a text scan, and it has to be: overwatch runs in Swift because it must act mid-clip,
// and there is no Swift test target in this repo. Same arrangement, and the same reasoning, as
// tracker-arbiter.test.ts's constant-divergence scan beside it.
import fs from "node:fs";
import path from "path";

import { describe, expect, it } from "vitest";

const SWIFT = path.resolve(__dirname, "../ios/App/App/AvBodyTrackingPlugin.swift");
const DIALOG = path.resolve(__dirname, "../client/src/components/av-bar-tracker-dialog.tsx");
const swift = fs.readFileSync(SWIFT, "utf8");
const dialog = fs.readFileSync(DIALOG, "utf8");

const PLUMBED = [
  "maxLockDistanceInYardsticks",
  "maxPlateSizeInYardsticks",
  "maxYardstickDeviationRatio",
];

describe("the native arbiter reads this lift's numbers", () => {
  it.each(PLUMBED)("%s is read off the per-capture record, not the file constant", (name) => {
    // The `static let` stays as the default and as what tracker-arbiter.test.ts pins against the
    // TypeScript constant. What must not come back is a USE of it at a decision point, which is
    // what made a fitted per-lift number inert on the phone.
    expect(swift).toContain(`var ${name} = AvTrackerArbiter.${name}`);
    expect(swift).toMatch(new RegExp(`active\\.${name}`));
  });

  it("resets the record on EVERY capture, live and from a file", () => {
    // A mutable static that kept the previous take's numbers would be a leak of exactly the kind
    // this change exists to stop, and it would be invisible. Two entry points, two resets.
    expect((swift.match(/AvTrackerArbiter\.reset\(from:/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(swift).toContain("static func reset(from options: [String: Any]?)");
  });

  it("falls back to the default, never to the last take", () => {
    // `var next = Tunables()` before any read is what makes an absent value mean "the default".
    // Resetting by mutating `active` in place would leave a missing key holding a stale number.
    const body = swift.slice(swift.indexOf("static func reset(from options:"));
    const fn = body.slice(0, body.indexOf("\n    }"));
    expect(fn).toContain("var next = Tunables()");
    expect(fn).toContain("active = next");
    for (const name of PLUMBED) expect(fn).toContain(`next.${name} = v`);
    // And a nonsense value is refused rather than applied: a zero or negative threshold would
    // make the gate reject everything, which on Rule #1 is the worst possible failure.
    expect((fn.match(/v > 0/g) ?? []).length).toBe(PLUMBED.length);
  });

  it("is sent at Record AND at Stop", () => {
    // The file path resets separately, so a take analysed from a file would otherwise keep
    // whatever the last live capture set.
    expect(dialog).toContain("startRecording({ trackingMode: coreMlTrackingMode, arbiterTunables,");
    const stop = dialog.slice(dialog.indexOf("stopRecordingAndAnalyze({"));
    expect(stop.slice(0, 1200)).toContain("arbiterTunables,");
  });

  it("builds what it sends from the LIFT's record, not from the shared template", () => {
    const memo = dialog.slice(dialog.indexOf("const arbiterTunables = useMemo("));
    expect(memo.slice(0, 700)).toContain("cameraTunablesFor(exerciseName");
    for (const name of PLUMBED) expect(memo.slice(0, 900)).toContain(`${name}: values.${name}`);
  });

  it("leaves overwatch itself one referee, owning no sensor", () => {
    // Rule #2. The plumbing carries NUMBERS; it must not create a second arbiter, and it must not
    // give the arbiter a sensor of its own.
    expect((swift.match(/private enum AvTrackerArbiter\b/g) ?? []).length).toBe(1);
    expect(swift).not.toMatch(/enum AvTrackerArbiterFor/);
  });
});
