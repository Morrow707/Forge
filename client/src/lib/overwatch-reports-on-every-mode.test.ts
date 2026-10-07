import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// OVERWATCH RAN ON EVERY MODE AND HAD ITS ANSWER THROWN AWAY ON FOUR OF THEM.
//
// AvOverwatch.judge() is called before either object tracker on every frame of every capture
// mode -- that part was always right. What was missing is any record: `summary` went to one
// debug log line, and the only overwatch numbers in an export rode inside `objectLock`, which is
// gated on `coreMlDetectionEnabled`. So jump, sprint, mechanics and horizontal_load ran it and
// discarded the verdict every take -- Rule #4's "indistinguishable from being off and worse,
// because the diagnostics read as though it was there" -- and `framesFrozen`, a tracker stuck on
// a frame, had never reached an export on ANY mode.
//
// Scott, 2026-10-07: "they will find frames and stick for no rhyme or reason because they don't
// know any better ... make sure every single camera system, all [269] lifts and skills training
// have this overwatch."
const SWIFT = readFileSync(join(process.cwd(), "ios/App/App/AvBodyTrackingPlugin.swift"), "utf8");
const SCHEMA = readFileSync(join(process.cwd(), "shared/schema.ts"), "utf8");

const FIELDS = [
  "framesJudged", "framesFrozen", "framesFrozenByImage", "framesFrozenByLandmarks",
  "longestFrozenRun", "framesBodySuspect", "framesWithYardstick", "frozenLandmarkFrames",
];

describe("overwatch reports on every capture mode", () => {
  it("is emitted on BOTH analysis paths and gated on nothing", () => {
    const emissions = SWIFT.match(/result\["overwatch"\]/g) ?? [];
    expect(emissions.length).toBe(2);
    // The whole point: objectLock is gated, this is not. If a future change wraps either
    // emission in the detector's flag, the four implement-less modes go silent again.
    for (const m of SWIFT.matchAll(/result\["overwatch"\] = \w+/g)) {
      const before = SWIFT.slice(Math.max(0, m.index! - 400), m.index!);
      expect(before, "overwatch emission is gated on the CoreML detector")
        .not.toMatch(/if ctx\.coreMlDetectionEnabled[^}]*$/);
    }
  });

  it("counts a stuck tracker, and separates the two ways it sticks", () => {
    // An identical IMAGE is the camera or decoder repeating a frame; identical LANDMARKS on a
    // moving image is Vision returning a stale answer, which is the one that makes a tracker
    // stick. The run LENGTH is what separates a blink from a lock.
    expect(SWIFT).toContain("framesFrozenByImage += 1");
    expect(SWIFT).toContain("framesFrozenByLandmarks += 1");
    expect(SWIFT).toMatch(/currentFrozenRun > longestFrozenRun/);
    expect(SWIFT).toMatch(/currentFrozenRun = 0/);
  });

  it("counts every frame it judged, so a count means something against a denominator", () => {
    expect(SWIFT).toContain("framesJudged += 1");
    expect(SWIFT).toContain("framesWithYardstick += 1");
  });

  it("resets per capture -- a stale count would read as this take's", () => {
    const reset = SWIFT.slice(SWIFT.indexOf("    func reset() {", SWIFT.indexOf("private final class AvOverwatch")));
    for (const f of ["framesJudged", "framesFrozen", "framesFrozenByImage",
                     "framesFrozenByLandmarks", "framesWithYardstick", "longestFrozenRun"]) {
      expect(reset.slice(0, 600), `${f} is not reset between captures`).toContain(`${f} = 0`);
    }
  });

  it("is declared in the zod schema, which strips what it does not declare", () => {
    expect(SCHEMA).toMatch(/overwatch: z\s*\n?\s*\.object\(\{/);
    for (const f of FIELDS) {
      expect(SCHEMA, `overwatch.${f} is not declared`).toContain(`${f}: z.number().optional()`);
    }
  });

  it("records and gates nothing: judge() still decides, this only reports", () => {
    const cls = SWIFT.slice(SWIFT.indexOf("private final class AvOverwatch"));
    const telemetry = cls.slice(cls.indexOf("var telemetry: [String: Any]"), cls.indexOf("func reset()"));
    // A getter over counters. No branching on them, nothing returned to a caller to act on.
    expect(telemetry).not.toMatch(/\breturn (true|false|nil)\b/);
    expect(telemetry).not.toMatch(/\bif\b/);
  });
});
