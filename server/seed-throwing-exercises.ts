/* THE THREE THROWING-WORKLOAD EXERCISES (2026-11-22), seeded in their own module so this build does
 * not touch the library lists in server/seed.ts (another session is reviewing those). Called once
 * from the seed after the library owner exists.
 *
 * Ordinary library exercises: a pitcher logs a game as one set per inning of "Pitching (Game)" with
 * reps = pitches that inning, a bullpen as one set of "Bullpen" with reps = pitches, and an inning
 * caught as one set of "Catching (Game)". shared/throwing-workload.ts reads them by these names.
 *
 * Created by name when missing and flagged Forge-official under the library owner, exactly as the
 * rest of the library is: the flag write is scoped by owner AND by name, so it can never flag an
 * admin's own exercise that happens to share a name with somebody else's. Equipment "Bodyweight"
 * because a pitch needs nothing from the equipment room, so the room filter never removes one.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { exercises } from "@shared/schema";
import { BULLPEN_EXERCISE, CATCHING_GAME_EXERCISE, PITCHING_GAME_EXERCISE } from "@shared/throwing-workload";

export const THROWING_SEED_EXERCISES = [
  {
    name: PITCHING_GAME_EXERCISE,
    instructions:
      "Log a game as one set per inning pitched: reps are the pitches thrown that inning. Forge adds up pitches and innings for the coach.",
  },
  {
    name: BULLPEN_EXERCISE,
    instructions: "Log a bullpen session as one set: reps are the pitches thrown. It counts toward the week's pitches.",
  },
  {
    name: CATCHING_GAME_EXERCISE,
    instructions: "Log a game behind the plate as one set per inning caught. Reps are optional.",
  },
].map((e) => ({
  ...e,
  category: "conditioning" as const,
  muscleGroup: "Shoulders",
  secondaryMuscles: ["Core"],
  equipment: "Bodyweight",
  movementType: "Rotation",
  laterality: "unilateral" as const,
  sports: ["Baseball", "Softball"],
}));

/** Creates whichever of the three are missing, Forge-official, under the library owner. Never re-flags an existing row, so an admin turning one off is not undone by a deploy. Returns how many it created. */
export async function seedThrowingWorkloadExercises(libraryOwnerId: number): Promise<number> {
  const names = THROWING_SEED_EXERCISES.map((e) => e.name);
  const existing = await db
    .select({ name: exercises.name })
    .from(exercises)
    .where(and(eq(exercises.coachId, libraryOwnerId), inArray(exercises.name, names)));
  const have = new Set(existing.map((e) => e.name));
  const missing = THROWING_SEED_EXERCISES.filter((e) => !have.has(e.name));
  if (missing.length > 0) {
    await db.insert(exercises).values(missing.map((e) => ({ ...e, coachId: libraryOwnerId, isForgeOfficial: true })));
  }
  return missing.length;
}
