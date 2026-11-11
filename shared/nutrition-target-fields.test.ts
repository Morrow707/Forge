import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableColumns } from "drizzle-orm";
import { nutritionTargets, nutritionTargetNumberShape } from "./schema";
import { NUTRITION_TARGET_FIELDS } from "./nutrition-target-fields";

/* EVERY TARGET A NUTRITION SHEET CAN CARRY REACHES THE ATHLETE (2026-11-11).
 *
 * The photographed-sheet import kept its own hand-typed list of six numbers while the table, the
 * targets editor, the food log and the barcode, search and photo-logging paths all carried the
 * eight micronutrients and water too -- so an iron or vitamin D target written on a dietitian's
 * sheet was read past. The list in nutrition-target-fields.ts is the one the import reads now, and
 * this file holds it equal to the table, so a target column added next year is offered by the
 * import the day it exists or this goes red. */

const ROOT = join(__dirname, "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
/** Not target numbers: identity, provenance and the free-text note. */
const NOT_A_TARGET_NUMBER = new Set(["id", "athleteId", "notes", "updatedByUserId", "createdAt", "updatedAt"]);
const PAIR = 2;
/** An iron and a vitamin D target as a dietitian's sheet might write them. */
const IRON_MG = 18;
const VITAMIN_D_MCG = 15;
/** The old hand-typed list spelled these as keys; the one list never does. */
const OLD_LIST_KEYS = ["sodiumMg:", "fiberG:"];
// Comments are stripped before the forbidden-form scans, so a comment quoting the old hand-typed
// list cannot pass or fail them. A `//` counts only outside a string (an even number of quotes
// before it).
const stripComments = (src: string): string =>
  src
    .split("\n")
    .map((line) => {
      const at = line.indexOf("//");
      return at >= 0 && (line.slice(0, at).split('"').length - 1) % PAIR === 0 ? line.slice(0, at) : line;
    })
    .join("\n")
    // A block comment whose opener starts its line, through its first close: matches
    // "  /* note */" and "/** a\n * b */"; leaves `let x = "/*"` alone because the opener is not
    // at the start of its line. https://regex101.com/?regex=%5E%5Cs*%5C%2F%5C*%5B%5Cs%5CS%5D*%3F%5C*%5C%2F&flags=gm
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, "");
const usesNoOldKey = (src: string): void => OLD_LIST_KEYS.forEach((k) => expect(src).not.toContain(k));

/** The source between `start` and the first `end` after it. */
const between = (src: string, start: string, end: string): string => {
  const at = src.indexOf(start);
  expect(at, `${start} not found`).toBeGreaterThanOrEqual(0);
  return src.slice(at, src.indexOf(end, at));
};

describe("every target a nutrition sheet can carry reaches the athlete", () => {
  it("the list is exactly the table's target numbers", () => {
    const columns = Object.keys(getTableColumns(nutritionTargets)).filter((c) => !NOT_A_TARGET_NUMBER.has(c));
    expect(NUTRITION_TARGET_FIELDS.map((f) => f.key).sort()).toEqual(columns.sort());
  });

  it("the import's row schema keeps a micronutrient and still refuses a number out of range", () => {
    const shape = nutritionTargetNumberShape();
    expect(Object.keys(shape).sort()).toEqual(NUTRITION_TARGET_FIELDS.map((f) => f.key).sort());
    expect(shape.ironMg.parse(IRON_MG)).toBe(IRON_MG);
    expect(shape.vitaminDMcg.parse(VITAMIN_D_MCG)).toBe(VITAMIN_D_MCG);
    expect(shape.ironMg.safeParse(-1).success).toBe(false);
  });

  it("the sheet reader, its apply route and its review screen all read the one list", () => {
    const storage = stripComments(read("server/storage.ts"));
    const rowSchema = between(storage, "const nutritionSheetRowSchema", "});");
    expect(rowSchema).toContain("...nutritionTargetNumberShape()");
    usesNoOldKey(rowSchema);
    const tool = between(storage, 'name: "report_nutrition_targets"', "required:");
    expect(tool).toContain("NUTRITION_TARGET_FIELDS.map");
    usesNoOldKey(tool);

    const route = between(stripComments(read("server/routes.ts")), '"/api/coach/roster/nutrition/apply"', "safeParse");
    expect(route).toContain("...nutritionTargetNumberShape()");
    usesNoOldKey(route);

    const dialog = stripComments(read("client/src/components/nutrition-sheet-import-dialog.tsx"));
    expect(dialog).toContain("NUTRITION_TARGET_FIELDS.map");
    expect(dialog).not.toContain('["sodiumMg", "Sodium');
  });
});
