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
 * The scan discovers each field list from the input schema rather than naming it, so the next
 * field added to a schema fails here until its save path writes it -- and it holds all three
 * reconciling saves (program, program day, skill program), since the bug was in the one every
 * Save Program takes and the other two were checked the same evening and found complete.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const schemaSrc = fs.readFileSync(path.resolve(__dirname, "../shared/schema.ts"), "utf8");
const storageSrc = fs.readFileSync(path.resolve(__dirname, "storage.ts"), "utf8");

function schemaFields(schemaName: string): string[] {
  const start = schemaSrc.indexOf(`export const ${schemaName} = z.object({`);
  expect(start, `${schemaName} not found`).toBeGreaterThan(-1);
  // The object's own closing brace: the first line at column 0 after the opening.
  const after = schemaSrc.indexOf("\n", start);
  const end = schemaSrc.slice(after).search(/\n\S/) + after;
  const block = schemaSrc.slice(start, end);
  return [...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
}

/** A `.set({ ... })` written inline on an update of the named table, inside the named function. */
function inlineSetBlock(fnName: string, table: string): string {
  const fn = storageSrc.indexOf(`async ${fnName}(`);
  expect(fn, `${fnName} not found`).toBeGreaterThan(-1);
  const fnEnd = storageSrc.indexOf("\n  },\n", fn);
  const upd = storageSrc.indexOf(`.update(${table})`, fn);
  expect(upd, `.update(${table}) not found inside ${fnName}`).toBeGreaterThan(fn);
  expect(upd).toBeLessThan(fnEnd);
  const start = storageSrc.indexOf(".set({", upd);
  const end = storageSrc.indexOf("})", start);
  return storageSrc.slice(start, end);
}

/** The object literal a save path builds for one exercise row, found by the name it binds. */
function valuesBlock(fnName: string, binding: string): string {
  const fn = storageSrc.indexOf(`async ${fnName}(`);
  expect(fn, `${fnName} not found`).toBeGreaterThan(-1);
  const fnEnd = storageSrc.indexOf("\n  },\n", fn);
  const start = storageSrc.indexOf(`const ${binding} = {`, fn);
  expect(start, `${binding} block not found inside ${fnName}`).toBeGreaterThan(fn);
  expect(start, `${binding} block found outside ${fnName}`).toBeLessThan(fnEnd);
  const end = storageSrc.indexOf("};", start);
  return storageSrc.slice(start, end);
}

/**
 * Every reconciling save, held against the input schema it accepts. `id` is the row's own
 * identity (matched, never copied). Each path is listed with the one schema it parses, so a
 * save added for a new structure has to be added here -- there are three today and the bug
 * was in the one everybody uses.
 */
const SAVE_PATHS: Array<{ fn: string; binding: string; schema: string; skip: string[] }> = [
  { fn: "updateProgramStructure", binding: "exValues", schema: "programExerciseInputSchema", skip: ["id"] },
  { fn: "updateProgramDay", binding: "values", schema: "programExerciseInputSchema", skip: ["id"] },
  { fn: "updateSkillProgramStructure", binding: "exValues", schema: "skillProgramExerciseInputSchema", skip: ["id"] },
];

for (const path of SAVE_PATHS) {
  describe(`${path.fn} writes every field ${path.schema} accepts`, () => {
    const fields = schemaFields(path.schema);
    const block = valuesBlock(path.fn, path.binding);

    it("reads the schema's fields rather than a list", () => {
      expect(fields.length).toBeGreaterThanOrEqual(8);
      expect(fields).toContain("orderIndex");
    });

    for (const field of fields) {
      if (path.skip.includes(field)) continue;
      it(`writes ${field}`, () => {
        expect(block).toMatch(new RegExp(`^\\s*${field}:`, "m"));
      });
    }
  });
}

/**
 * The lesson-level saves, same rule. Child collections (exercises, quiz questions) are written
 * by their own loops; the parent's identity and ordering fields are matched, not copied.
 */
const LESSON_SAVES: Array<{ fn: string; table: string; schema: string; skip: string[] }> = [
  { fn: "updateClassStructure", table: "classLessons", schema: "classLessonInputSchema", skip: ["id", "exercises", "quizQuestions"] },
  { fn: "updateAcademyTrackStructure", table: "academyLessons", schema: "academyLessonInputSchema", skip: ["id"] },
];

for (const path of LESSON_SAVES) {
  describe(`${path.fn} writes every lesson field ${path.schema} accepts`, () => {
    const fields = schemaFields(path.schema);
    const block = inlineSetBlock(path.fn, path.table);
    it("reads the schema's fields rather than a list", () => {
      expect(fields.length).toBeGreaterThanOrEqual(5);
      expect(fields).toContain("title");
    });
    for (const field of fields) {
      if (path.skip.includes(field)) continue;
      it(`writes ${field}`, () => {
        expect(block).toMatch(new RegExp(`^\\s*${field}[:,]`, "m"));
      });
    }
  });
}

describe("the field that was missing", () => {
  it("updateProgramStructure writes restAfterGroupOnly from the input, defaulting to false", () => {
    expect(valuesBlock("updateProgramStructure", "exValues")).toContain(
      "restAfterGroupOnly: ex.restAfterGroupOnly ?? false",
    );
  });
});
