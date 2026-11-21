/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/require-regex-example, ts-patterns/no-loop-statements -- ids in fixtures; the field scan reads "  sets: number;" lines of LocalExercise */
import { describe, expect, it } from "vitest";
import { buildImportDraft, type LibraryExercise } from "@shared/program-import";
import { draftToBuilderDays, initialDecisions, rowKey, undecidedRows } from "./program-import-to-builder";
import { readFileSync } from "node:fs";
import path from "node:path";

const LIB: LibraryExercise[] = [
  { id: 1, name: "Back Squat", category: "Strength", videoEligible: true },
  { id: 7, name: "Bulgarian Split Squat", category: "Strength" },
  { id: 20, name: "Side Plank" },
];

const draft = buildImportDraft(
  {
    days: [
      {
        label: "Day 1",
        exercises: [
          { nameAsWritten: "Back Squat", sets: 5, reps: "5", percent1RM: 75, restSeconds: 180 },
          { nameAsWritten: "Bulgrian Split Squat", reps: "8 each", supersetGroup: "A" },
          { nameAsWritten: "Copenhagen Plank", sets: 3, reps: "20s", supersetGroup: "A", notes: "Top leg on bench" },
        ],
      },
    ],
  },
  LIB,
);

let n = 0;
const keys = () => `k${n++}`;

describe("draftToBuilderDays", () => {
  it("refuses while any flagged row is undecided, naming the rows", () => {
    const decisions = initialDecisions(draft);
    expect(decisions.has(rowKey(0, 0))).toBe(true);
    expect(undecidedRows(draft, decisions)).toEqual([rowKey(0, 1), rowKey(0, 2)]);
    expect(draftToBuilderDays(draft, decisions, keys)).toEqual({ ok: false, undecided: [rowKey(0, 1), rowKey(0, 2)] });
  });

  it("puts each row on the exercise the coach decided, keeps the written name, and links the superset", () => {
    const decisions = initialDecisions(draft);
    decisions.set(rowKey(0, 1), { kind: "exercise", exercise: LIB[1] });
    decisions.set(rowKey(0, 2), { kind: "exercise", exercise: LIB[2] });
    const result = draftToBuilderDays(draft, decisions, keys);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [squat, bss, plank] = result.days[0].exercises;
    expect(squat).toMatchObject({ exerciseId: 1, sets: 5, reps: "5", weight: "75% 1RM", restSeconds: "180", notes: "", linkedToNext: false, trackingLevel: "none", videoEligible: true });
    expect(bss).toMatchObject({ exerciseId: 7, sets: 3, linkedToNext: true, notes: 'Written as "Bulgrian Split Squat"' });
    expect(plank).toMatchObject({ exerciseId: 20, linkedToNext: false, notes: 'Written as "Copenhagen Plank". Top leg on bench' });
    expect(plank).not.toHaveProperty("supersetGroup");
  });

  it("a row the coach chose to leave out is left out, and only that row", () => {
    const decisions = initialDecisions(draft);
    decisions.set(rowKey(0, 1), { kind: "skip" });
    decisions.set(rowKey(0, 2), { kind: "skip" });
    const result = draftToBuilderDays(draft, decisions, keys);
    expect(result.ok && result.days[0].exercises.map((e) => e.exerciseId)).toEqual([1]);
  });

  it("every field the builder saves is on every row (the builder's save path reads each one)", () => {
    const decisions = initialDecisions(draft);
    decisions.set(rowKey(0, 1), { kind: "exercise", exercise: LIB[1] });
    decisions.set(rowKey(0, 2), { kind: "exercise", exercise: LIB[2] });
    const result = draftToBuilderDays(draft, decisions, keys);
    if (!result.ok) throw new Error("expected rows");
    const builderSrc = readFileSync(path.join(__dirname, "..", "pages", "program-builder.tsx"), "utf8");
    const local = builderSrc.slice(builderSrc.indexOf("type LocalExercise = {"), builderSrc.indexOf("type LocalDay = {"));
    const fields = [...local.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
    expect(fields.length).toBeGreaterThan(10);
    for (const row of result.days[0].exercises) expect(Object.keys(row).sort()).toEqual([...fields].sort());
  });
});
