import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { programs, users } from "@shared/schema";
import type { ProgramStructureInput } from "@shared/schema";

// One-off operational script (not a feature) -- run once via `npx tsx
// server/setup-test-program.ts` against a database that already has the
// standard Forge demo data (coach@forge.app / athlete@forge.app and the
// seeded exercise library). Safe to re-run: it no-ops if "Test Program"
// already exists, and only renames/re-owns "Forge Strength Block" if a
// program with that exact name is still present.
async function main() {
  const coach = await storage.getUserByEmail("coach@forge.app");
  const athlete = await storage.getUserByEmail("athlete@forge.app");
  if (!coach || !athlete) {
    throw new Error(
      "Could not find coach@forge.app / athlete@forge.app on this database. " +
        "This script targets the standard demo accounts by email -- if this " +
        "database uses different accounts, it needs to be pointed at them.",
    );
  }

  const admins = await db.query.users.findMany({ where: eq(users.role, "admin") });
  if (admins.length === 0) {
    throw new Error("No admin account exists on this database yet -- create one first.");
  }
  // Prefer whichever admin already owns the Forge exercise library -- that's
  // the established "Forge" identity, rather than an empty/unused admin login.
  let forgeAdminId = admins[0].id;
  let bestCount = -1;
  for (const a of admins) {
    const owned = await storage.getExercisesByCoach(a.id);
    if (owned.length > bestCount) {
      bestCount = owned.length;
      forgeAdminId = a.id;
    }
  }
  console.log(`Using admin id ${forgeAdminId} as the Forge-official owner.`);

  const strengthBlock = await db.query.programs.findFirst({
    where: eq(programs.name, "Forge Strength Block"),
  });
  if (strengthBlock) {
    await db
      .update(programs)
      .set({ coachId: forgeAdminId, name: "Forge Workout Program" })
      .where(eq(programs.id, strengthBlock.id));
    console.log('Renamed "Forge Strength Block" -> "Forge Workout Program" and flagged it Forge-official.');
  } else {
    console.log('No program named "Forge Strength Block" found -- skipping that rename.');
  }

  const alreadyExists = await db.query.programs.findFirst({
    where: eq(programs.name, "Test Program"),
  });
  if (alreadyExists) {
    console.log(`"Test Program" already exists (id ${alreadyExists.id}) -- not creating a duplicate.`);
    process.exit(0);
  }

  const visible = await storage.getVisibleExercisesForCoach(coach.id);
  const byName: Record<string, number> = {};
  for (const ex of visible) byName[ex.name] = ex.id;
  function id(name: string) {
    const found = byName[name];
    if (!found) {
      throw new Error(`Exercise not found: "${name}" -- is the Forge exercise library seeded on this database?`);
    }
    return found;
  }

  const structure: ProgramStructureInput = {
    name: "Test Program",
    description:
      "A deliberately exhaustive program covering every Forge feature in one block: plain strength logging, multi-group supersets, bar-path/full velocity tracking, video-check uploads, %1RM auto-resolution, manual corrective work, and a big multi-exercise day.",
    weeks: [
      {
        weekNumber: 1,
        name: "Week 1 — Everything, Round One",
        days: [
          {
            dayNumber: 1,
            title: "Baseline Strength Check",
            isRestDay: false,
            exercises: [
              { exerciseId: id("Back Squat"), orderIndex: 0, sets: 4, reps: "5", weight: "225 lbs", restSeconds: 150 },
              { exerciseId: id("Bench Press"), orderIndex: 1, sets: 4, reps: "5", weight: "185 lbs", restSeconds: 150 },
              { exerciseId: id("Bent-Over Row"), orderIndex: 2, sets: 3, reps: "8", weight: "135 lbs", restSeconds: 90 },
              { exerciseId: id("Overhead Press"), orderIndex: 3, sets: 3, reps: "8", weight: "95 lbs", restSeconds: 90 },
              { exerciseId: id("Plank"), orderIndex: 4, sets: 3, reps: "60s hold", weight: "Bodyweight", restSeconds: 60 },
            ],
          },
          {
            dayNumber: 2,
            title: "Superset Circuit",
            isRestDay: false,
            exercises: [
              { exerciseId: id("Incline Dumbbell Press"), orderIndex: 0, sets: 3, reps: "10", weight: "60 lbs", restSeconds: 75, supersetGroup: "test-super-a" },
              { exerciseId: id("Chest-Supported Row"), orderIndex: 1, sets: 3, reps: "10", weight: "50 lbs", restSeconds: 75, supersetGroup: "test-super-a" },
              { exerciseId: id("Bulgarian Split Squat"), orderIndex: 2, sets: 3, reps: "8/side", weight: "30 lbs", restSeconds: 90, supersetGroup: "test-super-b" },
              { exerciseId: id("Nordic Hamstring Curl"), orderIndex: 3, sets: 3, reps: "6", weight: "Bodyweight", restSeconds: 90, supersetGroup: "test-super-b" },
              { exerciseId: id("Barbell Curl"), orderIndex: 4, sets: 3, reps: "10", weight: "60 lbs", restSeconds: 60, supersetGroup: "test-super-c" },
              { exerciseId: id("Hammer Curl"), orderIndex: 5, sets: 3, reps: "10", weight: "30 lbs", restSeconds: 60, supersetGroup: "test-super-c" },
              { exerciseId: id("Tricep Rope Pushdown"), orderIndex: 6, sets: 3, reps: "12", weight: "50 lbs", restSeconds: 60, supersetGroup: "test-super-c" },
            ],
          },
          {
            dayNumber: 3,
            title: "Bar Speed Lab",
            isRestDay: false,
            exercises: [
              { exerciseId: id("Back Squat"), orderIndex: 0, sets: 5, reps: "3", weight: "245 lbs", restSeconds: 180, trackingLevel: "full" },
              { exerciseId: id("Bench Press"), orderIndex: 1, sets: 5, reps: "3", weight: "205 lbs", restSeconds: 180, trackingLevel: "full" },
              { exerciseId: id("Deadlift"), orderIndex: 2, sets: 3, reps: "5", weight: "315 lbs", restSeconds: 180, trackingLevel: "bar_path" },
              { exerciseId: id("Box Jump"), orderIndex: 3, sets: 4, reps: "5", weight: "Bodyweight", restSeconds: 90, trackingLevel: "full" },
            ],
          },
          { dayNumber: 4, title: "Rest Day", isRestDay: true, exercises: [] },
          {
            dayNumber: 5,
            title: "Video Check Day",
            isRestDay: false,
            exercises: [
              { exerciseId: id("Back Squat"), orderIndex: 0, sets: 3, reps: "5", weight: "205 lbs", restSeconds: 150, videoCheckEnabled: true },
              { exerciseId: id("Overhead Press"), orderIndex: 1, sets: 3, reps: "6", weight: "85 lbs", restSeconds: 90, videoCheckEnabled: true },
              { exerciseId: id("Bulgarian Split Squat"), orderIndex: 2, sets: 3, reps: "8/side", weight: "Bodyweight", restSeconds: 90, videoCheckEnabled: true },
              { exerciseId: id("Deadlift"), orderIndex: 3, sets: 3, reps: "5", weight: "275 lbs", restSeconds: 150, videoCheckEnabled: true },
            ],
          },
          { dayNumber: 6, title: "Rest Day", isRestDay: true, exercises: [] },
          { dayNumber: 7, title: "Rest Day", isRestDay: true, exercises: [] },
        ],
      },
      {
        weekNumber: 2,
        name: "Week 2 — Everything, Round Two",
        days: [
          {
            dayNumber: 1,
            title: "%1RM Auto-Adjust Day",
            isRestDay: false,
            exercises: [
              { exerciseId: id("Back Squat"), orderIndex: 0, sets: 4, reps: "3", weight: "80% 1RM", restSeconds: 180 },
              { exerciseId: id("Bench Press"), orderIndex: 1, sets: 4, reps: "5", weight: "75% 1RM", restSeconds: 150 },
              { exerciseId: id("Deadlift"), orderIndex: 2, sets: 3, reps: "3", weight: "85% 1RM", restSeconds: 180 },
              { exerciseId: id("Overhead Press"), orderIndex: 3, sets: 3, reps: "6", weight: "70% 1RM", restSeconds: 90 },
            ],
          },
          {
            dayNumber: 2,
            title: "Kitchen Sink Day",
            isRestDay: false,
            exercises: [
              { exerciseId: id("Back Squat"), orderIndex: 0, sets: 3, reps: "3", weight: "75% 1RM", restSeconds: 180, supersetGroup: "test-super-d", trackingLevel: "full", videoCheckEnabled: true },
              { exerciseId: id("Deadlift"), orderIndex: 1, sets: 3, reps: "3", weight: "70% 1RM", restSeconds: 180, supersetGroup: "test-super-d", trackingLevel: "bar_path", videoCheckEnabled: true },
              { exerciseId: id("Incline Dumbbell Press"), orderIndex: 2, sets: 3, reps: "10", weight: "65 lbs", restSeconds: 75, supersetGroup: "test-super-e" },
              { exerciseId: id("Chest-Supported Row"), orderIndex: 3, sets: 3, reps: "10", weight: "55 lbs", restSeconds: 75, supersetGroup: "test-super-e" },
              { exerciseId: id("Plank"), orderIndex: 4, sets: 3, reps: "60s hold", weight: "Bodyweight", restSeconds: 60 },
            ],
          },
          {
            dayNumber: 3,
            title: "Corrective Focus Day",
            isRestDay: false,
            exercises: [
              { exerciseId: id("Goblet Squat"), orderIndex: 0, sets: 3, reps: "10", weight: "53 lbs", restSeconds: 75 },
              { exerciseId: id("Farmer's Carry"), orderIndex: 1, sets: 3, reps: "40yd", weight: "70 lbs/hand", restSeconds: 90 },
            ],
          },
          { dayNumber: 4, title: "Rest Day", isRestDay: true, exercises: [] },
          {
            dayNumber: 5,
            title: "Final Gauntlet",
            isRestDay: false,
            exercises: [
              { exerciseId: id("Back Extension"), orderIndex: 0, sets: 3, reps: "12", weight: "Bodyweight", restSeconds: 60 },
              { exerciseId: id("Barbell Shrug"), orderIndex: 1, sets: 3, reps: "10", weight: "185 lbs", restSeconds: 60 },
              { exerciseId: id("Cable Crunch"), orderIndex: 2, sets: 3, reps: "15", weight: "60 lbs", restSeconds: 45 },
              { exerciseId: id("Close-Grip Bench Press"), orderIndex: 3, sets: 3, reps: "8", weight: "135 lbs", restSeconds: 90 },
              { exerciseId: id("Hip Thrust"), orderIndex: 4, sets: 3, reps: "10", weight: "185 lbs", restSeconds: 90 },
              { exerciseId: id("Lat Pulldown"), orderIndex: 5, sets: 3, reps: "10", weight: "120 lbs", restSeconds: 75 },
              { exerciseId: id("Pallof Press"), orderIndex: 6, sets: 3, reps: "10/side", weight: "30 lbs", restSeconds: 45 },
              { exerciseId: id("Russian Twist"), orderIndex: 7, sets: 3, reps: "20", weight: "20 lbs", restSeconds: 45 },
              { exerciseId: id("Standing Calf Raise"), orderIndex: 8, sets: 4, reps: "12", weight: "225 lbs", restSeconds: 60 },
            ],
          },
          { dayNumber: 6, title: "Rest Day", isRestDay: true, exercises: [] },
          { dayNumber: 7, title: "Rest Day", isRestDay: true, exercises: [] },
        ],
      },
    ],
  };

  const program = await storage.createProgramWithStructure(forgeAdminId, structure);
  console.log(`Created "${program.name}" (id ${program.id}), owned by admin ${forgeAdminId}.`);

  const full = await storage.getProgramFull(program.id);
  if (!full) throw new Error("Failed to reload created program");

  const correctiveDay = full.weeks
    .flatMap((w) => w.days)
    .find((d) => d.title === "Corrective Focus Day");
  if (!correctiveDay) throw new Error("Could not find Corrective Focus Day");

  // Demonstrate manual per-day scheduling: push the corrective day a week
  // past the program's normal 14-day span (well clear of every other day's
  // default date, so it can't collide) as if working around a game/travel day.
  const startDate = new Date().toISOString().slice(0, 10);
  const start = new Date(startDate + "T00:00:00Z");
  const correctiveWeekOffsetDays = (2 - 1) * 7 + (correctiveDay.dayNumber - 1);
  const defaultDate = new Date(start.getTime() + correctiveWeekOffsetDays * 86400000);
  const overriddenDate = new Date(defaultDate.getTime() + 7 * 86400000);
  const dateOverrides = {
    [String(correctiveDay.id)]: overriddenDate.toISOString().slice(0, 10),
  };

  const { created } = await storage.createAssignment(
    coach.id,
    program.id,
    [{ athleteId: athlete.id, correctivesEnabled: true }],
    startDate,
    dateOverrides,
  );
  const assignment = created[0];
  console.log(`Assigned to ${athlete.name} starting ${startDate} (assignment ${assignment.id}).`);
  console.log(
    `Moved "${correctiveDay.title}" from ${defaultDate.toISOString().slice(0, 10)} to ${dateOverrides[String(correctiveDay.id)]} via manual scheduling override.`,
  );

  await storage.updateCorrectivesForAssignmentDay(assignment.id, correctiveDay.id, {
    correctives: [
      { exerciseId: id("Ankle Dorsiflexion Mobilization"), orderIndex: 0, sets: 2, reps: "10/side", weight: null },
      { exerciseId: id("World's Greatest Stretch"), orderIndex: 1, sets: 2, reps: "6/side", weight: null },
      { exerciseId: id("Band External Rotation"), orderIndex: 2, sets: 2, reps: "15/side", weight: null },
    ],
  });
  console.log("Attached 3 correctives to Corrective Focus Day.");

  console.log(`\nDone. "${program.name}" is live for ${athlete.email}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
