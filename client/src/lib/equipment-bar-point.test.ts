import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EQUIPMENT_POINT_CONFIDENCE_FACTOR,
  EquipmentOffsetLearner,
  MAX_EQUIPMENT_OFFSET_SPREAD_GRIPS,
  MIN_EQUIPMENT_AGREEMENT_FRAMES,
  equipmentBoxForBarPath,
} from "./equipment-bar-point";

// The equipment may speak for the bar only after it has agreed with the hands. Every rule in
// equipment-bar-point.ts's header is one of these.
const GRIP = 0.6;

function agree(learner: EquipmentOffsetLearner, frames: number, jitter = 0) {
  for (let i = 0; i < frames; i++) {
    const wobble = jitter * (i % 2 === 0 ? 1 : -1);
    learner.observe({ x: 1.0, y: -0.5 + i * 0.01, confidence: 0.8 }, { x: 1.2, y: -0.4 + i * 0.01 + wobble }, "plate");
  }
}

describe("the equipment earns its vote by agreeing with the hands", () => {
  it("has no vote before enough frames of agreement", () => {
    const learner = new EquipmentOffsetLearner();
    agree(learner, MIN_EQUIPMENT_AGREEMENT_FRAMES - 1);
    expect(learner.ready(GRIP)).toBe(false);
    expect(learner.substitute({ x: 1, y: -0.5, confidence: 0.9 }, GRIP)).toBeNull();
  });

  it("votes once the offset has held steady, carrying the hands' offset with it", () => {
    const learner = new EquipmentOffsetLearner();
    agree(learner, MIN_EQUIPMENT_AGREEMENT_FRAMES);
    expect(learner.ready(GRIP)).toBe(true);
    const point = learner.substitute({ x: 1.0, y: -0.9, confidence: 0.9 }, GRIP);
    // The hands sat 0.2 right and 0.1 above the box every frame, so the box implies that.
    expect(point?.x).toBeCloseTo(1.2, 5);
    expect(point?.y).toBeCloseTo(-0.8, 5);
    expect(point?.confidence).toBeCloseTo(0.9 * EQUIPMENT_POINT_CONFIDENCE_FACTOR, 5);
    expect(learner.substitutedFrames).toBe(1);
  });

  it("never votes when the offset wanders -- a lock on a plate the athlete is not holding", () => {
    const learner = new EquipmentOffsetLearner();
    // A plate on the rack: the hands squat past it, so the vertical offset swings by a grip.
    agree(learner, MIN_EQUIPMENT_AGREEMENT_FRAMES * 2, GRIP * 0.5);
    const spread = learner.offsetSpreadGrips(GRIP);
    expect(spread).not.toBeNull();
    expect(spread!).toBeGreaterThan(MAX_EQUIPMENT_OFFSET_SPREAD_GRIPS);
    expect(learner.ready(GRIP)).toBe(false);
  });

  it("cannot judge agreement with no grip width to measure it in", () => {
    const learner = new EquipmentOffsetLearner();
    agree(learner, MIN_EQUIPMENT_AGREEMENT_FRAMES);
    expect(learner.ready(null)).toBe(false);
    expect(learner.offsetSpreadGrips(null)).toBeNull();
  });
});

describe("which box may speak for the bar", () => {
  const bar = { x: 0.3, y: 0.4, width: 0.4, height: 0.05, confidence: 0.7 };
  const plate = { x: 0.6, y: 0.35, width: 0.12, height: 0.14, confidence: 0.8 };

  it("prefers the bar to the plate whichever slot each arrived in", () => {
    expect(
      equipmentBoxForBarPath({ coreMlImplement: plate, coreMlSecondary: { ...bar, label: "barbell" } }, "plate", 0.5),
    ).toMatchObject({ box: { x: bar.x, y: bar.y }, label: "barbell" });
    expect(
      equipmentBoxForBarPath({ coreMlImplement: bar, coreMlSecondary: { ...plate, label: "plate" } }, "barbell", 0.5),
    ).toEqual({ box: bar, label: "barbell" });
  });

  it("falls back to the plate, which sits at bar height", () => {
    expect(equipmentBoxForBarPath({ coreMlImplement: plate }, "plate", 0.5)).toEqual({ box: plate, label: "plate" });
  });

  it("refuses a held box, a faint box, and any mode that is not a barbell lift", () => {
    expect(equipmentBoxForBarPath({ coreMlImplement: { ...plate, held: true } }, "plate", 0.5)).toBeNull();
    expect(equipmentBoxForBarPath({ coreMlImplement: { ...plate, confidence: 0.2 } }, "plate", 0.5)).toBeNull();
    expect(equipmentBoxForBarPath({ coreMlImplement: plate }, "dumbbell", 0.5)).toBeNull();
    expect(equipmentBoxForBarPath({ coreMlImplement: plate }, undefined, 0.5)).toBeNull();
  });
});

describe("the dialog only lets the equipment fill a hole", () => {
  const dialog = readFileSync(join(process.cwd(), "client/src/components/av-bar-tracker-dialog.tsx"), "utf8");
  const block = dialog.slice(dialog.indexOf("let combinedFromEquipment = false"), dialog.indexOf("if (combinedFromEquipment) barPointFromEquipment++"));

  it("teaches on a frame the hands answered and substitutes only when they did not", () => {
    expect(block).toMatch(/if \(combined\) \{\s*equipmentOffsets\.observe\(/);
    expect(block).toMatch(/\} else \{\s*const substitute = equipmentOffsets\.substitute\(/);
  });

  it("runs the substituted point through the same speed gate as a hand-built one", () => {
    expect(block).toMatch(/substitute && isPlausibleVelocity\(prevCombined/);
  });

  it("runs AFTER the hands' own plausibility gate, so a rejected wrist is a hole it may fill", () => {
    const gate = dialog.indexOf("combinedRejectionEvents.push(t);");
    const fill = dialog.indexOf("let combinedFromEquipment = false");
    expect(gate).toBeGreaterThan(0);
    expect(fill).toBeGreaterThan(gate);
  });
});
