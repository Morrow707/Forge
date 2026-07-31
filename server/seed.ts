import "dotenv/config";
import { db } from "./db";
import { storage } from "./storage";
import { hashPassword } from "./auth-utils";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Seeding Forge demo data...");

  let coach = await storage.getUserByEmail("coach@forge.app");
  if (!coach) {
    coach = await storage.createUser({
      email: "coach@forge.app",
      passwordHash: await hashPassword("coach123"),
      name: "Coach Riley",
      role: "coach",
    });
  }

  let athlete = await storage.getUserByEmail("athlete@forge.app");
  if (!athlete) {
    athlete = await storage.createUser({
      email: "athlete@forge.app",
      passwordHash: await hashPassword("athlete123"),
      name: "Jordan Athlete",
      role: "athlete",
    });
  }

  await storage.linkAthleteToCoach(coach.id, athlete.id);

  const existingExercises = await storage.getExercisesByCoach(coach.id);
  let exerciseMap: Record<string, number> = {};
  if (existingExercises.length === 0) {
    const seedExercises = [
      {
        name: "Back Squat",
        category: "strength" as const,
        muscleGroup: "Legs",
        equipment: "Barbell",
        instructions: "Bar on back, hips and knees drive together, chest up.",
      },
      {
        name: "Bench Press",
        category: "strength" as const,
        muscleGroup: "Chest",
        equipment: "Barbell",
        instructions: "Retract shoulder blades, lower bar to chest, press up.",
      },
      {
        name: "Deadlift",
        category: "strength" as const,
        muscleGroup: "Back",
        equipment: "Barbell",
        instructions: "Neutral spine, drive through the floor, hips and shoulders rise together.",
      },
      {
        name: "Pull-Up",
        category: "accessory" as const,
        muscleGroup: "Back",
        equipment: "Bodyweight",
        instructions: "Full hang to chin over bar, control the descent.",
      },
      {
        name: "Kettlebell Swing",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        equipment: "Kettlebell",
        instructions: "Hip hinge, snap hips to drive the bell to chest height.",
      },
      {
        name: "Box Jump",
        category: "plyometric" as const,
        muscleGroup: "Legs",
        equipment: "Bodyweight",
        instructions: "Explosive triple extension, soft landing.",
      },
      {
        name: "Clean & Jerk",
        category: "olympic" as const,
        muscleGroup: "Full Body",
        equipment: "Barbell",
        instructions: "Pull, receive in front rack, dip and drive overhead.",
      },
      {
        name: "Foam Roll Quads",
        category: "mobility" as const,
        muscleGroup: "Legs",
        equipment: "Foam Roller",
        instructions: "Slow rolls, pause on tender spots for 20-30s.",
      },
      {
        name: "Ankle Dorsiflexion Mobilization",
        category: "mobility" as const,
        muscleGroup: "Ankle",
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "Knee-to-wall drive, keep heel down, 10 slow reps each side.",
      },
      {
        name: "Band Pull-Apart",
        category: "accessory" as const,
        muscleGroup: "Shoulder",
        equipment: "Band",
        movementType: "Activation",
        laterality: "bilateral" as const,
        isCorrective: true,
        instructions: "Arms straight, squeeze shoulder blades together for 2s each rep.",
      },
    ];
    for (const ex of seedExercises) {
      const row = await storage.createExercise(coach.id, ex);
      exerciseMap[ex.name] = row.id;
    }
  } else {
    for (const ex of existingExercises) {
      exerciseMap[ex.name] = ex.id;
    }
  }

  const coachPrograms = await storage.getProgramsByCoach(coach.id);
  let program;
  if (coachPrograms.length === 0) {
    program = await storage.createProgramWithStructure(coach.id, {
      name: "Forge Strength Block",
      description: "4-day full body strength & conditioning program.",
      weeks: [
        {
          weekNumber: 1,
          name: "Week 1 - Foundation",
          days: [
            {
              dayNumber: 1,
              title: "Lower Body Strength",
              isRestDay: false,
              exercises: [
                {
                  exerciseId: exerciseMap["Back Squat"],
                  orderIndex: 0,
                  sets: 5,
                  reps: "5",
                  weight: "75% 1RM",
                  restSeconds: 150,
                },
                {
                  exerciseId: exerciseMap["Box Jump"],
                  orderIndex: 1,
                  sets: 4,
                  reps: "5",
                  weight: "Bodyweight",
                  restSeconds: 90,
                },
              ],
            },
            {
              dayNumber: 2,
              title: "Upper Body Push/Pull",
              isRestDay: false,
              exercises: [
                {
                  exerciseId: exerciseMap["Bench Press"],
                  orderIndex: 0,
                  sets: 4,
                  reps: "8",
                  weight: "70% 1RM",
                  restSeconds: 90,
                  supersetGroup: "week1-day2-super",
                },
                {
                  exerciseId: exerciseMap["Pull-Up"],
                  orderIndex: 1,
                  sets: 4,
                  reps: "8-10",
                  weight: "Bodyweight",
                  restSeconds: 90,
                  supersetGroup: "week1-day2-super",
                },
              ],
            },
            {
              dayNumber: 3,
              title: "Rest / Recovery",
              isRestDay: true,
              exercises: [
                {
                  exerciseId: exerciseMap["Foam Roll Quads"],
                  orderIndex: 0,
                  sets: 1,
                  reps: "5 min",
                  weight: null,
                },
              ],
            },
            {
              dayNumber: 4,
              title: "Full Body Power",
              isRestDay: false,
              exercises: [
                {
                  exerciseId: exerciseMap["Clean & Jerk"],
                  orderIndex: 0,
                  sets: 5,
                  reps: "3",
                  weight: "65% 1RM",
                  restSeconds: 180,
                },
                {
                  exerciseId: exerciseMap["Deadlift"],
                  orderIndex: 1,
                  sets: 3,
                  reps: "5",
                  weight: "80% 1RM",
                  restSeconds: 180,
                },
              ],
            },
            {
              dayNumber: 5,
              title: "Conditioning",
              isRestDay: false,
              exercises: [
                {
                  exerciseId: exerciseMap["Kettlebell Swing"],
                  orderIndex: 0,
                  sets: 5,
                  reps: "20",
                  weight: "24kg",
                  restSeconds: 60,
                },
              ],
            },
            { dayNumber: 6, title: "Rest Day", isRestDay: true, exercises: [] },
            { dayNumber: 7, title: "Rest Day", isRestDay: true, exercises: [] },
          ],
        },
        {
          weekNumber: 2,
          name: "Week 2 - Build",
          days: [
            {
              dayNumber: 1,
              title: "Lower Body Strength",
              isRestDay: false,
              exercises: [
                {
                  exerciseId: exerciseMap["Back Squat"],
                  orderIndex: 0,
                  sets: 5,
                  reps: "5",
                  weight: "78% 1RM",
                  restSeconds: 150,
                },
              ],
            },
            {
              dayNumber: 2,
              title: "Upper Body Push/Pull",
              isRestDay: false,
              exercises: [
                {
                  exerciseId: exerciseMap["Bench Press"],
                  orderIndex: 0,
                  sets: 5,
                  reps: "5",
                  weight: "73% 1RM",
                  restSeconds: 150,
                },
              ],
            },
            { dayNumber: 3, title: "Rest Day", isRestDay: true, exercises: [] },
            {
              dayNumber: 4,
              title: "Full Body Power",
              isRestDay: false,
              exercises: [
                {
                  exerciseId: exerciseMap["Deadlift"],
                  orderIndex: 0,
                  sets: 3,
                  reps: "5",
                  weight: "82% 1RM",
                  restSeconds: 180,
                },
              ],
            },
            { dayNumber: 5, title: "Rest Day", isRestDay: true, exercises: [] },
            { dayNumber: 6, title: "Rest Day", isRestDay: true, exercises: [] },
            { dayNumber: 7, title: "Rest Day", isRestDay: true, exercises: [] },
          ],
        },
      ],
    });

    const startDate = new Date().toISOString().slice(0, 10);

    const { created } = await storage.createAssignment(
      coach.id,
      program.id,
      [{ athleteId: athlete.id, correctivesEnabled: true }],
      startDate,
    );

    // Demonstrate day-specific correctives: leg-day correctives on the lower
    // body day, upper-body correctives on the push/pull day -- different
    // content per day, same athlete, matching how a coach would actually use it.
    const assignment = created[0];
    const fullProgram = await storage.getProgramFull(program.id);
    const week1 = fullProgram?.weeks.find((w) => w.weekNumber === 1);
    const lowerBodyDay = week1?.days.find((d) => d.dayNumber === 1);
    const upperBodyDay = week1?.days.find((d) => d.dayNumber === 2);

    if (assignment && lowerBodyDay) {
      await storage.updateCorrectivesForAssignmentDay(assignment.id, lowerBodyDay.id, {
        correctives: [
          {
            exerciseId: exerciseMap["Ankle Dorsiflexion Mobilization"],
            orderIndex: 0,
            sets: 2,
            reps: "10 each side",
          },
        ],
      });
    }
    if (assignment && upperBodyDay) {
      await storage.updateCorrectivesForAssignmentDay(assignment.id, upperBodyDay.id, {
        correctives: [
          {
            exerciseId: exerciseMap["Band Pull-Apart"],
            orderIndex: 0,
            sets: 3,
            reps: "15",
          },
        ],
      });
    }
  }

  console.log("Seed complete.");
  console.log("Coach login: coach@forge.app / coach123");
  console.log("Athlete login: athlete@forge.app / athlete123");
  console.log(`Coach code: ${coach.coachCode}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
