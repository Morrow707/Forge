import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { heightRulerFraming, HEIGHT_RULER_EDGE_FRACTION, POSE_LANDMARKS } from "./pose-tracking";
// The landmark type as the function takes it (pose-tracking re-uses MediaPipe's and does not export it).
type Landmark = Parameters<typeof heightRulerFraming>[0][number]["worldLandmarks"][number];

/* THE HEIGHT RULER SAYS WHERE ITS TWO LANDMARKS SAT, so a stature span measured short can be read
 * off the export instead of guessed from the scale it produced.
 *
 * Round twelve, 2026-11-06: the dumbbell shoulder press's height ruler read +44% and then +47% on
 * two takes beside the OVR, at 76% of the blend, with the wrists at the top edge of the frame and
 * the 3D shin bone 0.333m where every other take's reads 0.44-0.49 -- everything consistent with
 * the ankle at or past the bottom edge and nothing in the export able to say so. heightRulerFraming
 * is that record: where the ankle and the nose sat (as fractions of the frame), how often a wrist
 * was above the nose or at the top edge, how far the ankle wandered, and the span the ruler reads.
 * It records and gates nothing (Rule #1): no ruler reads it, and this file holds that too.
 *
 * Frames here are in the NATIVE convention the function documents (visionJointsToWorldLandmarks:
 * y = -(joint.y * frameHeight), bottom edge 0, top edge -frameHeight). */
const H = 1280;
function frame(parts: Partial<Record<keyof typeof POSE_LANDMARKS, [number, number]>>, frameHeight: number | null = H) {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  for (const [name, [x, fromBottom]] of Object.entries(parts) as [keyof typeof POSE_LANDMARKS, [number, number]][]) {
    lm[POSE_LANDMARKS[name]] = { x, y: -fromBottom * H, z: 0, visibility: 1 };
  }
  return { worldLandmarks: lm, frameHeight };
}
// An upright athlete with the ankle a tenth of the frame above the bottom edge and the nose a
// tenth below the top; the sign rule needs shoulders above hips.
const standing = (ankleFromBottom = 0.1, noseFromBottom = 0.9, wristFromBottom = 0.5) =>
  frame({
    NOSE: [360, noseFromBottom], LEFT_SHOULDER: [300, noseFromBottom - 0.12], RIGHT_SHOULDER: [420, noseFromBottom - 0.12],
    LEFT_HIP: [320, 0.5], RIGHT_HIP: [400, 0.5],
    LEFT_ANKLE: [330, ankleFromBottom], RIGHT_ANKLE: [390, ankleFromBottom],
    LEFT_WRIST: [250, wristFromBottom], RIGHT_WRIST: [470, wristFromBottom],
  });

describe("heightRulerFraming", () => {
  it("places the ankle and the nose as fractions of the frame, and counts no edge on a well-framed athlete", () => {
    const r = heightRulerFraming([standing(), standing(), standing()]);
    expect(r.framesWithAnkles).toBe(3);
    expect(r.ankleFromBottomMedian).toBeCloseTo(0.1, 3);
    expect(r.noseFromTopMedian).toBeCloseTo(0.1, 3);
    expect(r.ankleAtBottomEdgeFrames).toBe(0);
    expect(r.noseAtTopEdgeFrames).toBe(0);
    expect(r.wristAtTopEdgeFrames).toBe(0);
    expect(r.wristAboveNoseFrames).toBe(0);
    expect(r.ankleWanderUnits).toBe(0);
    expect(r.noseToAnkleSpanMedianUnits).toBeCloseTo(0.8 * H, 0);
  });

  it("counts the frames where the ankle is ON the bottom edge and a wrist at the top, the press's framing", () => {
    // Ankle at 1% of the frame height (inside the 3% band), wrists overhead at 99%.
    const press = standing(0.01, 0.85, 0.99);
    const r = heightRulerFraming([press, press, standing()]);
    expect(r.ankleAtBottomEdgeFrames).toBe(2);
    expect(r.wristAtTopEdgeFrames).toBe(2);
    expect(r.wristAboveNoseFrames).toBe(2);
    expect(r.noseAtTopEdgeFrames).toBe(0);
    expect(HEIGHT_RULER_EDGE_FRACTION).toBe(0.03);
  });

  it("reads the ankle's wander and the span at the extended frames the ruler picks", () => {
    // Twenty frames whose ankle walks up the frame: the wander is p95 - p5 of the ankle y, and
    // the extended span is the (1 - 0.1) percentile of the spans, i.e. the ninetieth.
    const frames = Array.from({ length: 20 }, (_, i) => standing(0.05 + i * 0.01, 0.9));
    const r = heightRulerFraming(frames);
    expect(r.framesWithAnkles).toBe(20);
    // percentile() takes the floor index: p95 of twenty is the largest (0.24), p5 the second (0.06).
    expect(r.ankleWanderUnits).toBeCloseTo((0.24 - 0.06) * H, 0);
    // Spans run (0.9 - 0.05 - i*0.01) * H; sorted ascending the 90th percentile index is 18.
    const spans = frames.map((_, i) => (0.85 - i * 0.01) * H).sort((a, b) => a - b);
    expect(r.noseToAnkleSpanExtendedUnits).toBeCloseTo(spans[18], 0);
    expect(r.noseToAnkleSpanMedianUnits).toBeCloseTo(spans[10], 0);
  });

  it("answers null fractions on a frame with no height stated, and still reads the span", () => {
    const r = heightRulerFraming([standing(), { ...standing(), frameHeight: null }].map((f) => ({ ...f, frameHeight: null })));
    expect(r.ankleFromBottomMedian).toBeNull();
    expect(r.noseFromTopMedian).toBeNull();
    expect(r.noseToAnkleSpanMedianUnits).toBeCloseTo(0.8 * H, 0);
    // Nothing to see: an empty take is an empty record, never a throw.
    const empty = heightRulerFraming([]);
    expect(empty.framesWithAnkles).toBe(0);
    expect(empty.ankleWanderUnits).toBeNull();
  });

  it("is recorded by the bar dialog beside the posture and declared in the schema, and nothing reads it back", () => {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const dialog = strip(readFileSync(join(__dirname, "..", "components", "av-bar-tracker-dialog.tsx"), "utf8"));
    expect(dialog).toMatch(/heightRuler:\s*heightRulerFraming\(calibrationInput\)/);
    // The frames handed to it carry their height, or every fraction is null.
    expect(dialog).toMatch(/calibrationInput = rawFrames\.map\(\(f\) => \(\{ worldLandmarks: visionJointsToWorldLandmarks\(f\), frameHeight: f\.frameHeight \}\)\)/);
    const schema = strip(readFileSync(join(__dirname, "..", "..", "..", "shared", "schema.ts"), "utf8"));
    expect(schema).toMatch(/heightRuler:\s*z\s*\.object\(\{/);
    // Records, gates nothing: no module in the pipeline reads the framing back to choose a ruler.
    for (const file of ["pose-tracking.ts", "bar-tracking.ts", "body-3d-ruler.ts"]) {
      const src = strip(readFileSync(join(__dirname, file), "utf8"));
      const reads = src.match(/\.(ankleAtBottomEdgeFrames|wristAtTopEdgeFrames|ankleFromBottomMedian|noseToAnkleSpanExtendedUnits)\b/g) ?? [];
      expect(reads, `${file} reads the framing back`).toEqual([]);
    }
  });
});
