/**
 * ROUND TWENTY-NINE, 2026-11-24: set 4 of the rows (both sides), the dumbbell shoulder press and
 * the bench on build 840, at 0.5x. The press's OVR counted 12 reps; the first 4 are set-up (Scott),
 * so its truth is reps 5-12.
 *
 * The press's rep timing matches the sensor (0.52s a concentric on both), so its +22.7% is all
 * scale. The bench is not a ledger row: on the file path Vision tracked 644 of 902 frames and lost
 * the body for 0.7-1.3s at the bottom of every press (gaps at 14.0, 14.96, 15.93, 16.86, 17.83,
 * 18.86s), so 4 of 8 reps were found. Only 13 frames lacked a wrist, so the wrist floor does not
 * reach it, and no setting moves a take whose reps are missing.
 */
import { describe, expect, it } from "vitest";
import { ACCURACY_LEDGER } from "@shared/accuracy-ledger";
import { FITTED_OVERRIDES, FITTED_OVERRIDE_EVIDENCE } from "@shared/camera-tunables-by-lift";
import { errorPctFor } from "./ledger-replay";

const ONE_DECIMAL = 1;
const ROW_SHOULDER_STEP = 0.25;
const PRESS_3D_STEP = 0.05;
const ROW_RIGHT = "2026-11-24-single-arm-dumbbell-row-right-set-4";
const ROW_LEFT = "2026-11-24-single-arm-dumbbell-row-left-set-4";
const PRESS = "2026-11-24-dumbbell-shoulder-press-set-4";
/** As filmed on build 840. */
const ROW_RIGHT_AS_FILMED = 0.13;
const ROW_LEFT_AS_FILMED = 2.64;
const PRESS_AS_FILMED = 22.68;
/** Through the live pipeline after this round's steps. */
const ROW_RIGHT_LIVE = -1.45;
const ROW_LEFT_LIVE = 0.83;
const PRESS_LIVE = 22.3;
const AS_FILMED: Record<string, number> = { [ROW_RIGHT]: ROW_RIGHT_AS_FILMED, [ROW_LEFT]: ROW_LEFT_AS_FILMED, [PRESS]: PRESS_AS_FILMED };
const LIVE_AFTER: Record<string, number> = { [ROW_RIGHT]: ROW_RIGHT_LIVE, [ROW_LEFT]: ROW_LEFT_LIVE, [PRESS]: PRESS_LIVE };
const ROUND_29_EVIDENCE_HEAD = "2026-11-24, round twenty-nine";

function row(id: string) {
  const found = ACCURACY_LEDGER.find((r) => r.id === id);
  if (!found) throw new Error(`no ledger row ${id}`);
  return found;
}

function sumAbs(byId: Record<string, number>, ids: string[]): number {
  return ids.map((id) => Math.abs(byId[id])).reduce((a, b) => a + b, 0);
}

describe("round twenty-nine", () => {
  it("the press set 4 reads through the live pipeline closer than as filmed", () => {
    expect(errorPctFor(row(PRESS))).toBeCloseTo(LIVE_AFTER[PRESS], ONE_DECIMAL);
    expect(Math.abs(LIVE_AFTER[PRESS])).toBeLessThan(Math.abs(AS_FILMED[PRESS]));
  });

  it("the row's two sides together move closer: the left gains more than the right gives", () => {
    [ROW_RIGHT, ROW_LEFT].forEach((id) => expect(errorPctFor(row(id)), id).toBeCloseTo(LIVE_AFTER[id], ONE_DECIMAL));
    expect(sumAbs(LIVE_AFTER, [ROW_RIGHT, ROW_LEFT])).toBeLessThan(sumAbs(AS_FILMED, [ROW_RIGHT, ROW_LEFT]));
  });

  it("the bench's set 4 lost the body at the chest: it is not a ledger row", () => {
    expect(ACCURACY_LEDGER.some((r) => r.id === "2026-11-24-bench-press-set-4")).toBe(false);
  });

  it("takes one step per lift and writes it into the lift's evidence", () => {
    expect(FITTED_OVERRIDES["Single-Arm Dumbbell Row"]?.biacromialToleranceFraction).toBe(ROW_SHOULDER_STEP);
    expect(FITTED_OVERRIDES["Dumbbell Shoulder Press"]?.body3DCorrectedUncertainty).toBe(PRESS_3D_STEP);
    ["Dumbbell Shoulder Press", "Single-Arm Dumbbell Row"].forEach((lift) =>
      expect(FITTED_OVERRIDE_EVIDENCE[lift]?.startsWith(ROUND_29_EVIDENCE_HEAD), lift).toBe(true),
    );
  });
});
