import { describe, it, expect } from "vitest";
import { buildPathTrace } from "./bar-tracking";
import { EquipmentOffsetLearner, MIN_EQUIPMENT_AGREEMENT_FRAMES } from "./equipment-bar-point";
import { barPathPointSchema } from "@shared/schema";

/* Round twenty-three (2026-11-20): four RDL pulls read 7-12cm short while the plate was locked on
 * 677 frames, and nothing in the export could say where the plate put the bar on those frames.
 * Each trace point now carries `ey` beside `y`. Recorded, never used. */
describe("the trace records where the plate put the bar", () => {
  it("the learner says where an earned box puts the bar without counting a substitution", () => {
    const l = new EquipmentOffsetLearner();
    expect(l.implied({ x: 0, y: 0, confidence: 1 }, 1)).toBeNull();
    for (let i = 0; i < MIN_EQUIPMENT_AGREEMENT_FRAMES; i++) l.observe({ x: 0, y: 10, confidence: 1 }, { x: 2, y: 12 }, "plate");
    expect(l.implied({ x: 0, y: 30, confidence: 1 }, 1)).toEqual({ x: 2, y: 32 });
    expect(l.substitutedFrames).toBe(0);
  });

  it("the stored point keeps ey in the same units as y, and the schema keeps it", () => {
    const [p] = buildPathTrace([{ t: 0, x: 0.1, y: 0.2, z: 0, equipmentY: 0.35 }], { x: 0, y: 0 });
    expect(p.y).toBe(20);
    expect(p.ey).toBe(35);
    expect(barPathPointSchema.parse(p).ey).toBe(35);
    const [q] = buildPathTrace([{ t: 0, x: 0, y: 0, z: 0 }], { x: 0, y: 0 });
    expect("ey" in q).toBe(false);
  });
});
