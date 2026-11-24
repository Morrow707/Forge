/**
 * ROUND TWENTY-SEVEN, 2026-11-24: set 2 of the rows (both sides), the dumbbell shoulder press and
 * the bench, on build 836 -- the first round filmed at 0.5x, the camera's new default.
 *
 * The bench read +75% on range of motion because a plate boxed at 0.55 of its true size was let
 * into the scale by the disc bypass: a near-square box skipped the plate-to-grip check entirely,
 * and this one sat at 0.333 of the grip, under the 0.45 floor the check exists to hold. The bypass
 * now excuses a disc for reading too BIG beside the hands, never too small.
 */
import { describe, expect, it } from "vitest";
import { ACCURACY_LEDGER } from "@shared/accuracy-ledger";
import { FITTED_OVERRIDES, FITTED_OVERRIDE_EVIDENCE } from "@shared/camera-tunables-by-lift";
import { errorPctFor, liveX1000 } from "./ledger-replay";
import { PLATE_TO_GRIP_RATIO_LOW } from "./pose-tracking";

const BENCH_SET_2 = "2026-11-24-bench-press-set-2";
/** Range of motion as filmed, against the sensor: the bench read 64cm for a 36.58cm press. */
const BENCH_AS_FILMED_PCT = 75;
/** Through the live pipeline once the undersized plate is refused and the 3D step is taken. */
const BENCH_LIVE_PCT = 17.84;
const WHOLE_POINTS = 0;
const ONE_DECIMAL = 1;
const PERCENT = 100;
const BENCH_3D_STEP = 0.3;
const PRESS_3D_STEP = 0.06;
const ROW_DEPTH_STEP = 0.55;
const ROUND_27_EVIDENCE_HEAD = "2026-11-24, round twenty-seven";

function row(id: string) {
  const found = ACCURACY_LEDGER.find((r) => r.id === id);
  if (!found) throw new Error(`no ledger row ${id}`);
  return found;
}

describe("round twenty-seven", () => {
  it("records the bench's plate as smaller than its grip allows", () => {
    const bench = row(BENCH_SET_2);
    expect(bench.plateToGripRatio).toBeLessThan(PLATE_TO_GRIP_RATIO_LOW);
    expect(bench.candidates.some((c) => c.source === "plate")).toBe(true);
  });

  it("refuses the undersized disc: the bench goes from +75% as filmed to +17.8% live", () => {
    const bench = row(BENCH_SET_2);
    const asFilmedPct = (bench.reportedRomCm / bench.sensorRomCm - 1) * PERCENT;
    expect(asFilmedPct).toBeCloseTo(BENCH_AS_FILMED_PCT, WHOLE_POINTS);
    expect(errorPctFor(bench)).toBeCloseTo(BENCH_LIVE_PCT, ONE_DECIMAL);
  });

  it("would let the plate back in without the rule (mutation)", () => {
    const bench = row(BENCH_SET_2);
    const withoutTheRule = { ...bench, plateToGripRatio: undefined };
    // The plate drags the blend up when it is admitted, which is the bug this round fixed.
    expect(liveX1000(withoutTheRule)).toBeGreaterThan(liveX1000(bench));
  });

  it("takes one step per lift", () => {
    expect(FITTED_OVERRIDES["Bench Press"]?.body3DCorrectedUncertainty).toBe(BENCH_3D_STEP);
    expect(FITTED_OVERRIDES["Dumbbell Shoulder Press"]?.body3DCorrectedUncertainty).toBe(PRESS_3D_STEP);
    expect(FITTED_OVERRIDES["Single-Arm Dumbbell Row"]?.depthRulerUncertainty).toBe(ROW_DEPTH_STEP);
    ["Bench Press", "Dumbbell Shoulder Press", "Single-Arm Dumbbell Row"].forEach((lift) =>
      expect(FITTED_OVERRIDE_EVIDENCE[lift]?.startsWith(ROUND_27_EVIDENCE_HEAD), lift).toBe(true),
    );
  });
});
