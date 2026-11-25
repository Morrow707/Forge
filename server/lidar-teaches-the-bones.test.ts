/**
 * A TAKE THE LiDAR RULER SCALED, AND SOMETHING ELSE AGREED WITH, TEACHES THE ATHLETE'S BONES
 * (2026-11-25). The floor ruler owes nothing to the body, so it is a teacher the way a plate is;
 * a body-derived scale still teaches nothing (learning a limb from a limb is circular).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { learnFromTake } from "./body-model-learning";
import { RULERS_THAT_MAY_TEACH_A_LIMB } from "@shared/athlete-body-model";

const UPPER_ARM_M = 0.32;
const SHIN_M = 0.44;

function stripComments(src: string): string {
  return src.replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("LiDAR teaches the bones", () => {
  it("is a teacher, beside the plate", () => {
    expect(RULERS_THAT_MAY_TEACH_A_LIMB).toContain("lidar");
  });

  it("a LiDAR take stores the bones; a height-scaled one stores nothing", () => {
    const fromLidar = learnFromTake(null, { upperArm: UPPER_ARM_M, shin: SHIN_M }, "lidar");
    expect(fromLidar).not.toBeNull();
    expect(learnFromTake(null, { upperArm: UPPER_ARM_M, shin: SHIN_M }, "height")).toBeNull();
  });

  it("the phone names LiDAR as the teacher only when another ruler agreed with it", () => {
    const src = stripComments(readFileSync(join(process.cwd(), "client/src/components/av-bar-tracker-dialog.tsx"), "utf8"));
    const start = src.indexOf("const lidarTeacherScale =");
    const end = src.indexOf(";", start);
    const rule = src.slice(start, end);
    expect(rule).toContain('scaleVerdict.agreedSources.includes("lidar")');
    expect(rule).toContain("scaleVerdict.agreedSources.length > 1");
  });
});
