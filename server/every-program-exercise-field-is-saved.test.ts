/**
 * Every field a coach can send for a program exercise is written by the builder's save path.
 *
 * 2026-10-10: driving the real builder on production, the REST toggle ("Between each" / "After
 * the group") was pressed, the program saved, and the row read back `restAfterGroupOnly: false`.
 * The API round-trip proved it was the server: `updateProgramStructure` -- the path every
 * Save Program takes -- rebuilt each exercise's values without that column, so a new row took
 * the default and a reconciled row kept whatever it had. The control had been cosmetic since
 * the reconciling save was written. `createProgram` carried the field all along, which is why
 * nothing noticed: a program made in one shot kept it, a program edited never changed it.
 *
 * The scan discovers the field list from `programExerciseInputSchema` rather than naming it,
 * so the next field added to the schema fails here until the save path writes it. `id` is the
 * row's own identity and `orderIndex` is positional; both are matched, not copied.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const schemaSrc = fs.readFileSync(path.resolve(__dirname, "../shared/schema.ts"), "utf8");
const storageSrc = fs.readFileSync(path.resolve(__dirname, "storage.ts"), "utf8");

function schemaFields(): string[] {
  const start = schemaSrc.indexOf("export const programExerciseInputSchema = z.object({");
  const end = schemaSrc.indexOf("\n});", start);
  const block = schemaSrc.slice(start, end);
  return [...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
}

function updateExerciseValuesBlock(): string {
  const fn = storageSrc.indexOf("async updateProgramStructure(");
  const start = storageSrc.indexOf("const exValues = {", fn);
  const end = storageSrc.indexOf("};", start);
  expect(fn, "updateProgramStructure not found").toBeGreaterThan(-1);
  expect(start, "exValues block not found inside updateProgramStructure").toBeGreaterThan(fn);
  return storageSrc.slice(start, end);
}

describe("updateProgramStructure writes every program-exercise field the schema accepts", () => {
  const fields = schemaFields();
  const block = updateExerciseValuesBlock();

  it("reads the schema's fields rather than a list", () => {
    expect(fields).toContain("restAfterGroupOnly");
    expect(fields).toContain("supersetGroup");
    expect(fields.length).toBeGreaterThanOrEqual(10);
  });

  for (const field of fields) {
    if (field === "id") continue; // the row's own identity: matched by takeRow, never copied
    it(`writes ${field}`, () => {
      expect(block).toMatch(new RegExp(`^\\s*${field}:`, "m"));
    });
  }

  it("writes restAfterGroupOnly from the input, defaulting to false", () => {
    expect(block).toContain("restAfterGroupOnly: ex.restAfterGroupOnly ?? false");
  });
});
