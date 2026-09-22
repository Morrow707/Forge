import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// RULE #1: THE CAMERA NEVER REJECTS A TAKE. See the top of CLAUDE.md.
//
// Three refusals have now been written, shipped, and cost Scott a testing session each. Every
// one of them was geometrically correct and every one of them was wrong, because what it threw
// away was the only evidence anybody had. These assertions pin the two shapes the rule has
// actually been broken in, plus the one plumbing detail that makes "save it anyway" work.
const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("the camera never rejects a take", () => {
  it("does not refuse a scale source for the athlete's posture", () => {
    // calibrationRefusalReasonForScale is the function that twice told an athlete their filming
    // position was the problem. It returns null for every posture and must keep doing so; the
    // signature stays so the call sites keep reading as "asked, and the answer is always yes".
    const src = read("client/src/lib/exercise-camera-profile.ts");
    const fn = src.slice(src.indexOf("export function calibrationRefusalReasonForScale"));
    const body = fn.slice(fn.indexOf("{"), fn.indexOf("\n}") + 2);
    expect(body).not.toMatch(/return\s+["'`]/);
  });

  it("keeps the Olympic-lift numbers and flags them instead of nulling them", () => {
    // A clean filmed on a phone used to save no bar path and no peak velocity at all, so there
    // was nothing to compare against a bar sensor and nothing to calibrate the Olympic path
    // model with. barPathAssumptionInvalid is the flag that says don't chart these.
    const src = read("client/src/components/av-bar-tracker-dialog.tsx");
    const branch = src.slice(
      src.indexOf("const olympicPath = barPathAssumptionInvalid"),
      src.indexOf("metrics.formFaults = detectFormFaults("),
    );
    expect(branch).toContain("metrics.barPathAssumptionInvalid = true");
    expect(branch).not.toMatch(/metrics\.(barPathDeviationCm|peakVelocityMps|peakPowerWatts)\s*=\s*null/);
  });

  it("declares scale_suspect on both sides of the zod parse", () => {
    // A field or an enum value the client sends and shared/schema.ts does not declare is
    // stripped silently on insert -- it has happened twice. scale_suspect is the outcome that
    // carries "saved anyway, treat as suspect", so losing it loses the whole point.
    expect(read("client/src/lib/tracking-diagnostics.ts")).toContain('| "scale_suspect"');
    expect(read("shared/schema.ts")).toContain('"scale_suspect"');
    expect(read("server/tracking-report.ts")).toContain('| "scale_suspect"');
  });
});

// THE TILT LINE IS THE ONE THING THIS BUILD STOPS SAYING, AND IT IS NOT A REFUSAL.
//
// "Bar tilted ~17 degrees toward the left arm" appeared on a take the same diagnostics show was
// filmed about 39 degrees off square. Tilt is a height difference divided by the separation
// between the two grips, and when the bar points near the camera that denominator collapses, so
// wrist noise becomes tens of degrees.
//
// Rule #1 is about never refusing to WRITE A NUMBER. This writes every number as before,
// diagnostics included. What it withholds is a coaching CLAIM about the athlete's technique
// whose input was never measured -- telling somebody their bar is crooked on arithmetic that
// could not see it is not a wrong number, it is a wrong instruction.
describe("a claim about technique needs the measurement behind it", () => {
  it("gates the tilt fault on the grip separation it is divided by", () => {
    const src = read("client/src/lib/pose-tracking.ts");
    expect(src).toContain("MIN_TILT_GRIP_SPAN_PX");
    expect(src).toContain("if (tiltAngles.length && tiltSpanUsable)");
  });

  it("still writes every metric and every diagnostic on such a take", () => {
    // The gate lives inside detectFormFaults and nowhere near the metrics, which is the whole
    // point. Nothing in the fault detector may null a measurement.
    const src = read("client/src/lib/pose-tracking.ts");
    const block = src.slice(src.indexOf("const tiltSpanUsable"), src.indexOf("const tiltSpanUsable") + 1200);
    expect(block).not.toMatch(/metrics\.\w+\s*=\s*null/);
  });

  it("names the load when the load is what is wrong", () => {
    // The 1 lb typo computed 12 W and nothing said the load was the problem.
    const src = read("server/tracking-report.ts");
    expect(src).toContain("IMPLAUSIBLE_LOAD_MIN_LBS");
    expect(src).toContain("Velocity and range of motion do not use load and are unaffected");
  });
});
