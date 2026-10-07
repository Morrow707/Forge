/* COLLAPSING A DUPLICATE MUST NOT TAKE ANYBODY'S LOGGED SETS WITH IT.
 *
 * Nearly every foreign key onto `exercises` and `skill_exercises` is `onDelete: cascade`, so the
 * obvious implementation of "remove the duplicate" -- a DELETE on the row -- does not tidy the
 * library, it deletes every set logged against that name. This is the test that makes the
 * difference visible: it logs a real set against the duplicate, merges, and asserts the set is
 * still there and now points at the survivor.
 *
 * It runs against real Postgres on purpose. The merge discovers its referencing columns from
 * information_schema, which no mock has, and the whole risk lives in whether that discovery is
 * complete -- a unit test against a stub would assert the stub.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "./db";
import { sql } from "drizzle-orm";
import { exercises, workoutLogEntries, workoutLogs } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  DUPLICATE_EXERCISE_MERGES,
  mergeDuplicateExercise,
} from "./merge-duplicate-exercises";
import {
  makeAssignedProgram,
  makeAthlete,
  makeCoach,
  makeExercise,
  resetDatabase,
} from "./test-support/fixtures";

/** A real logged set against `exerciseId`, through a real assignment -- which is what makes the
 *  cascade reachable: workout_logs hangs off an assignment and the entry off the exercise. */
async function logSetAgainst(
  coachId: number,
  athleteId: number,
  exerciseId: number,
  note: string,
) {
  const { assignment, day } = await makeAssignedProgram({
    coachId,
    athleteId,
    exerciseIds: [exerciseId],
  });
  const [log] = await db
    .insert(workoutLogs)
    .values({ athleteId, assignmentId: assignment.id, programDayId: day.id, date: "2026-10-07" })
    .returning();
  const [entry] = await db
    .insert(workoutLogEntries)
    .values({ workoutLogId: log.id, exerciseId, notes: note })
    .returning();
  return entry;
}

describe("merging a duplicate exercise", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("keeps the logged set and repoints it at the survivor", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const survivor = await makeExercise(coach.id, { name: "Pin Squat" });
    const duplicate = await makeExercise(coach.id, { name: "Anderson Squat" });
    const entry = await logSetAgainst(coach.id, athlete.id, duplicate.id, "logged against the duplicate");

    expect(await mergeDuplicateExercise("exercises", "Anderson Squat", "Pin Squat")).toBe("merged");

    const after = await db.select().from(workoutLogEntries).where(eq(workoutLogEntries.id, entry.id));
    expect(after).toHaveLength(1);
    expect(after[0].exerciseId).toBe(survivor.id);
    expect(after[0].notes).toBe("logged against the duplicate");

    const rows = await db.select().from(exercises).where(eq(exercises.name, "Anderson Squat"));
    expect(rows).toHaveLength(0);
  });

  it("is a no-op the second time, so it can run on every deploy", async () => {
    const coach = await makeCoach();
    await makeExercise(coach.id, { name: "Pin Squat" });
    await makeExercise(coach.id, { name: "Anderson Squat" });
    expect(await mergeDuplicateExercise("exercises", "Anderson Squat", "Pin Squat")).toBe("merged");
    expect(await mergeDuplicateExercise("exercises", "Anderson Squat", "Pin Squat")).toBe(
      "already_merged",
    );
  });

  it("NEVER deletes the duplicate when the survivor is missing", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const orphan = await makeExercise(coach.id, { name: "Anderson Squat" });
    const entry = await logSetAgainst(coach.id, athlete.id, orphan.id, "the only copy");

    expect(await mergeDuplicateExercise("exercises", "Anderson Squat", "Pin Squat")).toBe(
      "no_survivor",
    );

    // The row and its history both survive -- a half-applied seed must never cost a set.
    expect(await db.select().from(exercises).where(eq(exercises.name, "Anderson Squat"))).toHaveLength(1);
    expect(
      await db.select().from(workoutLogEntries).where(eq(workoutLogEntries.id, entry.id)),
    ).toHaveLength(1);
  });

  it("discovers every cascading foreign key, not a hand-written list", async () => {
    // The whole safety argument rests on this query being complete. If a table is added that
    // references exercises.id and this count does not move, the merge is silently incomplete.
    const { rows } = await pool.query<{ child_table: string; child_column: string }>(`
      SELECT tc.table_name AS child_table, kcu.column_name AS child_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
        AND ccu.table_name = 'exercises' AND ccu.column_name = 'id'
    `);
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.map((r) => r.child_table)).toContain("workout_log_entries");
  });

  it("the merge list keeps Cossack Squat and Lateral Lunge apart", async () => {
    // Scott read both and said they are different lifts. A later session reading the duplicate
    // scan's output must not add them: the scan scores them as similar and it is wrong.
    const names = DUPLICATE_EXERCISE_MERGES.flatMap((m) => [m.from, m.into]);
    expect(names).not.toContain("Cossack Squat");
    expect(names).not.toContain("Lateral Lunge");
  });

  it("names a survivor for every merge, and never merges a row into itself", async () => {
    for (const m of DUPLICATE_EXERCISE_MERGES) {
      expect(m.from).not.toBe(m.into);
      expect(m.why.length).toBeGreaterThan(20);
    }
  });
});
