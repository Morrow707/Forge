import { describe, it, expect } from "vitest";
import { detectSprintCrossings } from "./sprint-tracking";

// Split times run from the start line; the burnt-in overlay places badges on
// the video's own clock. Without the start-crossing offset every badge was
// drawn early by however long the athlete spent walking up to the line after
// hitting record.

describe("sprint results carry the start crossing on the video clock", () => {
  // The athlete stands still for two seconds, then runs left to right past
  // three checkpoint lines.
  const points = [
    ...Array.from({ length: 20 }, (_, i) => ({ t: i * 100, x: 0, y: 0, z: 0 })),
    { t: 2000, x: 0, y: 0, z: 0 },
    { t: 2500, x: 12, y: 0, z: 0 },
    { t: 3500, x: 30, y: 0, z: 0 },
    { t: 4500, x: 46, y: 0, z: 0 },
  ];
  const calibration = {
    checkpoints: [
      { x: 5, skipCrossings: 0 },
      { x: 25, segmentDistanceYards: 10 },
      { x: 45, segmentDistanceYards: 10 },
    ],
  } as any;

  it("reports when the start line was crossed, not zero", () => {
    const result = detectSprintCrossings(points as any, calibration);
    expect(result).not.toBeNull();
    // The run begins around the two-second mark, well after recording began.
    expect(result!.startCrossingT).toBeGreaterThan(2000);
  });

  it("keeps split times relative to the start line", () => {
    const result = detectSprintCrossings(points as any, calibration);
    const firstSplit = result!.splits[0];
    // A split is time since the previous checkpoint, so it stays far smaller
    // than the absolute video timestamp of the crossing.
    expect(firstSplit.elapsedSeconds).toBeLessThan(result!.startCrossingT / 1000);
    // And placing that split back on the video means adding the offset.
    const badgeMs = result!.startCrossingT + firstSplit.elapsedSeconds * 1000;
    expect(badgeMs).toBeGreaterThan(result!.startCrossingT);
  });
});
