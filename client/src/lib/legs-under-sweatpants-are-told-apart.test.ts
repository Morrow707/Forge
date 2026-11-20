import { describe, expect, it } from "vitest";
import { measureLegVisibility } from "./measure-limbs";
import { POSE_LANDMARKS } from "./pose-tracking";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { trackingDiagnosticsSchema } from "@shared/schema";

// LEGS SEEN AND LEGS HIDDEN ARE TOLD APART ON EVERY TAKE (2026-11-20). Scott: "I was wearing
// sweat pants ... it couldn't see my legs unless they were bent, and no ankle, make sure it can
// tell the difference."

const N = 33;
function frame(vis: Partial<Record<number, number>>) {
  return { worldLandmarks: Array.from({ length: N }, (_, i) => ({ x: i, y: i, z: 0, visibility: vis[i] ?? 0.95 })) };
}
const HIDDEN = 0.2;
const L = POSE_LANDMARKS;

describe("leg visibility", () => {
  it("counts a take in shorts as legs seen", () => {
    const v = measureLegVisibility(Array.from({ length: 10 }, () => frame({})));
    expect(v.ankles).toEqual({ framesSeen: 10, medianConfidence: 0.95 });
    expect(v.knees.framesSeen).toBe(10);
  });

  it("tells hidden ankles and knees apart, and only counts the frames a leg was really seen", () => {
    const hidden = frame({ [L.LEFT_ANKLE]: HIDDEN, [L.RIGHT_ANKLE]: HIDDEN, [L.LEFT_KNEE]: HIDDEN, [L.RIGHT_KNEE]: HIDDEN });
    const bent = frame({ [L.LEFT_ANKLE]: HIDDEN, [L.RIGHT_ANKLE]: HIDDEN }); // knees show only when bent
    const v = measureLegVisibility([hidden, hidden, hidden, bent]);
    expect(v.framesTotal).toBe(4);
    expect(v.ankles).toEqual({ framesSeen: 0, medianConfidence: HIDDEN });
    expect(v.knees.framesSeen).toBe(1);
    expect(v.hips.framesSeen).toBe(4);
  });

  it("survives the server's schema, which drops any field it is not told about", () => {
    const legVisibility = measureLegVisibility([frame({})]);
    // A real stored take's diagnostics, so the rest of the object is exactly what the phone sends.
    const fixture = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-11-17-export.json"), "utf8"));
    const real = (Array.isArray(fixture) ? fixture : fixture.captures).find((c: { trackingDiagnostics?: { calibration?: unknown } }) => c.trackingDiagnostics?.calibration).trackingDiagnostics;
    const parsed = trackingDiagnosticsSchema.parse({ ...real, calibration: { ...real.calibration, legVisibility } });
    expect(parsed.calibration?.legVisibility).toEqual(legVisibility);
  });
});
