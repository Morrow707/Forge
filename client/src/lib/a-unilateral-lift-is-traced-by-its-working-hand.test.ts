import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BAR_POINT_SOURCES, workingHandForUnilateral } from "./bar-tracking";

/* THE MIDPOINT OF TWO HANDS IS THE MIDDLE OF A BAR, AND A UNILATERAL LIFT HAS NO BAR.
 *
 * Round eleven, 2026-11-06: the Single-Arm Dumbbell Row (70lb x8) beside the OVR reported 21.9cm
 * of range against the sensor's 41-47cm. Of its 754 bar points 522 were a lone hand "carried back
 * to the middle" by a half-span measured between the braced hand on the bench and the working
 * hand, and 84 were the midpoint of the two -- so the traced point travelled HALF as far as the
 * dumbbell, exactly. That is barPointFromSides doing its job on a lift it was never written for.
 *
 * The rule (workingHandForUnilateral, bar-tracking.ts): on a unilateral lift the tracked point is
 * the WORKING hand -- the wrist whose vertical travel over the take is the larger -- decided once
 * for the take, never averaged with the braced hand and never carried. A bilateral lift never
 * reaches it, which the dialog scan below holds, so every barbell take is bit-identical.
 *
 * It cannot be replayed on the 11-06 trace, which is already the midpoint; the stored
 * bodyWitnessTrace carries the wrist MIDPOINT too. The next row take, filmed on this rule, is its
 * sensor test; this file is the rule on synthetic input and the wiring in the dialog.
 *
 * Mutations, each caught by the named case:
 *  - the helper returns the hand with the SMALLER span -> "picks the hand that travels";
 *  - the helper reads min/max instead of percentiles -> "one jumped landmark does not pick";
 *  - the dialog's gate drops `laterality === "unilateral"` -> "the dialog decides it from laterality";
 *  - the dialog keeps averaging (no `combined = working ...`) -> "the working hand IS the point";
 *  - a comment quoting the forbidden form -> the strip case.
 */

const DIALOG = join(__dirname, "..", "components", "av-bar-tracker-dialog.tsx");

function stripComments(text: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of text.split("\n")) {
    const t = line.trimStart();
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
      continue;
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) inBlock = true;
      continue;
    }
    if (t.startsWith("//")) continue;
    out.push(line);
  }
  return out.join("\n");
}

/** A braced hand jittering by `jitter` around 0 and a working hand rowing `travel` up and down. */
function synthetic(travel: number, jitter: number, frames = 60, working: "left" | "right" = "right") {
  return Array.from({ length: frames }, (_, i) => {
    const rowing = (travel / 2) * Math.sin((i / frames) * 4 * Math.PI);
    const braced = jitter * Math.sin(i * 1.7);
    return working === "right" ? { left: braced, right: rowing } : { left: rowing, right: braced };
  });
}

describe("workingHandForUnilateral", () => {
  it("picks the hand that travels", () => {
    expect(workingHandForUnilateral(synthetic(220, 15, 60, "right"))).toBe("right");
    expect(workingHandForUnilateral(synthetic(220, 15, 60, "left"))).toBe("left");
  });

  it("one jumped landmark does not pick the hand", () => {
    // The braced hand sits still for 59 frames and jumps 2000 units on one -- a landmark error, not
    // a row. A min/max span would call the braced hand the worker; a percentile span does not.
    const frames = synthetic(220, 5, 60, "right");
    frames[30] = { left: 2000, right: frames[30].right };
    expect(workingHandForUnilateral(frames)).toBe("right");
  });

  it("a hand never seen is never the worker, and two hands never seen is no answer", () => {
    expect(workingHandForUnilateral(synthetic(220, 5, 60, "right").map((f) => ({ ...f, left: null })))).toBe("right");
    expect(workingHandForUnilateral(synthetic(220, 5, 60, "left").map((f) => ({ ...f, right: null })))).toBe("left");
    expect(workingHandForUnilateral(Array.from({ length: 40 }, () => ({ left: null, right: null })))).toBeNull();
  });

  it("needs enough samples of a hand to call it the worker", () => {
    // Seven frames of a left hand swinging 5000 units are not a measurement; the right has sixty.
    const frames = synthetic(220, 5, 60, "right").map((f, i) => ({ ...f, left: i < 7 ? (i % 2 ? 5000 : 0) : null }));
    expect(workingHandForUnilateral(frames)).toBe("right");
    expect(workingHandForUnilateral(frames, 7)).toBe("left");
  });

  it("is recorded as its own point source", () => {
    expect(BAR_POINT_SOURCES.w).toMatch(/working hand/);
  });
});

describe("the bar dialog hands a unilateral lift to its working hand", () => {
  const src = stripComments(readFileSync(DIALOG, "utf8"));

  it("the dialog decides it from laterality, once per take, before the frame loop", () => {
    const decl = src.indexOf("const measuredWorkingHand");
    expect(decl, "the dialog no longer measures a working hand").toBeGreaterThan(0);
    const stmt = src.slice(decl, src.indexOf(";", src.indexOf("workingHandForUnilateral(", decl)));
    expect(stmt).toMatch(/laterality === "unilateral"/);
    expect(stmt).toMatch(/workingHandForUnilateral\(/);
    // Decided before the per-frame loop, so one hand serves the whole take.
    expect(decl).toBeLessThan(src.indexOf("for (const f of rawFrames)"));
    // The measurement wins, the declared side (the set row's) fills in where it cannot say, and a
    // disagreement between the two is recorded rather than refused.
    expect(src).toMatch(/const unilateralWorkingHand: "left" \| "right" \| null = measuredWorkingHand \?\? declaredSide;/);
    expect(src).toMatch(/measuredWorkingHand != null && declaredSide != null && measuredWorkingHand !== declaredSide/);
  });

  it("the working hand IS the point: never averaged with the braced hand, never carried", () => {
    const at = src.indexOf("if (unilateralWorkingHand) {");
    expect(at, "the fusion loop no longer branches on the working hand").toBeGreaterThan(0);
    const block = src.slice(at, src.indexOf("\n      }\n", at));
    expect(block).toMatch(/const working = unilateralWorkingHand === "left" \? fusedLeft : fusedRight/);
    // The point is the working hand's own x/y, or nothing -- not the midpoint and not a carry.
    expect(block).toMatch(/combined = working \? \{ x: working\.x, y: working\.y, confidence: working\.confidence \} : null/);
  });

  it("a unilateral point is tagged `w` and counted, and a bilateral take never is", () => {
    expect(src).toMatch(/if \(unilateralWorkingHand && combined\) pointSource = "w";/);
    expect(src).toMatch(/if \(unilateralWorkingHand && combined\) barPointFromWorkingHand\+\+;/);
    // The diagnostics carry the hand and the count only on a unilateral take.
    expect(src).toMatch(/laterality === "unilateral"\s*\? \{ unilateralWorkingHand, barPointFromWorkingHand, declaredSide, workingHandDisagreesWithDeclaredSide \}\s*: \{\}/);
  });

  it("two hands on a unilateral lift are not a grip pair", () => {
    // The grip pairs feed movementAxisFromGrip; a braced hand and a working hand are not a bar.
    expect(src).toMatch(/if \(fusedLeft && fusedRight && !unilateralWorkingHand\) \{\s*gripPairs\.push/);
  });

  it("the two diagnostics fields are declared where zod would otherwise strip them", () => {
    const schema = readFileSync(join(__dirname, "..", "..", "..", "shared", "schema.ts"), "utf8");
    expect(schema).toMatch(/unilateralWorkingHand: z\.enum\(\["left", "right"\]\)\.nullable\(\)\.optional\(\)/);
    expect(schema).toMatch(/barPointFromWorkingHand: z\.number\(\)\.optional\(\)/);
  });

  it("the comment strip is load-bearing: a comment quoting the forbidden form does not pass", () => {
    // The fix's own comment above the branch quotes "carried back to the middle"; the scan must
    // read the code, not the prose. Proven on a synthetic input rather than claimed.
    const prose = `// if (unilateralWorkingHand) {\n//   const working = unilateralWorkingHand === "left" ? fusedLeft : fusedRight;\nconst x = 1;`;
    expect(stripComments(prose)).not.toMatch(/const working/);
    expect(prose).toMatch(/const working/);
  });
});
