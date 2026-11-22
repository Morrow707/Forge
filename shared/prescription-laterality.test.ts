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
    // A line is either the JSX itself or the translated sentence's key (client/src/i18n), whose
    // values follow on the next few lines; the suffix must be read within that call.
    const all = src.split("\n");
    const lines = all
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.includes("prescribedSets} × {item.prescribedReps}") || l.includes('"Prescribed: {sets} × {reps}{side}"'));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const CALL_LINES = 5;
    for (const { i } of lines) expect(all.slice(i, i + CALL_LINES).join("\n")).toContain("eachSideSuffix");
  });
});
