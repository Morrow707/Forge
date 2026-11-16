import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { measureLimbSpansInUnits, measureLimbsInMetres } from "./measure-limbs";
import { readBodyModel } from "@shared/athlete-body-model";
import { learnFromTakeForLift } from "../../../server/body-model-learning";

/**
 * THE BODY MEMORY STORED EVERY BONE ABOUT 250x TOO SHORT (2026-11-16, the first two takes on
 * build 769). The bar dialog taught the bones from `frames`, whose landmarks are already
 * multiplied by the take's scale, and multiplied by the scale again; it reads them back from
 * `calibrationInput`, in raw units. The export showed an upper arm of 0.0034m. The two halves
 * have to measure the same thing or a learned bone can never give back the take's scale.
 */
const strip = (src: string) =>
  src
    .split("\n")
    .map((line) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return "";
      const at = line.indexOf("//");
      if (at < 0) return line;
      const before = line.slice(0, at);
      return (before.match(/"/g) ?? []).length % 2 === 0 && (before.match(/`/g) ?? []).length % 2 === 0 ? before : line;
    })
    .join("\n");

const dialog = strip(
  fs.readFileSync(path.resolve(__dirname, "../components/av-bar-tracker-dialog.tsx"), "utf8"),
);

function firstArgs(src: string, fn: string): string[] {
  const out: string[] = [];
  let at = src.indexOf(`${fn}(`);
  while (at >= 0) {
    const open = at + fn.length;
    let depth = 0;
    let i = open;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(open + 1, i).split(",")[0].trim());
    at = src.indexOf(`${fn}(`, i);
  }
  return out;
}

describe("a bone is learned and read the same way", () => {
  it("the bar dialog teaches from the same landmarks it reads spans from", () => {
    const read = firstArgs(dialog, "measureLimbSpansInUnits");
    const taught = firstArgs(dialog, "measureLimbsInMetres");
    expect(read.length).toBeGreaterThan(0);
    expect(taught.length).toBeGreaterThan(0);
    for (const arg of taught) expect(arg).toBe(read[0]);
  });

  it("three takes taught in metres give back each take's scale", () => {
    // A 0.30m upper arm seen as 80 units at 0.00375 m/unit.
    const frame = (k: number) => ({
      worldLandmarks: Array.from({ length: 33 }, (_, j) => ({
        x: j === 11 ? 100 : j === 13 ? 100 : 0,
        y: j === 13 ? 80 + (k % 3) * 0.01 : 0,
        z: 0,
        visibility: j === 11 || j === 13 ? 1 : 0,
      })),
    });
    const frames = Array.from({ length: 40 }, (_, k) => frame(k));
    const scale = 0.00375;
    let model: ReturnType<typeof learnFromTakeForLift> = null;
    for (let take = 0; take < 3; take++) {
      model = learnFromTakeForLift(model, "Back Squat", measureLimbsInMetres(frames, scale), "consensus") ?? model;
    }
    const upperArm = model?.byLift?.["Back Squat"]?.upperArm;
    expect(upperArm?.metres).toBeCloseTo(0.3, 2);
    const reading = readBodyModel(model?.byLift?.["Back Squat"] ?? null, measureLimbSpansInUnits(frames));
    expect(reading?.scale).toBeCloseTo(scale, 5);
  });

  it("a bone outside a human's range is never learned, and a stored one leaves the history", () => {
    const stored = learnFromTakeForLift(null, "Romanian Deadlift", { upperArm: 0.0034 }, "consensus");
    expect(stored).toBeNull();
    const poisoned = {
      byLift: { "Romanian Deadlift": { upperArm: { metres: 0.0034, takes: 1, spreadFraction: 0, sources: ["consensus"] }, history: { upperArm: [0.0034] } } },
    };
    const next = learnFromTakeForLift(poisoned, "Romanian Deadlift", { upperArm: 0.34 }, "consensus");
    const lift = next?.byLift?.["Romanian Deadlift"];
    expect(lift?.history?.upperArm).toEqual([0.34]);
    expect(lift?.upperArm?.metres).toBe(0.34);
    expect(lift?.upperArm?.takes).toBe(1);
  });
});
