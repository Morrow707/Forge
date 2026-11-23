/**
 * THE JUMP TRACKER READS AND TEACHES THE BODY MEMORY (2026-11-23). Scott: the body camera "should
 * be learning limb length". The bar tracker has since 2026-11-16; the jump tracker did neither, so
 * a jump never learned a bone. This pins the plumbing: the remembered bones reach the dialog, are
 * read into the diagnostics, and a corroborated take teaches its lift's bones ("consensus").
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const dialog = strip(readFileSync("client/src/components/av-jump-tracker-dialog.tsx", "utf8"));
const workout = strip(readFileSync("client/src/pages/workout.tsx", "utf8"));

describe("the jump tracker learns limbs", () => {
  it("the workout screen hands the jump tracker the athlete's remembered bones", () => {
    const at = workout.indexOf("<AvJumpTrackerDialog");
    const end = workout.indexOf("/>", at);
    expect(workout.slice(at, end)).toMatch(/bodyModel=\{/);
  });

  it("reads them back on every take into the diagnostics", () => {
    expect(dialog).toMatch(/readBodyModel\(/);
    expect((dialog.match(/bodyModel: bodyModelDiagnostics/g) ?? []).length).toBe(2);
  });

  it("teaches only from a corroborated take, on both save paths", () => {
    expect(dialog).toMatch(/jumpVerdict\.corroborated/);
    expect(dialog).toMatch(/limbMeasurementSource: "consensus"/);
    expect(dialog).toMatch(/limbMeasurementLift: exerciseName/);
    expect((dialog.match(/\.\.\.limbTeaching/g) ?? []).length).toBe(2);
  });
});
