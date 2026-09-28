import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPathTrace } from "./bar-tracking";

// A STORED TRACE HAS TO BE REPLAYABLE. On 2026-09-28 the harness ran the device's own trace
// and got a peak of 1.93 where the device had reported 1.66: it read every point at confidence
// 1 and measured along the vertical, where the device filtered by confidence and measured along
// the grip. Constants fitted on a harness that does not reproduce the device are fitted to the
// wrong pipeline.
describe("the stored trace carries what a replay needs", () => {
  it("keeps each point's confidence", () => {
    const trace = buildPathTrace(
      [
        { t: 0, x: 0, y: 0, z: 0, confidence: 0.912 },
        { t: 33, x: 0.01, y: -0.02, z: 0, confidence: 0.4 },
      ],
      { x: 0, y: 0 },
    );
    expect(trace[0].c).toBe(0.91);
    expect(trace[1].c).toBe(0.4);
  });

  it("the dialog records the movement axis and the position scale correction it used", () => {
    const dialog = readFileSync(join(process.cwd(), "client/src/components/av-bar-tracker-dialog.tsx"), "utf8");
    expect(dialog).toMatch(/calibrationDiagnostics\.movementAxis = movementAxis/);
    expect(dialog).toMatch(/calibrationDiagnostics\.positionScaleCorrection = positionScaleCorrection/);
  });

  it("the replay reads them back instead of guessing", () => {
    const replay = readFileSync(join(process.cwd(), "client/src/lib/capture-replay.ts"), "utf8");
    expect(replay).toMatch(/confidence: p\.c \?\? 1/);
    expect(replay).toMatch(/calibration\?\.movementAxis \?\? VERTICAL_AXIS/);
    expect(replay).toMatch(/calibration\?\.positionScaleCorrection \?\? 1/);
  });
});
