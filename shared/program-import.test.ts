/* eslint-disable ts-patterns/no-magic-numbers -- ids and counts in fixtures */
import { describe, expect, it } from "vitest";
import { buildImportDraft, matchImportedExercise, type LibraryExercise } from "./program-import";

const LIBRARY: LibraryExercise[] = [
  { id: 1, name: "Back Squat" },
  { id: 2, name: "Front Squat" },
  { id: 3, name: "Romanian Deadlift" },
  { id: 4, name: "Bench Press" },
  { id: 5, name: "Incline Barbell Bench Press" },
  { id: 6, name: "Close-Grip Bench Press" },
  { id: 7, name: "Bulgarian Split Squat" },
  { id: 8, name: "Pull-Up" },
  { id: 9, name: "Barbell Shoulder Press" },
  { id: 10, name: "Single-Leg RDL to Row" },
];

describe("matchImportedExercise: only a certain name is matched", () => {
  it("matches the exact name, ignoring case, punctuation and a plural", () => {
    expect(matchImportedExercise("back squat", null, LIBRARY)).toMatchObject({ status: "matched", how: "exact", exercise: { id: 1 } });
    expect(matchImportedExercise("Pull Ups", null, LIBRARY)).toMatchObject({ status: "matched", exercise: { id: 8 } });
    expect(matchImportedExercise("Romanian Deadlifts", null, LIBRARY)).toMatchObject({ status: "matched", exercise: { id: 3 } });
  });

  it("matches a whole-name nickname the library defines when it names one exercise", () => {
    expect(matchImportedExercise("RDL", null, LIBRARY)).toMatchObject({ status: "matched", how: "nickname", exercise: { id: 3 } });
    expect(matchImportedExercise("BSS", null, LIBRARY)).toMatchObject({ status: "matched", how: "nickname", exercise: { id: 7 } });
  });

  it("FLAGS a misspelling, with the right exercise first among the suggestions", () => {
    const m = matchImportedExercise("Bulgrian Split Squat", null, LIBRARY);
    expect(m.status).toBe("flagged");
    if (m.status !== "flagged") return;
    expect(m.suggestions[0].id).toBe(7);
  });

  it("FLAGS an ambiguous word rather than picking one of the lifts it could be", () => {
    // "Squat" on a whiteboard could be a back or a front squat; the library's own favourite is a
    // suggestion, never a decision.
    const squat = matchImportedExercise("Squat", null, LIBRARY);
    expect(squat.status).toBe("flagged");
    // "OHP" names two phrases and the library holds one, but it is a nickname of a FAMILY.
    const press = matchImportedExercise("DB bench", null, LIBRARY);
    expect(press.status).toBe("flagged");
  });

  it("FLAGS an exercise the library does not have, keeping the name as written", () => {
    const m = matchImportedExercise("Copenhagen Plank", null, LIBRARY);
    expect(m.status).toBe("flagged");
  });

  it("never matches on the model's guess alone: the guess is the FIRST suggestion, the coach decides", () => {
    const m = matchImportedExercise("Flat BB press", "Bench Press", LIBRARY);
    expect(m.status).toBe("flagged");
    if (m.status !== "flagged") return;
    expect(m.suggestions[0].id).toBe(4);
    expect(m.suggestions.length).toBeLessThanOrEqual(4);
  });

  it("a guess naming nothing in the library adds nothing", () => {
    const m = matchImportedExercise("Zercher Carry", "Zercher Carry", LIBRARY);
    expect(m.status).toBe("flagged");
    if (m.status !== "flagged") return;
    expect(m.suggestions.every((s) => LIBRARY.includes(s))).toBe(true);
  });

  it("two library exercises with the same name is a choice, not a match", () => {
    const lib = [...LIBRARY, { id: 99, name: "Back Squat" }];
    const m = matchImportedExercise("Back Squat", null, lib);
    expect(m.status).toBe("flagged");
  });
});

describe("buildImportDraft", () => {
  const draft = buildImportDraft(
    {
      name: "  Fall Block  ",
      note: "Row 9 was smudged.",
      notPlaced: ["Finisher??", "  "],
      days: [
        {
          label: "Day 2 - Upper",
          order: 2,
          exercises: [{ nameAsWritten: "Bench Press", sets: 4, reps: "6", percent1RM: 80, restSeconds: 120 }],
        },
        {
          label: "Day 1 - Lower",
          order: 1,
          date: "2026-11-23",
          exercises: [
            { nameAsWritten: "Back Squat", sets: 5, reps: "5", load: "225", percent1RM: 75, tempo: "3-1-1", notes: "Belt on top set" },
            { nameAsWritten: "Bulgrian Split Squat", sets: "3" as unknown as number, reps: "8 each", supersetGroup: "A" },
            { nameAsWritten: "Copenhagen Plank", reps: "20s", supersetGroup: "A" },
            { nameAsWritten: "   " },
          ],
        },
        { label: "Off", order: 3, isRestDay: true, exercises: [] },
      ],
    },
    LIBRARY,
  );

  it("keeps the source's day order and puts a date in the day's title", () => {
    expect(draft.days.map((d) => d.title)).toEqual(["Day 1 - Lower (2026-11-23)", "Day 2 - Upper", "Off"]);
    expect(draft.days[2].isRestDay).toBe(true);
  });

  it("keeps every named row, matched or flagged, and counts the flagged ones", () => {
    const rows = draft.days[0].exercises;
    expect(rows.map((r) => r.nameAsWritten)).toEqual(["Back Squat", "Bulgrian Split Squat", "Copenhagen Plank"]);
    expect(rows.map((r) => r.match.status)).toEqual(["matched", "flagged", "flagged"]);
    expect(draft.flaggedCount).toBe(2);
  });

  it("carries load and %1RM, a tempo in the notes, rest and supersets; leaves missing sets missing", () => {
    const [squat, bss, plank] = draft.days[0].exercises;
    expect(squat.weight).toBe("225 (75% 1RM)");
    expect(squat.notes).toBe("Tempo 3-1-1. Belt on top set");
    expect(bss.sets).toBe(3);
    expect(bss.supersetGroup).toBe("A");
    expect(plank.sets).toBeNull();
    expect(draft.days[1].exercises[0]).toMatchObject({ weight: "80% 1RM", restSeconds: 120, sets: 4 });
  });

  it("keeps the name, the note and what could not be placed", () => {
    expect(draft.name).toBe("Fall Block");
    expect(draft.note).toBe("Row 9 was smudged.");
    expect(draft.notPlaced).toEqual(["Finisher??"]);
  });
});
