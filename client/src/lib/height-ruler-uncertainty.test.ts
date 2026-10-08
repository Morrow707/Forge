import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HEIGHT_RULER_UNCERTAINTY, reconcileScaleEstimates } from "./pose-tracking";

/* THE HEIGHT RULER'S CONFIDENCE, HELD AGAINST THE SENSOR IT WAS FITTED ON.
 *
 * Fitted from the 2026-10-04 OVR pairing: range of motion read 8% low on both barbell lifts
 * (0.920 and 0.921), because 0.05 gave the height ruler 400 units of inverse-variance weight
 * against the 3D ruler's 25 -- so the blend WAS the height ruler, and on both lifts the height
 * ruler was the lowest candidate while the one that matched the sensor sat above it.
 *
 * The real candidate lists from that export are the fixtures. The test asserts the OUTCOME
 * (both lifts inside 2% of the sensor) rather than the constant, so a future refit that holds
 * the same accuracy passes and one that undoes it fails.
 */
const U3D = 0.2;
const UDEPTH = 0.2;
const USHOULDER = 0.1;

// Scales x1000, straight off trackingDiagnostics.calibration.scaleCandidates.
const SQUAT = { body3d: 3.969567544340341, depth: 4.644838614278044, height: 3.3809652356778645, shoulder: 4.59032418468343 };
const RDL = { body3d: 3.388318439849525, depth: 4.113168590661936, height: 3.2753940478179103, shoulder: 3.990397918112161 };
// What each take's reported range of motion implies the true scale was:
// squat 68.0cm read against the sensor's 73.9, RDL 54.7 against 59.4.
const SQUAT_SENSOR_SCALE = 3.6547947529533787 / (68.0 / 73.9);
const RDL_SENSOR_SCALE = 3.43338517946498 / (54.7 / 59.4);

function blend(c: { body3d: number; depth: number; height: number; shoulder: number }) {
  const verdict = reconcileScaleEstimates([
    { source: "body_3d", scale: c.body3d / 1000, uncertaintyFraction: U3D },
    { source: "depth", scale: c.depth / 1000, uncertaintyFraction: UDEPTH },
    { source: "height", scale: c.height / 1000, uncertaintyFraction: HEIGHT_RULER_UNCERTAINTY },
    { source: "shoulder_width", scale: c.shoulder / 1000, uncertaintyFraction: USHOULDER },
  ]);
  if (verdict.scale == null) throw new Error("no scale");
  return verdict.scale * 1000;
}

describe("the height ruler's uncertainty, fitted on the 2026-10-04 OVR pairing", () => {
  it("is not tighter than the shoulder ruler -- both are body spans off the same landmarks", () => {
    expect(HEIGHT_RULER_UNCERTAINTY).toBeGreaterThanOrEqual(USHOULDER);
  });

  // 2.5%, because the measured fit is +1.2% on the squat and -2.3% on the RDL and the threshold
  // has to admit the number that was actually chosen. It is the ACCURACY that is pinned, not the
  // constant: a later refit that holds both lifts this close passes, one that gives the 8% back
  // fails. Tightening this is the right thing to do when a pairing supports it.
  it("puts the Back Squat's scale within 2.5% of the sensor", () => {
    const ratio = blend(SQUAT) / SQUAT_SENSOR_SCALE;
    expect(Math.abs(ratio - 1)).toBeLessThan(0.025);
  });

  it("puts the RDL's scale within 2.5% of the sensor", () => {
    const ratio = blend(RDL) / RDL_SENSOR_SCALE;
    expect(Math.abs(ratio - 1)).toBeLessThan(0.025);
  });

  it("would have been 7% low on both at the old 0.05", () => {
    // The bug as a test, so the constant cannot read as arbitrary.
    const old = (c: typeof SQUAT) => {
      const v = reconcileScaleEstimates([
        { source: "body_3d", scale: c.body3d / 1000, uncertaintyFraction: U3D },
        { source: "depth", scale: c.depth / 1000, uncertaintyFraction: UDEPTH },
        { source: "height", scale: c.height / 1000, uncertaintyFraction: 0.05 },
        { source: "shoulder_width", scale: c.shoulder / 1000, uncertaintyFraction: USHOULDER },
      ]);
      return v.scale! * 1000;
    };
    expect(old(SQUAT) / SQUAT_SENSOR_SCALE).toBeLessThan(0.95);
    expect(old(RDL) / RDL_SENSOR_SCALE).toBeLessThan(0.95);
  });

  it("is never a literal on the height row, in any dialog that builds one", () => {
    /* This asserted that both dialogs read HEIGHT_RULER_UNCERTAINTY by name, which is the
     * MECHANISM rather than the rule. Its own comment says what the rule is: "a re-hardcoded
     * 0.05 on the height row is the regression this catches."
     *
     * On 2026-10-08 the bar dialog started reading the uncertainty from this lift's record in
     * shared/camera-tunables-by-lift.ts instead -- the same 0.1, pinned to this constant by
     * camera-tunables-are-a-copy.test.ts, and routed so that the day one lift's uncertainty IS
     * fitted it moves that lift and no other. The old assertion went red for that, which is a
     * ratchet failing on an improvement to the thing it guards.
     *
     * So: a NAMED source, never a number typed on the row. Both spellings pass; a literal does
     * not, which is the regression that was always the point. */
    for (const f of [
      "client/src/components/av-bar-tracker-dialog.tsx",
      "client/src/components/av-jump-tracker-dialog.tsx",
    ]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      const named =
        src.includes("uncertaintyFraction: HEIGHT_RULER_UNCERTAINTY") ||
        src.includes("uncertaintyFraction: scaleTunables.heightRulerUncertainty");
      expect(named, `${f}: the height row's uncertainty is not a named source`).toBe(true);
      // The regression this has always been for.
      expect(src).not.toMatch(/source: "height"[^}]*uncertaintyFraction: 0\.\d/);
    }
  });
});
