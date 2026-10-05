import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eachSideSuffix } from "./prescription-laterality";

describe("a unilateral prescription says each side", () => {
  it("adds the words only for a unilateral exercise", () => {
    expect(eachSideSuffix("unilateral")).toBe(" each side");
    expect(eachSideSuffix("bilateral")).toBe("");
    expect(eachSideSuffix(null)).toBe("");
    expect(eachSideSuffix(undefined)).toBe("");
  });

  it("is used on EVERY prescription line the athlete reads, not one of them", () => {
    // The workout screen prints the prescription twice -- the collapsed exercise row and the
    // open card's "Prescribed:" line -- and a fix applied to one of them is the bug still
    // live on the other.
    const src = readFileSync(join(process.cwd(), "client/src/pages/workout.tsx"), "utf8");
    const lines = src.split("\n").filter((l) => l.includes("prescribedSets} × {item.prescribedReps}"));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) expect(line).toContain("eachSideSuffix");
  });
});
