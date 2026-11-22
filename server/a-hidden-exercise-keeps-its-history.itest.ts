import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { exercises, skillExercises } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import {
  correctReviewedSkillInstructions,
  hideReviewedExercises,
  hideReviewedSkillDrills,
  renameDuplicateSkillDrills,
  tagReviewedExercises,
} from "./library-review";
import { CORRECTED_SKILL_INSTRUCTIONS } from "./seed-data/library-review-2026-11-22";
import { makeAssignedProgram, makeAthlete, makeCoach, makeExercise, resetDatabase } from "./test-support/fixtures";

/* THE 2026-11-22 LIBRARY REVIEW HIDES, IT NEVER DELETES, AND NOTHING ANYBODY SAVED CHANGES.
 *
 * Scott approved merging 94 exercises and retiring 40 ("a, apply all of them"). Program rows,
 * assignments and logged sets reference those rows by id, and almost every foreign key onto
 * `exercises` cascades, so a delete would take athletes' history with it. These cases drive the
 * real seed step (server/library-review.ts) against real Postgres and prove: the library owner's
 * row is hidden and a coach's own row of the same name is not; the bank leaves it out; a program
 * that already holds it still loads it by name; a logged set on it still shows its name; a second
 * run changes nothing; a restore sticks; tags fill only empty fields.
 */

/** The load the athlete logged on the exercise before the review hid it. */
const LOGGED_POUNDS = 60;
/** Wall Sit and Step-Down, the two rows the tag case seeds. */
const TAGGED_ROWS = 2;
/** The two "Cone Weave Dribbling" rows, one per sport. */
const DUPLICATE_DRILLS = 2;

type WorkoutLogInput = Parameters<typeof storage.submitWorkoutLog>[1];

async function makeLibraryOwner() {
  return makeCoach({ role: "admin", name: "Forge Library" });
}

describe("a hidden library exercise keeps everything that points at it", () => {
  beforeEach(resetDatabase);

  it("hides the library owner's merged row, leaves a coach's own row alone, and keeps the program and the logged set", async () => {
    const owner = await makeLibraryOwner();
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const libraryPecDeck = await makeExercise(owner.id, { name: "Pec Deck", category: "accessory" });
    const coachPecDeck = await makeExercise(coach.id, { name: "Pec Deck", category: "accessory" });
    const kept = await makeExercise(owner.id, { name: "Machine Chest Fly", category: "accessory" });

    // A program written BEFORE the review, holding the exercise the review merges.
    const { program, day, programExercises, assignment } = await makeAssignedProgram({
      coachId: coach.id,
      athleteId: athlete.id,
      exerciseIds: [libraryPecDeck.id],
    });
    await storage.submitWorkoutLog(athlete.id, {
      assignmentId: assignment.id,
      programDayId: day.id,
      date: "2026-11-01",
      completed: true,
      entries: [
        {
          programExerciseId: programExercises[0].id,
          weightMode: "numeric",
          weightUnit: "lbs",
          sets: [{ setNumber: 1, reps: "10", weight: String(LOGGED_POUNDS) }],
        },
      ],
    } as unknown as WorkoutLogInput);

    const hidden = await hideReviewedExercises(owner.id);
    expect(hidden).toBe(1);

    const libraryRow = await db.query.exercises.findFirst({ where: eq(exercises.id, libraryPecDeck.id) });
    expect(libraryRow?.retiredAt).not.toBeNull();
    expect(libraryRow?.mergedIntoName).toBe("Machine Chest Fly");
    const coachRow = await db.query.exercises.findFirst({ where: eq(exercises.id, coachPecDeck.id) });
    expect(coachRow?.retiredAt).toBeNull();

    // The bank and the picker leave the hidden row out; the coach's own and the kept one stay.
    const visibleIds = (await storage.getVisibleExercisesForCoach(coach.id)).map((e) => e.id);
    expect(visibleIds).not.toContain(libraryPecDeck.id);
    expect(visibleIds).toContain(coachPecDeck.id);
    expect(visibleIds).toContain(kept.id);

    // The program written before the review still loads the exercise, by name.
    const detail = await storage.getVisibleProgramDetail(program.id, coach.id);
    const names = detail!.weeks.flatMap((w) => w.days.flatMap((d) => d.exercises.map((pe) => pe.exercise.name)));
    expect(names).toEqual(["Pec Deck"]);

    // The athlete's workout day still shows it, and the logged set still has its name and load.
    const workoutDay = await storage.getWorkoutDayDetail(athlete.id, assignment.id, day.id, "2026-11-01");
    expect(JSON.stringify(workoutDay)).toContain("Pec Deck");
    const withHistory = await storage.getOwnExercisesWithHistory(athlete.id);
    expect(withHistory.map((e) => e.name)).toContain("Pec Deck");
    const history = await storage.getExerciseHistoryForAthlete(athlete.id, libraryPecDeck.id);
    expect(history).toHaveLength(1);
    expect(Number(history[0].weight)).toBe(LOGGED_POUNDS);

    // Run twice: the second run changes nothing.
    expect(await hideReviewedExercises(owner.id)).toBe(0);
  });

  it("never hides again what an admin restored", async () => {
    const owner = await makeLibraryOwner();
    const row = await makeExercise(owner.id, { name: "Prowler Push", category: "conditioning" });
    expect(await hideReviewedExercises(owner.id)).toBe(1);
    await storage.restoreExercise(row.id);
    expect(await hideReviewedExercises(owner.id)).toBe(0);
    const after = await db.query.exercises.findFirst({ where: eq(exercises.id, row.id) });
    expect(after?.retiredAt).toBeNull();
    expect(after?.restoredAt).not.toBeNull();
    expect((await storage.getExercisesByCoach(owner.id)).map((e) => e.id)).toContain(row.id);
  });

  it("the admin list carries hidden rows only when asked", async () => {
    const owner = await makeLibraryOwner();
    const row = await makeExercise(owner.id, { name: "Jefferson Curl", category: "mobility" });
    await hideReviewedExercises(owner.id);
    expect((await storage.getExercisesByCoach(owner.id, { includeAllAdmins: true })).map((e) => e.id)).not.toContain(row.id);
    const withHidden = await storage.getExercisesByCoach(owner.id, { includeAllAdmins: true, includeHidden: true });
    expect(withHidden.find((e) => e.id === row.id)?.retiredAt).not.toBeNull();
  });

  it("fills a review tag only where the field is empty, and only once", async () => {
    const owner = await makeLibraryOwner();
    const wallSit = await makeExercise(owner.id, { name: "Wall Sit", joints: ["hip"] });
    const stepDown = await makeExercise(owner.id, { name: "Step-Down" });
    expect(await tagReviewedExercises(owner.id)).toBe(TAGGED_ROWS);
    const w = await db.query.exercises.findFirst({ where: eq(exercises.id, wallSit.id) });
    expect(w?.joints).toEqual(["hip"]); // an admin's own tag is kept
    expect(w?.purposes).toEqual(["care"]);
    const s = await db.query.exercises.findFirst({ where: eq(exercises.id, stepDown.id) });
    expect(s?.purposes).toContain("return_to_training");
    expect(s?.cautionNote).toContain("clinician");
    expect(await tagReviewedExercises(owner.id)).toBe(0);
  });

  it("hides skill drills, renames the duplicate by sport and corrects the tackling cue, once", async () => {
    const owner = await makeLibraryOwner();
    const [bball, soccer] = await db
      .insert(skillExercises)
      .values([
        { coachId: owner.id, name: "Cone Weave Dribbling", skillType: "Ball Handling", sports: ["Basketball"] },
        { coachId: owner.id, name: "Cone Weave Dribbling", skillType: "Dribbling", sports: ["Soccer"] },
      ])
      .returning();
    const tackle = CORRECTED_SKILL_INSTRUCTIONS[0];
    const [tackleRow] = await db
      .insert(skillExercises)
      .values({ coachId: owner.id, name: tackle.name, skillType: "Tackling", instructions: tackle.from })
      .returning();
    await db.insert(skillExercises).values({ coachId: owner.id, name: "Nutmeg Attempt Drill", skillType: "Dribbling" });

    expect(await renameDuplicateSkillDrills(owner.id)).toBe(DUPLICATE_DRILLS);
    expect(await correctReviewedSkillInstructions(owner.id)).toBe(1);
    expect(await hideReviewedSkillDrills(owner.id)).toBe(1);

    const rows = await db.query.skillExercises.findMany();
    const nameOf = (id: number) => rows.find((r) => r.id === id)?.name;
    expect(nameOf(bball.id)).toBe("Cone Weave Dribbling (Basketball)");
    expect(nameOf(soccer.id)).toBe("Cone Weave Dribbling (Soccer)");
    expect(rows.find((r) => r.id === tackleRow.id)?.instructions).toBe(tackle.to);
    expect(rows.find((r) => r.name === "Nutmeg Attempt Drill")?.retiredAt).not.toBeNull();

    expect(await renameDuplicateSkillDrills(owner.id)).toBe(0);
    expect(await correctReviewedSkillInstructions(owner.id)).toBe(0);
    expect(await hideReviewedSkillDrills(owner.id)).toBe(0);
  });
});
