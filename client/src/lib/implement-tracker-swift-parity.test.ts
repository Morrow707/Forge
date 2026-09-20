import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE PORT HAS TO STAY A PORT, PART TWO.
 *
 * ImplementTracker (implement-tracking.ts) and AvImplementTracker (AvBodyTrackingPlugin.swift)
 * are the same motion-diff tracker on two platforms, and seven of its constants are written
 * down in both. shared/tracker-arbiter.ts said for months that this pair was policed the way
 * the arbiter's own constants are. It was not: there was no test, and nothing but a comment
 * held the two lists together. Scott's decision (2026-09-20) is that they must not diverge, so
 * this reads the Swift source the way shared/tracker-arbiter.test.ts does and fails when they
 * do.
 *
 * The TypeScript constants are module-private on purpose (nothing outside the tracker should
 * reason in them), so this reads both sides as text. A text scan and it knows it: it proves the
 * two implementations were given the same numbers, not that they behave the same. That is the
 * half that drifts.
 */

const ts = readFileSync(join(__dirname, "implement-tracking.ts"), "utf8");
const swift = readFileSync(
  join(__dirname, "..", "..", "..", "ios", "App", "App", "AvBodyTrackingPlugin.swift"),
  "utf8",
);

const tsConstant = (name: string): number | null => {
  const m = ts.match(new RegExp(`^const ${name}\\s*=\\s*(-?[0-9.]+);`, "m"));
  return m ? Number(m[1]) : null;
};
const swiftConstant = (name: string): number | null => {
  const m = swift.match(new RegExp(`(?:private |static )?let ${name}\\s*=\\s*(-?[0-9.]+)`));
  return m ? Number(m[1]) : null;
};

const PAIRS: [string, string][] = [
  ["LOCK_RAMP_FRAMES", "lockRampFrames"],
  ["MAX_LOCK_DRIFT_FRACTION", "maxLockDriftFraction"],
  ["DRIFT_HISTORY_WINDOW", "driftHistoryWindow"],
  ["SUSPICIOUS_DRIFT_THRESHOLD", "suspiciousDriftThreshold"],
  ["MIN_HISTORY_FOR_DIP_CHECK", "minHistoryForDipCheck"],
  ["DIP_RECENT_AVG_FLOOR", "dipRecentAvgFloor"],
  ["DIP_RATIO_THRESHOLD", "dipRatioThreshold"],
];

describe("AvImplementTracker carries the same numbers as ImplementTracker", () => {
  it.each(PAIRS)("%s === %s", (tsName, swiftName) => {
    const a = tsConstant(tsName);
    const b = swiftConstant(swiftName);
    // A null means the scan lost the constant, which is its own failure: a renamed constant
    // must rename here too, or the check silently stops checking.
    expect(a, `${tsName} not found in implement-tracking.ts`).not.toBeNull();
    expect(b, `${swiftName} not found in AvBodyTrackingPlugin.swift`).not.toBeNull();
    expect(b).toBe(a);
  });

  it("still applies the two overlord checks in the same order on both platforms", () => {
    // Sustained drift drops the lock; a transient dip only suppresses the frame. Swapping the
    // order on one side would make the same numbers mean different things.
    const tsLock = ts.indexOf("if (this.isSuspiciousLock())");
    const tsDip = ts.indexOf("if (this.isSuspiciousDip(rawConfidence))");
    expect(tsLock).toBeGreaterThan(-1);
    expect(tsDip).toBeGreaterThan(tsLock);
    const swLock = swift.indexOf("isSuspiciousLock()", swift.indexOf("class AvImplementTracker"));
    const swDip = swift.indexOf("isSuspiciousDip(", swLock);
    expect(swLock).toBeGreaterThan(-1);
    expect(swDip).toBeGreaterThan(swLock);
  });
});
