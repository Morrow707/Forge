import "dotenv/config";
import { db } from "../db";
import { storage } from "../storage";
import { users, exercises, skillExercises, coachAthletes } from "@shared/schema";
import { eq, and, ilike } from "drizzle-orm";
import type { ProgramStructureInput, SkillProgramStructureInput } from "@shared/schema";

// One-off: build the movement-testing-day programs Scott asked for on
// 2026-08-18 -- one exercise per lower-body movement pattern, 2 sets x 5
// reps each, built to exercise every relevant camera tracker in one
// session (bar path, jump, sprint) so tomorrow's device test confirms
// recording + upload to the coach's profile works end to end. Coach Riley
// builds it, hands it to Jordan.
//
// Split into two programs because the app's schema keeps them genuinely
// separate: sprint/mechanics tracking only exists on Skill Programs
// (skill_program_exercises.trackingLevel), never on a regular strength
// Program -- see the comment on that column in shared/schema.ts. And
// "mechanics" tracking is specifically swing/throw analysis (elbow
// extension, release height), not a two-handed med ball toss, so the med
// ball throw stays in the regular program with no dedicated tracker
// (still gets recorded/reviewed as video via videoCheckEnabled).
//
// Not run automatically -- this sandbox has no DATABASE_URL / network path
// to the production DB, so this is left ready to run once that access
// exists: `npx tsx server/scripts/create-jordan-test-program.ts`. Safe to
// re-run: everything is looked up by name first and only what's actually
// missing gets created.

const COACH_NAME_MATCH = "riley";
const ATHLETE_NAME_MATCH = "jordan";

const STRENGTH_EXERCISES: {
  name: string;
  trackingLevel: "bar_path" | "jump" | "none";
  createIfMissing: {
    category: "strength" | "conditioning" | "plyometric";
    muscleGroup: string;
    secondaryMuscles?: string[];
    equipment: string;
    movementType?: string;
    laterality?: "bilateral" | "unilateral";
    usesWeight?: boolean;
    usesBodyweight?: boolean;
    instructions: string;
  };
}[] = [
  {
    name: "Back Squat",
    trackingLevel: "bar_path",
    createIfMissing: {
      category: "strength",
      muscleGroup: "Quads",
      secondaryMuscles: ["Glutes", "Hamstrings", "Adductors", "Core", "Lower Back"],
      equipment: "Barbell",
      movementType: "Squat",
      laterality: "bilateral",
      usesWeight: true,
      instructions: "Bar on back, hips and knees drive together, chest up.",
    },
  },
  {
    name: "Box Jump",
    trackingLevel: "jump",
    createIfMissing: {
      category: "plyometric",
      muscleGroup: "Quads",
      secondaryMuscles: ["Glutes", "Hamstrings", "Calves"],
      equipment: "Bodyweight",
      movementType: "Squat",
      laterality: "bilateral",
      usesBodyweight: true,
      instructions: "Explosive triple extension, soft landing.",
    },
  },
  {
    name: "Broad Jump",
    trackingLevel: "jump",
    createIfMissing: {
      category: "plyometric",
      muscleGroup: "Glutes",
      secondaryMuscles: ["Quads", "Hamstrings", "Calves"],
      equipment: "Bodyweight",
      movementType: "Hinge",
      laterality: "bilateral",
      usesBodyweight: true,
      instructions: "Load hips back, swing arms, jump for maximum distance, stick the landing.",
    },
  },
  {
    name: "Lateral Bound",
    trackingLevel: "jump",
    createIfMissing: {
      category: "plyometric",
      muscleGroup: "Glutes",
      secondaryMuscles: ["Quads", "Adductors", "Calves"],
      equipment: "Bodyweight",
      movementType: "Lunge",
      laterality: "unilateral",
      usesBodyweight: true,
      instructions: "Push explosively sideways off one leg, stick the landing on the other before bounding back.",
    },
  },
  {
    name: "Medicine Ball Scoop Toss",
    trackingLevel: "none",
    createIfMissing: {
      category: "conditioning",
      muscleGroup: "Hips",
      secondaryMuscles: ["Core", "Shoulders", "Glutes"],
      equipment: "Medicine Ball",
      movementType: "Rotation",
      laterality: "unilateral",
      usesBodyweight: true,
      instructions:
        "Ball loaded at the back hip during your stride, then fire it into a wall or partner by sequencing hips before shoulders.",
    },
  },
];

// Not explicitly requested, but "everything lower body to test" plus the
// stated goal (exercise every relevant camera pipeline before tomorrow's
// device test) leaves sprint tracking as the one pipeline the strength
// program above can't cover. Flagged in the report -- delete this skill
// program if unwanted.
const SPRINT_SKILL_EXERCISE = {
  name: "40-Yard Dash",
  skillType: "Speed",
  equipment: "Bodyweight",
  instructions: "Maximum-effort sprint from a three-point or standing start, timed over 40 yards.",
};

async function main() {
  const coachCandidates = await db.query.users.findMany({
    where: and(eq(users.role, "coach"), ilike(users.name, `%${COACH_NAME_MATCH}%`)),
  });
  if (coachCandidates.length !== 1) {
    console.error(
      `Expected exactly one coach matching "${COACH_NAME_MATCH}", found ${coachCandidates.length}:`,
      coachCandidates.map((u) => `#${u.id} ${u.name} <${u.email}>`),
    );
    process.exit(1);
  }
  const coach = coachCandidates[0];

  const athleteCandidates = await db.query.users.findMany({
    where: and(eq(users.role, "athlete"), ilike(users.name, `%${ATHLETE_NAME_MATCH}%`)),
  });
  if (athleteCandidates.length !== 1) {
    console.error(
      `Expected exactly one athlete matching "${ATHLETE_NAME_MATCH}", found ${athleteCandidates.length}:`,
      athleteCandidates.map((u) => `#${u.id} ${u.name} <${u.email}>`),
    );
    process.exit(1);
  }
  const athlete = athleteCandidates[0];

  const roster = await db.query.coachAthletes.findFirst({
    where: and(eq(coachAthletes.coachId, coach.id), eq(coachAthletes.athleteId, athlete.id)),
  });
  if (!roster) {
    console.error(
      `Coach ${coach.name} (#${coach.id}) and athlete ${athlete.name} (#${athlete.id}) aren't linked in coach_athletes -- refusing to assign across a roster relationship that doesn't exist yet. Have Jordan accept a roster invite from Riley first.`,
    );
    process.exit(1);
  }

  // ---------- Strength program: squat, jumps, med ball ----------

  const exerciseIds: number[] = [];
  for (const spec of STRENGTH_EXERCISES) {
    const existing = await db.query.exercises.findMany({
      where: ilike(exercises.name, spec.name),
    });
    let exerciseId: number;
    if (existing.length > 0) {
      // Prefer whichever copy has the lowest id if more than one coach
      // independently has an exercise by this name -- in practice that's
      // the shared official catalog entry, seeded first.
      const chosen = existing.reduce((a, b) => (a.id < b.id ? a : b));
      exerciseId = chosen.id;
      console.log(`Using existing exercise "${spec.name}" (#${exerciseId}, owned by coach #${chosen.coachId})`);
    } else {
      const created = await storage.createExercise(coach.id, {
        name: spec.name,
        ...spec.createIfMissing,
      });
      exerciseId = created.id;
      console.log(`Created missing exercise "${spec.name}" (#${exerciseId}, owned by coach #${coach.id})`);
    }
    exerciseIds.push(exerciseId);
  }

  const strengthStructure: ProgramStructureInput = {
    name: "Movement Testing Day",
    description:
      "One exercise per lower-body movement pattern, 2 sets x 5 reps, built to exercise the bar-path and jump camera trackers in one session.",
    blocks: [],
    weeks: [
      {
        weekNumber: 1,
        days: [
          {
            dayNumber: 1,
            title: "Movement Testing Day",
            isRestDay: false,
            exercises: STRENGTH_EXERCISES.map((spec, i) => ({
              exerciseId: exerciseIds[i],
              orderIndex: i,
              sets: 2,
              reps: "5",
              trackingLevel: spec.trackingLevel,
              videoCheckEnabled: true,
            })),
          },
        ],
      },
    ],
  };

  const strengthProgram = await storage.createProgramWithStructure(coach.id, strengthStructure);
  console.log(`Created program "${strengthProgram.name}" (#${strengthProgram.id}) for coach #${coach.id}`);

  const today = new Date().toISOString().slice(0, 10);
  const { created: strengthAssignments } = await storage.createAssignment(
    coach.id,
    strengthProgram.id,
    [{ athleteId: athlete.id, correctivesEnabled: true }],
    today,
  );
  console.log(
    `Assigned "${strengthProgram.name}" to ${athlete.name} (#${athlete.id}), assignment id(s):`,
    strengthAssignments.map((a) => a.id),
  );

  // ---------- Skill program: sprint (only place trackingLevel "sprint" is valid) ----------

  const existingSkillExercise = await db.query.skillExercises.findMany({
    where: ilike(skillExercises.name, SPRINT_SKILL_EXERCISE.name),
  });
  let skillExerciseId: number;
  if (existingSkillExercise.length > 0) {
    const chosen = existingSkillExercise.reduce((a, b) => (a.id < b.id ? a : b));
    skillExerciseId = chosen.id;
    console.log(`Using existing skill exercise "${SPRINT_SKILL_EXERCISE.name}" (#${skillExerciseId})`);
  } else {
    const created = await storage.createSkillExercise(coach.id, SPRINT_SKILL_EXERCISE);
    skillExerciseId = created.id;
    console.log(`Created missing skill exercise "${SPRINT_SKILL_EXERCISE.name}" (#${skillExerciseId})`);
  }

  const skillStructure: SkillProgramStructureInput = {
    name: "Movement Testing Day - Sprint",
    description: "Sprint tracker test, 2 sets x 5 reps, paired with the Movement Testing Day strength program.",
    weeks: [
      {
        weekNumber: 1,
        days: [
          {
            dayNumber: 1,
            title: "Sprint Test",
            isRestDay: false,
            exercises: [
              {
                skillExerciseId,
                orderIndex: 0,
                sets: 2,
                reps: "5",
                trackingLevel: "sprint",
              },
            ],
          },
        ],
      },
    ],
  };

  const skillProgram = await storage.createSkillProgramWithStructure(coach.id, skillStructure);
  console.log(`Created skill program "${skillProgram.name}" (#${skillProgram.id}) for coach #${coach.id}`);

  const { created: skillAssignments } = await storage.createSkillAssignment(
    coach.id,
    skillProgram.id,
    [{ athleteId: athlete.id }],
    today,
  );
  console.log(
    `Assigned "${skillProgram.name}" to ${athlete.name} (#${athlete.id}), assignment id(s):`,
    skillAssignments.map((a) => a.id),
  );

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
