import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shedTracesToFit, describeShed, LOG_PAYLOAD_TRACE_BUDGET_BYTES } from "./shed-traces-to-fit";

/* RULE #1 AT THE SAVE BOUNDARY.
 *
 * The Medicine Ball Rotational Throw of 2026-10-04 was filmed, analysed, and produced no row.
 * express.json's 25MB limit answers an oversized body with a 413 before any route runs, 413 is
 * a 4xx, and BOTH the live classifier and the offline queue called a 4xx permanent -- so the
 * set was destroyed, with no number and nothing on the tracking report saying a capture had
 * happened. Scott: "nothing should reject. So the rejected med ball throw is unacceptable."
 *
 * Four things have to stay true, and each is a way this has already failed:
 *   - an oversized save sheds its REPLAY and keeps its NUMBERS;
 *   - the metrics and trackingDiagnostics are never what gets shed;
 *   - 413 is retryable in the live classifier, not permanent;
 *   - 413 is HELD by the queue, not dropped.
 */
function setWithTrace(frames: number) {
  return {
    peakVelocityMps: 1.21,
    romCm: 54.7,
    trackingDiagnostics: { outcome: "ok", calibration: { scaleFactor: 0.0034 } },
    formCheckVideoUrl: "/v/1.mp4",
    skeletonFrames: Array.from({ length: frames }, (_, i) => ({ t: i, j: Array(33).fill([0.5, 0.5, 0.9]) })),
    barPathTrace: Array.from({ length: frames }, (_, i) => ({ t: i, x: 0.5, y: 0.5 })),
    armPathTrace: Array.from({ length: frames }, (_, i) => ({ t: i, x: 0.5, y: 0.5 })),
  };
}

describe("a filmed set is never too big to save", () => {
  it("leaves a payload that already fits completely alone", () => {
    const payload = { entries: [{ sets: [setWithTrace(5)] }] };
    const result = shedTracesToFit(payload);
    expect(result.shed).toEqual([]);
    expect(payload.entries[0].sets[0].skeletonFrames).not.toBeNull();
  });

  it("sheds the replay and keeps every number", () => {
    const payload = { entries: [{ sets: [setWithTrace(400), setWithTrace(400), setWithTrace(400)] }] };
    const before = JSON.stringify(payload).length;
    // A budget the fixture really exceeds, rather than building a 20MB object in a unit test.
    const result = shedTracesToFit(payload, Math.floor(before / 3));
    expect(result.shed.length).toBeGreaterThan(0);
    expect(result.bytesAfter).toBeLessThan(result.bytesBefore);
    expect(result.stillOverBudget).toBe(false);
    for (const set of payload.entries[0].sets) {
      // THE POINT OF THE WHOLE FILE: the measurement survives.
      expect(set.peakVelocityMps).toBe(1.21);
      expect(set.romCm).toBe(54.7);
      expect(set.trackingDiagnostics).toEqual({ outcome: "ok", calibration: { scaleFactor: 0.0034 } });
      expect(set.formCheckVideoUrl).toBe("/v/1.mp4");
    }
  });

  it("gives up skeletonFrames before the bar path", () => {
    // The bar path is what the tracking report draws; the skeleton is for replay. Order matters.
    const payload = { entries: [{ sets: [setWithTrace(300)] }] };
    const before = JSON.stringify(payload).length;
    shedTracesToFit(payload, Math.floor(before * 0.8));
    expect(payload.entries[0].sets[0].skeletonFrames).toBeNull();
    expect(payload.entries[0].sets[0].barPathTrace).not.toBeNull();
  });

  it("sends anyway when even a trace-free payload is over budget", () => {
    const payload = { entries: [{ sets: [setWithTrace(50)] }] };
    const result = shedTracesToFit(payload, 10);
    expect(result.stillOverBudget).toBe(true);
    // Nothing threw, and the numbers are still there to be sent.
    expect(payload.entries[0].sets[0].romCm).toBe(54.7);
    expect(describeShed(result)).toContain("STILL over budget");
  });

  it("keeps a budget under the server's own limit", () => {
    const serverLimit = readFileSync(join(process.cwd(), "server/index.ts"), "utf8").match(
      /express\.json\(\{ limit: "(\d+)mb" \}\)/,
    );
    expect(serverLimit).not.toBeNull();
    expect(LOG_PAYLOAD_TRACE_BUDGET_BYTES).toBeLessThan(Number(serverLimit![1]) * 1024 * 1024);
  });

  it("classifies 413 as retryable in the live save path, and sheds before sending", () => {
    const src = readFileSync(join(process.cwd(), "client/src/pages/workout.tsx"), "utf8");
    expect(src).toContain("const shedResult = shedTracesToFit(payload);");
    // Inside the permanent-rejection condition, not merely somewhere in the file.
    const start = src.indexOf("const isPermanentRejection =");
    expect(start).toBeGreaterThan(-1);
    const condition = src.slice(start, src.indexOf(";", start));
    expect(condition).toContain("err.status !== 413");
  });

  it("holds a 413 in the offline queue instead of dropping the day", () => {
    const src = readFileSync(join(process.cwd(), "client/src/lib/offline-queue.ts"), "utf8");
    expect(src).toContain("if (status === 400 || status === 413)");
    // And the replay sheds too, or a held 413 would be re-sent at the same size forever.
    expect(src).toContain("shedTracesToFit(payload");
  });
});
