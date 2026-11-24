/**
 * ROUND TWENTY-EIGHT, 2026-11-24: set 3 of the rows (both sides), the dumbbell shoulder press and
 * the bench on build 838, the first build with the 3D pose told its lens.
 *
 * The lens fix shows on the bench: the depth ruler read 1.09x the 3D bones (2.0x on set 2) and on
 * the press 1.59x (1.88x). The bench's -28.5% is NOT a ledger row: its grip measured 162.5 units on
 * sets 2 and 3 alike, the scale it shipped puts the shoulder landmarks at 0.37m (the 3D skeleton's
 * own 0.1934 of stature), and the wrists sat at a median confidence of 0.23 -- the travel came out
 * short, the scale did not. A scale step there would push the wrong way.
 */
import { describe, expect, it } from "vitest";
import { ACCURACY_LEDGER } from "@shared/accuracy-ledger";
import { FITTED_OVERRIDES, FITTED_OVERRIDE_EVIDENCE } from "@shared/camera-tunables-by-lift";
import { errorPctFor } from "./ledger-replay";

const ONE_DECIMAL = 1;
const ROW_SHOULDER_STEP = 0.24;
const PRESS_3D_STEP = 0.055;
/** Through the live pipeline after this round's steps. */
const ROW_RIGHT_LIVE = -0.07;
const ROW_LEFT_LIVE = -17.96;
const PRESS_LIVE = 11.53;
/** As filmed on build 838. */
const ROW_RIGHT_AS_FILMED = -1.53;
const ROW_LEFT_AS_FILMED = -19.07;
const PRESS_AS_FILMED = 11.79;
const ROW_RIGHT = "2026-11-24-single-arm-dumbbell-row-right-set-3";
const ROW_LEFT = "2026-11-24-single-arm-dumbbell-row-left-set-3";
const PRESS = "2026-11-24-dumbbell-shoulder-press-set-3";
const LIVE_AFTER: Record<string, number> = { [ROW_RIGHT]: ROW_RIGHT_LIVE, [ROW_LEFT]: ROW_LEFT_LIVE, [PRESS]: PRESS_LIVE };
const AS_FILMED: Record<string, number> = { [ROW_RIGHT]: ROW_RIGHT_AS_FILMED, [ROW_LEFT]: ROW_LEFT_AS_FILMED, [PRESS]: PRESS_AS_FILMED };
const ROUND_28_EVIDENCE_HEAD = "2026-11-24, round twenty-eight";

function row(id: string) {
  const found = ACCURACY_LEDGER.find((r) => r.id === id);
  if (!found) throw new Error(`no ledger row ${id}`);
  return found;
}

describe("round twenty-eight", () => {
  it("each take moves toward its OVR through the live pipeline", () => {
    Object.entries(LIVE_AFTER).forEach(([id, pct]) => {
      expect(errorPctFor(row(id)), id).toBeCloseTo(pct, ONE_DECIMAL);
      expect(Math.abs(pct), id).toBeLessThan(Math.abs(AS_FILMED[id]));
    });
  });

  it("the bench's set 3 is a short trace, not a scale: it is not a ledger row", () => {
    expect(ACCURACY_LEDGER.some((r) => r.id === "2026-11-24-bench-press-set-3")).toBe(false);
  });

  it("takes one step per lift", () => {
    expect(FITTED_OVERRIDES["Single-Arm Dumbbell Row"]?.biacromialToleranceFraction).toBe(ROW_SHOULDER_STEP);
    expect(FITTED_OVERRIDES["Dumbbell Shoulder Press"]?.body3DCorrectedUncertainty).toBe(PRESS_3D_STEP);
    ["Dumbbell Shoulder Press", "Single-Arm Dumbbell Row"].forEach((lift) =>
      expect(FITTED_OVERRIDE_EVIDENCE[lift]?.startsWith(ROUND_28_EVIDENCE_HEAD), lift).toBe(true),
    );
  });
});
