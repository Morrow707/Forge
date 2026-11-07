import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setLogInputSchema, NON_CAMERA_SET_COLUMNS } from "@shared/schema";

/* EVERY SET OF A UNILATERAL EXERCISE IS FILMED ONE SIDE AT A TIME, AND THE SIDE TRAVELS WITH THE ROW.
 *
 * Scott, 2026-11-06: "every set, every rep, every unilateral exercise needs to have a way to film
 * both sides separately." The shape (shared/unilateral-sides.ts): one set ROW per side, carrying
 * `side`, from the workout screen through the save, the read-back, the admin export and the
 * tracking report, and into the tracker as the hand the athlete says is working.
 *
 * A side that is dropped anywhere along that path is a take whose arm nobody can name -- which is
 * exactly the 11-06 row, where the sensor read 41.3cm on one arm and 47.1cm on the other and the
 * export could not say which the camera saw. So this file walks the path and requires the field at
 * every stop, reading each source with comments stripped. The shared helper has its own test. */

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), "utf8"));

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

describe("the side of a unilateral set", () => {
  it("is accepted by the save schema and classified as a non-camera column", () => {
    expect(setLogInputSchema.parse({ setNumber: 1, side: "left" }).side).toBe("left");
    expect(setLogInputSchema.parse({ setNumber: 2, side: "right" }).side).toBe("right");
    // A client from before sides existed still saves.
    expect(setLogInputSchema.parse({ setNumber: 1 }).side).toBeUndefined();
    expect(setLogInputSchema.safeParse({ setNumber: 1, side: "both" }).success).toBe(false);
    expect(NON_CAMERA_SET_COLUMNS).toContain("side");
  });

  it("is a column the reconciler adds, after the type it needs exists", () => {
    const src = readFileSync(join(ROOT, "server", "reconcile-schema.ts"), "utf8");
    const typeAt = src.indexOf('CREATE TYPE "body_side" AS ENUM');
    const alterAt = src.indexOf('ALTER TABLE "workout_set_entries" ADD COLUMN IF NOT EXISTS "side" body_side;');
    expect(typeAt).toBeGreaterThan(0);
    expect(alterAt).toBeGreaterThan(typeAt);
  });

  it("the workout screen builds one row per side, sends the side, and tells the tracker which hand works", () => {
    const src = read("client/src/pages/workout.tsx");
    // One row per side per prescribed set, the side decided by the row's number -- never typed as
    // a literal in this file, so the helper's rule is the only rule.
    expect(src).toMatch(/Array\.from\(\{ length: setRowCountFor\(prescribed\.sets, laterality\) \}/);
    expect(src).toMatch(/side: existingSet \? \(existingSet\.side \?\? null\) : sideForNewSet\(setNumber, laterality\)/);
    expect(src).toMatch(/side: sideForNewSet\(nextNumber, it\.laterality\)/);
    expect(src).not.toMatch(/side: "left"|side: "right"/);
    // The payload carries it.
    expect(src).toMatch(/setNumber: s\.setNumber,\s*side: s\.side,/);
    // The AV bar tracker is handed the row's side.
    expect(src).toMatch(/<AvBarTrackerDialog[\s\S]*?side=\{trackedRow\?\.side \?\? null\}/);
    // And the row is labelled by the helper, never by a hand-typed "Left"/"Right".
    expect(src).toMatch(/setRowLabel\(set\.setNumber, set\.side, item\.laterality\)/);
  });

  it("the server writes it, reads it back, exports it and prints it", () => {
    const storage = read("server/storage.ts");
    expect(storage).toMatch(/setNumber: s\.setNumber,\s*side: s\.side \?\? null,/);
    // Two explicit selects read it -- the coach's exercise analytics and the admin capture export;
    // the day's own read-back (getWorkoutDayDetail) loads the whole row relationally, which the
    // itest beside this file drives.
    const reads = storage.match(/side: workoutSetEntries\.side,/g) ?? [];
    expect(reads.length).toBeGreaterThanOrEqual(2);
    const report = read("server/tracking-report.ts");
    expect(report).toMatch(/side: r\.side \?\? null,/);
    expect(report).toMatch(/e\.side \? `, \$\{e\.side\} side` : ""/);
  });

  it("the tracker records the declared side and whether the hand it measured agrees", () => {
    const dialog = read("client/src/components/av-bar-tracker-dialog.tsx");
    expect(dialog).toMatch(/const declaredSide: "left" \| "right" \| null = laterality === "unilateral" \? \(side \?\? null\) : null;/);
    expect(dialog).toMatch(/declaredSide, workingHandDisagreesWithDeclaredSide/);
    const schema = readFileSync(join(ROOT, "shared", "schema.ts"), "utf8");
    expect(schema).toMatch(/declaredSide: z\.enum\(\["left", "right"\]\)\.nullable\(\)\.optional\(\)/);
    expect(schema).toMatch(/workingHandDisagreesWithDeclaredSide: z\.boolean\(\)\.optional\(\)/);
  });
});
