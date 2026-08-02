import "dotenv/config";
import { db } from "./db";
import { storage } from "./storage";
import { hashPassword } from "./auth-utils";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

// We don't have live web access from this environment to verify specific
// YouTube video IDs are real and still online, so hand-picking exact links
// risks seeding dead or wrong embeds. A search link is always valid and
// always relevant; the athlete's video player auto-upgrades to a real
// embedded player the moment a coach edits the exercise with a direct link.
function videoSearchUrl(name: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise tutorial`)}`;
}

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

  // A pure admin account, shareable the same way the coach/athlete demo
  // logins are -- no calendar or roster access, just Forge library curation.
  const demoAdmin = await storage.getUserByEmail("admin@forge.app");
  if (!demoAdmin) {
    await storage.createUser({
      email: "admin@forge.app",
      passwordHash: await hashPassword("admin123"),
      name: "Forge Admin",
      role: "admin",
    });
  }

  // Looked up system-wide (not scoped to this coach) since an exercise's
  // owner can change after seeding -- e.g. once transferred to the admin as
  // an official Forge exercise below, it would otherwise look "new" again
  // to a coach-scoped check and get recreated as a duplicate on every deploy.
  const allExercises = await storage.getAllExercises();
  const existingExerciseNames = new Set(allExercises.map((e) => e.name));
  const exerciseMap: Record<string, number> = {};
  for (const ex of allExercises) exerciseMap[ex.name] = ex.id;

  {
    const seedExercises = [
      {
        name: "Back Squat",
        category: "strength" as const,
        muscleGroup: "Quads",
        equipment: "Barbell",
        movementType: "Squat",
        laterality: "bilateral" as const,
        instructions: "Bar on back, hips and knees drive together, chest up.",
      },
      {
        name: "Bench Press",
        category: "strength" as const,
        muscleGroup: "Chest",
        equipment: "Barbell",
        movementType: "Push",
        laterality: "bilateral" as const,
        instructions: "Retract shoulder blades, lower bar to chest, press up.",
      },
      {
        name: "Deadlift",
        category: "strength" as const,
        muscleGroup: "Hamstrings",
        equipment: "Barbell",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        instructions: "Neutral spine, drive through the floor, hips and shoulders rise together.",
      },
      {
        name: "Pull-Up",
        category: "accessory" as const,
        muscleGroup: "Lats",
        equipment: "Bodyweight",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Full hang to chin over bar, control the descent.",
      },
      {
        name: "Kettlebell Swing",
        category: "conditioning" as const,
        muscleGroup: "Glutes",
        equipment: "Kettlebell",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        instructions: "Hip hinge, snap hips to drive the bell to chest height.",
      },
      {
        name: "Box Jump",
        category: "plyometric" as const,
        muscleGroup: "Quads",
        equipment: "Bodyweight",
        movementType: "Squat",
        laterality: "bilateral" as const,
        instructions: "Explosive triple extension, soft landing.",
      },
      {
        name: "Clean & Jerk",
        category: "olympic" as const,
        muscleGroup: "Full Body",
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Pull, receive in front rack, dip and drive overhead.",
      },
      {
        name: "Foam Roll Quads",
        category: "mobility" as const,
        muscleGroup: "Quads",
        equipment: "Foam Roller",
        movementType: "Mobility",
        laterality: "bilateral" as const,
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
        muscleGroup: "Shoulders",
        equipment: "Band",
        movementType: "Activation",
        laterality: "bilateral" as const,
        isCorrective: true,
        instructions: "Arms straight, squeeze shoulder blades together for 2s each rep.",
      },
      {
        name: "Band External Rotation",
        category: "mobility" as const,
        muscleGroup: "Shoulders",
        equipment: "Band",
        movementType: "Activation",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "Elbow pinned to side at 90°, rotate forearm out slowly, control the return.",
      },
      {
        name: "90/90 Hip Switch",
        category: "mobility" as const,
        muscleGroup: "Hip Flexors",
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "Seated, both legs at 90°, rotate knees side to side keeping chest tall.",
      },
      {
        name: "World's Greatest Stretch",
        category: "mobility" as const,
        muscleGroup: "Hip Flexors",
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "Lunge forward, drop back hand to floor, rotate front elbow to the sky, hold 2s.",
      },
      // Expanded library: at least two exercises for every muscle group,
      // movement type, and category so filters always have real results.
      {
        name: "Goblet Squat",
        category: "strength" as const,
        muscleGroup: "Quads",
        equipment: "Dumbbell",
        movementType: "Squat",
        laterality: "bilateral" as const,
        instructions: "Hold dumbbell at chest, squat between the knees, elbows brush inner thighs at the bottom.",
      },
      {
        name: "Bulgarian Split Squat",
        category: "accessory" as const,
        muscleGroup: "Quads",
        equipment: "Dumbbell",
        movementType: "Lunge",
        laterality: "unilateral" as const,
        instructions: "Rear foot elevated, drop straight down through the front leg, torso tall.",
      },
      {
        name: "Nordic Hamstring Curl",
        category: "accessory" as const,
        muscleGroup: "Hamstrings",
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "bilateral" as const,
        instructions: "Anchor ankles, lower torso as slowly as possible, catch yourself at the bottom.",
      },
      {
        name: "Hip Thrust",
        category: "strength" as const,
        muscleGroup: "Glutes",
        equipment: "Barbell",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        instructions: "Shoulders on bench, drive hips up until torso is flat, squeeze glutes at the top.",
      },
      {
        name: "Broad Jump",
        category: "plyometric" as const,
        muscleGroup: "Glutes",
        equipment: "Bodyweight",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        instructions: "Load hips back, swing arms, jump for maximum distance, stick the landing.",
      },
      {
        name: "Standing Calf Raise",
        category: "accessory" as const,
        muscleGroup: "Calves",
        equipment: "Machine",
        movementType: "Press",
        laterality: "bilateral" as const,
        instructions: "Full stretch at the bottom, rise onto toes, pause at the top.",
      },
      {
        name: "Seated Calf Raise",
        category: "accessory" as const,
        muscleGroup: "Calves",
        equipment: "Machine",
        movementType: "Press",
        laterality: "bilateral" as const,
        instructions: "Knees bent under the pad, drive through the balls of the feet, slow negative.",
      },
      {
        name: "Couch Stretch",
        category: "mobility" as const,
        muscleGroup: "Hip Flexors",
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "unilateral" as const,
        instructions: "Rear foot up on a wall or bench, drive hips forward, keep torso upright.",
      },
      {
        name: "Copenhagen Plank",
        category: "accessory" as const,
        muscleGroup: "Adductors",
        equipment: "Bench",
        movementType: "Isometric",
        laterality: "unilateral" as const,
        instructions: "Top foot on the bench, hold a straight line from shoulder to ankle.",
      },
      {
        name: "Cossack Squat",
        category: "accessory" as const,
        muscleGroup: "Adductors",
        equipment: "Bodyweight",
        movementType: "Lunge",
        laterality: "unilateral" as const,
        instructions: "Wide stance, sit into one hip keeping the other leg straight, chest tall.",
      },
      {
        name: "Incline Dumbbell Press",
        category: "strength" as const,
        muscleGroup: "Chest",
        equipment: "Dumbbell",
        movementType: "Press",
        laterality: "bilateral" as const,
        instructions: "Bench at 30-45°, press dumbbells up and slightly in, control the descent.",
      },
      {
        name: "Bent-Over Row",
        category: "strength" as const,
        muscleGroup: "Back",
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Hinge to near-parallel, row bar to lower ribs, squeeze shoulder blades.",
      },
      {
        name: "Chest-Supported Row",
        category: "accessory" as const,
        muscleGroup: "Back",
        equipment: "Dumbbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Chest braced on an incline bench, row without using momentum.",
      },
      {
        name: "Lat Pulldown",
        category: "accessory" as const,
        muscleGroup: "Lats",
        equipment: "Cable",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Pull bar to upper chest, drive elbows down and back, control the return.",
      },
      {
        name: "Barbell Shrug",
        category: "accessory" as const,
        muscleGroup: "Traps",
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Straight arms, shrug shoulders straight up, avoid rolling them.",
      },
      {
        name: "Farmer's Carry",
        category: "strength" as const,
        muscleGroup: "Traps",
        equipment: "Dumbbell",
        movementType: "Carry",
        laterality: "bilateral" as const,
        instructions: "Heavy dumbbells at sides, walk tall with a braced core for distance or time.",
      },
      {
        name: "Overhead Press",
        category: "strength" as const,
        muscleGroup: "Shoulders",
        equipment: "Barbell",
        movementType: "Press",
        laterality: "bilateral" as const,
        instructions: "Bar at collarbone, press overhead, keep ribs down and glutes tight.",
      },
      {
        name: "Barbell Curl",
        category: "accessory" as const,
        muscleGroup: "Biceps",
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Elbows pinned to sides, curl without swinging, squeeze at the top.",
      },
      {
        name: "Hammer Curl",
        category: "accessory" as const,
        muscleGroup: "Biceps",
        equipment: "Dumbbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Neutral grip, curl straight up, control the negative.",
      },
      {
        name: "Close-Grip Bench Press",
        category: "strength" as const,
        muscleGroup: "Triceps",
        equipment: "Barbell",
        movementType: "Push",
        laterality: "bilateral" as const,
        instructions: "Hands just inside shoulder width, elbows tucked, press to lockout.",
      },
      {
        name: "Tricep Rope Pushdown",
        category: "accessory" as const,
        muscleGroup: "Triceps",
        equipment: "Cable",
        movementType: "Push",
        laterality: "bilateral" as const,
        instructions: "Elbows pinned to sides, press rope down and apart, control the return.",
      },
      {
        name: "Dead Hang",
        category: "mobility" as const,
        muscleGroup: "Forearms",
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "bilateral" as const,
        instructions: "Full grip hang from a bar, relax shoulders down away from ears, hold for time.",
      },
      {
        name: "Suitcase Carry",
        category: "strength" as const,
        muscleGroup: "Forearms",
        equipment: "Dumbbell",
        movementType: "Carry",
        laterality: "unilateral" as const,
        instructions: "One heavy dumbbell at your side, walk tall without leaning, resist tipping.",
      },
      {
        name: "Plank",
        category: "accessory" as const,
        muscleGroup: "Core",
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "bilateral" as const,
        instructions: "Straight line from head to heels, brace core, don't let hips sag.",
      },
      {
        name: "Pallof Press",
        category: "accessory" as const,
        muscleGroup: "Core",
        equipment: "Band",
        movementType: "Rotation",
        laterality: "unilateral" as const,
        instructions: "Band anchored to your side, press straight out and resist rotating toward it.",
      },
      {
        name: "Hanging Leg Raise",
        category: "accessory" as const,
        muscleGroup: "Abs",
        equipment: "Bodyweight",
        movementType: "Activation",
        laterality: "bilateral" as const,
        instructions: "Hang from a bar, raise legs to parallel or higher without swinging.",
      },
      {
        name: "Cable Crunch",
        category: "accessory" as const,
        muscleGroup: "Abs",
        equipment: "Cable",
        movementType: "Activation",
        laterality: "bilateral" as const,
        instructions: "Kneel below the cable, crunch down rounding the spine, squeeze at the bottom.",
      },
      {
        name: "Russian Twist",
        category: "accessory" as const,
        muscleGroup: "Obliques",
        equipment: "Medicine Ball",
        movementType: "Rotation",
        laterality: "bilateral" as const,
        instructions: "Lean back to a stable torso angle, rotate the weight side to side under control.",
      },
      {
        name: "Side Plank",
        category: "accessory" as const,
        muscleGroup: "Obliques",
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "unilateral" as const,
        instructions: "Stack feet, prop up on one elbow, hold a straight line from head to feet.",
      },
      {
        name: "Back Extension",
        category: "accessory" as const,
        muscleGroup: "Lower Back",
        equipment: "Machine",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        instructions: "Hinge at the hips over the pad, rise to a flat back, avoid hyperextending.",
      },
      {
        name: "Superman Hold",
        category: "mobility" as const,
        muscleGroup: "Lower Back",
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "bilateral" as const,
        instructions: "Lying face down, lift arms and legs off the floor, hold and breathe.",
      },
      {
        name: "Neck Flexion Hold",
        category: "accessory" as const,
        muscleGroup: "Neck",
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "bilateral" as const,
        instructions: "Gentle manual resistance against the forehead, hold a neutral neck position.",
      },
      {
        name: "Neck Lateral Flexion Hold",
        category: "accessory" as const,
        muscleGroup: "Neck",
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "unilateral" as const,
        instructions: "Gentle manual resistance against the side of the head, hold without shrugging.",
      },
      {
        name: "Banded Ankle Eversion",
        category: "mobility" as const,
        muscleGroup: "Ankle",
        equipment: "Band",
        movementType: "Activation",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "Band around the forefoot, rotate the foot outward against resistance, slow return.",
      },
      {
        name: "Snatch",
        category: "olympic" as const,
        muscleGroup: "Full Body",
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Wide grip, pull the bar from the floor to overhead in one continuous motion.",
      },
      {
        name: "Assault Bike Intervals",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        equipment: "Machine",
        movementType: "Activation",
        laterality: "bilateral" as const,
        instructions: "Hard effort for the prescribed time, arms and legs driving together, easy pace between.",
      },
      {
        name: "Rowing Machine Intervals",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        equipment: "Machine",
        movementType: "Activation",
        laterality: "bilateral" as const,
        instructions: "Legs-back-arms sequence on the drive, arms-back-legs on the recovery, steady rhythm.",
      },
    ];
    for (const ex of seedExercises) {
      if (existingExerciseNames.has(ex.name)) continue;
      const row = await storage.createExercise(coach.id, {
        ...ex,
        videoUrl: videoSearchUrl(ex.name),
      });
      exerciseMap[ex.name] = row.id;
    }
  }

  // One-time production fixup: promote scott.morrow@live.com to admin and
  // hand over the exercise library so it becomes the official Forge-branded
  // set (shared with every coach, editable only by the admin) instead of
  // living under the demo coach account. Fully idempotent -- both steps
  // no-op on every subsequent deploy once already applied.
  const scott = await storage.getUserByEmail("scott.morrow@live.com");
  if (scott) {
    if (scott.role !== "admin") {
      await storage.setUserRole(scott.id, "admin");
    }
    await storage.transferExerciseOwnership(coach.id, scott.id);
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

    // Log a completed Back Squat session from a week ago so the athlete's
    // workout view has a "LAST: ..." reference to display on day one.
    const backSquatExercise = lowerBodyDay?.exercises.find(
      (pe) => pe.exercise?.name === "Back Squat",
    );
    if (assignment && lowerBodyDay && backSquatExercise) {
      const priorDate = new Date();
      priorDate.setDate(priorDate.getDate() - 7);
      await storage.submitWorkoutLog(athlete.id, {
        assignmentId: assignment.id,
        programDayId: lowerBodyDay.id,
        date: priorDate.toISOString().slice(0, 10),
        completed: true,
        entries: [
          {
            programExerciseId: backSquatExercise.id,
            weightMode: "numeric",
            sets: [
              { setNumber: 1, reps: "5", weight: "405" },
              { setNumber: 2, reps: "5", weight: "405" },
              { setNumber: 3, reps: "5", weight: "405" },
              { setNumber: 4, reps: "3", weight: "415" },
              { setNumber: 5, reps: "3", weight: "415" },
            ],
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
