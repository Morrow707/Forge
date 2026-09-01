import "dotenv/config";
import { db } from "./db";
import { storage } from "./storage";
import { hashPassword } from "./auth-utils";
import {
  users,
  programs,
  programExercises,
  exercises,
  classes,
  classLessons,
  classStructureSchema,
  skillProgramExercises,
  classLessonQuizQuestions,
  classLessonQuizAnswers,
} from "@shared/schema";
import { eq, isNull, and, asc } from "drizzle-orm";
import { AMERICAN_HITTING_CHAPTERS } from "./seed-data/american-hitting-content";
import { TERMS_OF_SERVICE_DRAFT, PRIVACY_POLICY_DRAFT, BIOMETRIC_WAIVER_DRAFT, PARENTAL_NOTICE_DRAFT, INSTITUTIONAL_AGREEMENT_DRAFT } from "./seed-data/legal-documents-draft";

// We don't have live web access from this environment to verify specific
// YouTube video IDs are real and still online, so hand-picking exact links
// risks seeding dead or wrong embeds. A search link is always valid and
// always relevant; the athlete's video player auto-upgrades to a real
// embedded player the moment a coach edits the exercise with a direct link.
function videoSearchUrl(name: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise tutorial`)}`;
}

// Same reasoning as videoSearchUrl above, phrased for skill/drill content
// instead of a strength exercise so the search results actually match.
function skillVideoSearchUrl(name: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} baseball softball drill`)}`;
}

// The handful of American Hitting drills that are pure pitch-recognition/
// decision-making with no swing to actually capture on camera -- everything
// else in the curriculum involves a real swing, so it gets "mechanics"
// tracking (see mechanicsModeFor in skill-day-view-dialog.tsx) so there's an
// actual "Record Swing" action on the drill, not just a bare read-only name.
// Without this, skill-day-view-dialog.tsx's own comment applies literally:
// "skill days have no logging/completion flow yet... not an editable or
// loggable workout page" -- trackingLevel is the ONLY thing that puts a
// clickable action on a drill at all.
const AMERICAN_HITTING_NO_TRACKING_DRILLS = new Set([
  "Colored-Ball Recognition Drill",
  "Ball/Strike Recognition Drill",
  "Take/Swing Decision Drill",
]);
function americanHittingTrackingLevel(drillName: string): "none" | "mechanics" {
  return AMERICAN_HITTING_NO_TRACKING_DRILLS.has(drillName) ? "none" : "mechanics";
}

// Derives what an exercise's athlete-facing logging fields should be from
// its existing equipment/name text -- box combines with weight/bodyweight
// rather than replacing it (e.g. "Dumbbell Box Step-Up" needs both).
function deriveMaterials(equipment: string, name: string) {
  const eq = equipment.toLowerCase();
  const nm = name.toLowerCase();
  const usesBodyweight = eq.includes("bodyweight");
  const usesBand = eq.includes("band");
  const usesBox = nm.includes("box") || nm.includes("step-up") || nm.includes("step up");
  const usesWeight = !usesBodyweight && !usesBand;
  return { usesWeight, usesBodyweight, usesBand, usesBox };
}

// The published demo logins (coach123, admin123, etc., documented in this
// file's own console.log lines below and in READMEs) are meant for a local
// dev database only. render.yaml runs this whole script -- including
// account creation -- on every production deploy too, and these accounts
// are real, full-privilege logins the instant they're created (one of them
// is role: "admin"). A literal, published password on a real production
// account is a live login anyone who reads this public repo can use.
// Same account, same downstream behavior either way (a lot of this file's
// later logic keys off coach.id/demoAdmin.id existing, e.g. the exercise-
// library handoff to scott.morrow@live.com below) -- only the password
// actually differs. In production the account gets an unguessable random
// password instead of the published one; nobody (including whoever wrote
// this file) can log into it without going through the same password-reset
// flow a real user would.
function demoPassword(publishedPassword: string): string {
  return process.env.NODE_ENV === "production" ? crypto.randomUUID() : publishedPassword;
}

async function main() {
  console.log("Seeding Forge demo data...");

  let coach = await storage.getUserByEmail("coach@forge.app");
  if (!coach) {
    coach = await storage.createUser({
      email: "coach@forge.app",
      passwordHash: await hashPassword(demoPassword("coach123")),
      name: "Coach Riley",
      role: "coach",
    });
  }

  let athlete = await storage.getUserByEmail("athlete@forge.app");
  if (!athlete) {
    athlete = await storage.createUser({
      email: "athlete@forge.app",
      passwordHash: await hashPassword(demoPassword("athlete123")),
      name: "Jordan Athlete",
      role: "athlete",
    });
  }

  await storage.linkAthleteToCoach(coach.id, athlete.id);

  // Backfill sport/position for the demo athlete if missing -- only fires
  // once (guarded on the field itself, not account creation) so a coach who
  // later edits Jordan's real profile never gets overwritten by a future
  // deploy's seed run.
  if (!athlete.sport || !athlete.position) {
    athlete = await storage.updateUserProfile(athlete.id, {
      sport: athlete.sport ?? "Football",
      position: athlete.position ?? "Running Back",
    });
  }

  // Five more roster athletes for Coach Riley so there's a real roster to
  // test filtering/search/multi-athlete views against, not just one demo
  // athlete. Deliberately @example.com (not @forge.app) so these don't read
  // as official shareable demo logins, and each password is a random UUID
  // that's never logged or surfaced anywhere -- these accounts exist purely
  // to populate the roster, not to be signed into.
  const extraAthletes: Array<{
    email: string;
    name: string;
    sport: string;
    position: string;
    gender: "male" | "female";
    age: number;
    heightIn: number;
    bodyWeightLbs: number;
  }> = [
    {
      email: "maya.chen@example.com",
      name: "Maya Chen",
      sport: "Soccer",
      position: "Midfielder",
      gender: "female",
      age: 20,
      heightIn: 65,
      bodyWeightLbs: 138,
    },
    {
      email: "tyler.brooks@example.com",
      name: "Tyler Brooks",
      sport: "Football",
      position: "Linebacker",
      gender: "male",
      age: 21,
      heightIn: 73,
      bodyWeightLbs: 232,
    },
    {
      email: "ava.thompson@example.com",
      name: "Ava Thompson",
      sport: "Track & Field",
      position: "Sprinter",
      gender: "female",
      age: 19,
      heightIn: 67,
      bodyWeightLbs: 132,
    },
    {
      email: "marcus.webb@example.com",
      name: "Marcus Webb",
      sport: "Basketball",
      position: "Forward",
      gender: "male",
      age: 22,
      heightIn: 79,
      bodyWeightLbs: 218,
    },
    {
      email: "sofia.ramirez@example.com",
      name: "Sofia Ramirez",
      sport: "Volleyball",
      position: "Outside Hitter",
      gender: "female",
      age: 20,
      heightIn: 70,
      bodyWeightLbs: 155,
    },
  ];
  for (const a of extraAthletes) {
    let extraAthlete = await storage.getUserByEmail(a.email);
    if (!extraAthlete) {
      extraAthlete = await storage.createUser({
        email: a.email,
        passwordHash: await hashPassword(crypto.randomUUID()),
        name: a.name,
        role: "athlete",
        sport: a.sport,
        position: a.position,
        gender: a.gender,
        age: a.age,
        heightIn: a.heightIn,
        bodyWeightLbs: a.bodyWeightLbs,
      });
    }
    await storage.linkAthleteToCoach(coach.id, extraAthlete.id);
  }

  // A pure admin account, shareable the same way the coach/athlete demo
  // logins are -- Forge library curation, plus the same personal
  // calendar/training/AI-program-chat features every admin account gets
  // (no roster access, though -- that stays coach-only).
  let demoAdmin = await storage.getUserByEmail("admin@forge.app");
  if (!demoAdmin) {
    demoAdmin = await storage.createUser({
      email: "admin@forge.app",
      passwordHash: await hashPassword(demoPassword("admin123")),
      name: "Forge Admin",
      role: "admin",
    });
  }

  // A demo Free Agent: a normal athlete account, deliberately never linked
  // to a coach (no linkAthleteToCoach call below, unlike the athlete demo
  // account above) -- Free Agent status is purely derived from having zero
  // coachAthletes rows, not a stored flag, so simply not linking one is the
  // whole setup. Same sport as the demo athlete/coach's roster for a
  // consistent demo story.
  let freeAgent = await storage.getUserByEmail("freeagent@forge.app");
  if (!freeAgent) {
    freeAgent = await storage.createUser({
      email: "freeagent@forge.app",
      passwordHash: await hashPassword(demoPassword("freeagent123")),
      name: "Morgan Freeagent",
      role: "athlete",
      sport: "Basketball",
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
        secondaryMuscles: ["Glutes", "Hamstrings", "Adductors", "Core", "Lower Back"],
        equipment: "Barbell",
        movementType: "Squat",
        laterality: "bilateral" as const,
        sports: ["Powerlifting"],
        instructions: "Bar on back, hips and knees drive together, chest up.",
      },
      {
        name: "Box Squat",
        category: "strength" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Hamstrings", "Lower Back"],
        equipment: "Barbell",
        movementType: "Squat",
        laterality: "bilateral" as const,
        sports: ["Powerlifting"],
        instructions: "Sit back to a box at or just below parallel, pause with tension held, then drive up without relaxing at the bottom. A Westside Barbell staple for building out-of-the-hole strength -- the exact spot most missed squats fail -- and for teaching a lifter to sit back into the hips instead of just bending the knees.",
      },
      {
        name: "Bench Press",
        category: "strength" as const,
        muscleGroup: "Chest",
        secondaryMuscles: ["Shoulders", "Triceps", "Core"],
        equipment: "Barbell",
        movementType: "Push",
        laterality: "bilateral" as const,
        sports: ["Powerlifting"],
        instructions: "Retract shoulder blades, lower bar to chest, press up.",
      },
      {
        name: "Deadlift",
        category: "strength" as const,
        muscleGroup: "Hamstrings",
        secondaryMuscles: ["Glutes", "Lower Back", "Traps", "Forearms", "Quads", "Core"],
        equipment: "Barbell",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        sports: ["Powerlifting", "Rowing"],
        instructions: "Neutral spine, drive through the floor, hips and shoulders rise together.",
      },
      {
        name: "Pull-Up",
        category: "accessory" as const,
        muscleGroup: "Lats",
        secondaryMuscles: ["Biceps", "Back", "Forearms", "Core"],
        equipment: "Bodyweight",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Full hang to chin over bar, control the descent.",
      },
      {
        name: "Assisted Pull-Up",
        category: "accessory" as const,
        muscleGroup: "Lats",
        secondaryMuscles: ["Biceps", "Back", "Forearms", "Core"],
        equipment: "Machine",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Knees or feet on the assist platform, full hang to chin over bar, control the descent -- same movement as a Pull-Up with less bodyweight to overcome.",
      },
      {
        name: "Kettlebell Swing",
        category: "conditioning" as const,
        muscleGroup: "Glutes",
        secondaryMuscles: ["Hamstrings", "Lower Back", "Core", "Shoulders"],
        equipment: "Kettlebell",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        instructions: "Hip hinge, snap hips to drive the bell to chest height.",
      },
      {
        name: "Box Jump",
        category: "plyometric" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Hamstrings", "Calves"],
        equipment: "Bodyweight",
        movementType: "Squat",
        laterality: "bilateral" as const,
        sports: ["Volleyball", "Basketball", "Track & Field", "Wrestling", "MMA", "Rugby"],
        instructions: "Explosive triple extension, soft landing.",
      },
      {
        name: "Dumbbell Box Step-Up",
        category: "strength" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Hamstrings", "Calves", "Core"],
        equipment: "Dumbbell",
        movementType: "Squat",
        laterality: "unilateral" as const,
        instructions: "Full foot on the box, drive through the heel to stand, control the step down.",
      },
      {
        name: "Clean & Jerk",
        category: "olympic" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Traps", "Shoulders", "Back", "Core"],
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        sports: ["Olympic Weightlifting"],
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
        secondaryMuscles: ["Calves"],
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "unilateral" as const,
        isCorrective: true,
        sports: ["Olympic Weightlifting"],
        instructions: "Knee-to-wall drive, keep heel down, 10 slow reps each side.",
      },
      {
        name: "Band Pull-Apart",
        category: "accessory" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Back", "Traps"],
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
        secondaryMuscles: ["Back"],
        equipment: "Band",
        movementType: "Activation",
        laterality: "unilateral" as const,
        isCorrective: true,
        sports: ["Baseball", "Softball", "Volleyball", "Swimming", "Tennis", "Water Polo", "Badminton"],
        instructions: "Elbow pinned to side at 90°, rotate forearm out slowly, control the return.",
      },
      {
        name: "90/90 Hip Switch",
        category: "mobility" as const,
        muscleGroup: "Hip Flexors",
        secondaryMuscles: ["Glutes", "Adductors"],
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
        secondaryMuscles: ["Hamstrings", "Adductors", "Core", "Shoulders"],
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "unilateral" as const,
        isCorrective: true,
        sports: ["Olympic Weightlifting", "Diving"],
        instructions: "Lunge forward, drop back hand to floor, rotate front elbow to the sky, hold 2s.",
      },
      // Expanded library: at least two exercises for every muscle group,
      // movement type, and category so filters always have real results.
      {
        name: "Goblet Squat",
        category: "strength" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Adductors", "Core"],
        equipment: "Dumbbell",
        movementType: "Squat",
        laterality: "bilateral" as const,
        sports: ["Cycling"],
        instructions: "Hold dumbbell at chest, squat between the knees, elbows brush inner thighs at the bottom.",
      },
      {
        name: "Wall Sit",
        category: "accessory" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Core"],
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "bilateral" as const,
        sports: ["Skiing", "Snowboarding", "Cycling"],
        instructions: "Back flat against a wall, thighs parallel to the floor, hold. Builds the isometric quad endurance skiing's tuck/turn position and cycling's sustained pedal-stroke both demand.",
      },
      {
        name: "Bulgarian Split Squat",
        category: "accessory" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Hamstrings", "Adductors", "Core"],
        equipment: "Dumbbell",
        movementType: "Lunge",
        laterality: "unilateral" as const,
        sports: ["Skiing", "Snowboarding", "Cycling", "Fencing"],
        instructions: "Rear foot elevated, drop straight down through the front leg, torso tall.",
      },
      {
        name: "Nordic Hamstring Curl",
        category: "accessory" as const,
        muscleGroup: "Hamstrings",
        secondaryMuscles: ["Glutes", "Calves", "Lower Back"],
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "bilateral" as const,
        isCorrective: true,
        sports: ["Soccer", "Ice Hockey", "Field Hockey", "Football", "Track & Field", "Basketball"],
        instructions: "Anchor ankles, lower torso as slowly as possible, catch yourself at the bottom.",
      },
      {
        name: "Hip Thrust",
        category: "strength" as const,
        muscleGroup: "Glutes",
        secondaryMuscles: ["Hamstrings", "Quads", "Core"],
        equipment: "Barbell",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        instructions: "Shoulders on bench, drive hips up until torso is flat, squeeze glutes at the top.",
      },
      {
        name: "Broad Jump",
        category: "plyometric" as const,
        muscleGroup: "Glutes",
        secondaryMuscles: ["Quads", "Hamstrings", "Calves"],
        equipment: "Bodyweight",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        sports: ["Track & Field", "Football", "Volleyball", "Basketball", "Wrestling", "MMA", "Rugby"],
        instructions: "Load hips back, swing arms, jump for maximum distance, stick the landing.",
      },
      {
        name: "Standing Calf Raise",
        category: "accessory" as const,
        muscleGroup: "Calves",
        secondaryMuscles: ["Ankle"],
        equipment: "Machine",
        movementType: "Press",
        laterality: "bilateral" as const,
        sports: ["Cycling"],
        instructions: "Full stretch at the bottom, rise onto toes, pause at the top.",
      },
      {
        name: "Seated Calf Raise",
        category: "accessory" as const,
        muscleGroup: "Calves",
        secondaryMuscles: ["Ankle"],
        equipment: "Machine",
        movementType: "Press",
        laterality: "bilateral" as const,
        instructions: "Knees bent under the pad, drive through the balls of the feet, slow negative.",
      },
      {
        name: "Couch Stretch",
        category: "mobility" as const,
        muscleGroup: "Hip Flexors",
        secondaryMuscles: ["Quads"],
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "unilateral" as const,
        isCorrective: true,
        sports: ["Olympic Weightlifting"],
        instructions: "Rear foot up on a wall or bench, drive hips forward, keep torso upright.",
      },
      {
        name: "Copenhagen Plank",
        category: "accessory" as const,
        muscleGroup: "Adductors",
        secondaryMuscles: ["Core", "Obliques"],
        equipment: "Bench",
        movementType: "Isometric",
        laterality: "unilateral" as const,
        isCorrective: true,
        sports: ["Soccer", "Ice Hockey", "Field Hockey", "Basketball"],
        instructions: "Top foot on the bench, hold a straight line from shoulder to ankle.",
      },
      {
        name: "Cossack Squat",
        category: "accessory" as const,
        muscleGroup: "Adductors",
        secondaryMuscles: ["Quads", "Glutes", "Hamstrings"],
        equipment: "Bodyweight",
        movementType: "Lunge",
        laterality: "unilateral" as const,
        sports: ["Soccer", "Ice Hockey", "Basketball", "Wrestling", "MMA", "Martial Arts", "Skiing", "Snowboarding"],
        instructions: "Wide stance, sit into one hip keeping the other leg straight, chest tall.",
      },
      {
        name: "Incline Dumbbell Press",
        category: "strength" as const,
        muscleGroup: "Chest",
        secondaryMuscles: ["Shoulders", "Triceps"],
        equipment: "Dumbbell",
        movementType: "Press",
        laterality: "bilateral" as const,
        instructions: "Bench at 30-45°, press dumbbells up and slightly in, control the descent.",
      },
      {
        name: "Dumbbell Bench Press",
        category: "strength" as const,
        muscleGroup: "Chest",
        secondaryMuscles: ["Shoulders", "Triceps", "Core"],
        equipment: "Dumbbell",
        movementType: "Push",
        laterality: "bilateral" as const,
        instructions: "Lie flat, press dumbbells up and slightly in until they nearly touch overhead, control the descent to a full chest stretch.",
      },
      {
        name: "Bent-Over Row",
        category: "strength" as const,
        muscleGroup: "Back",
        secondaryMuscles: ["Lats", "Biceps", "Traps", "Lower Back"],
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        sports: ["Rowing"],
        instructions: "Hinge to near-parallel, row bar to lower ribs, squeeze shoulder blades.",
      },
      {
        name: "Chest-Supported Row",
        category: "accessory" as const,
        muscleGroup: "Back",
        secondaryMuscles: ["Lats", "Biceps", "Traps"],
        equipment: "Dumbbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Chest braced on an incline bench, row without using momentum.",
      },
      {
        name: "Lat Pulldown",
        category: "accessory" as const,
        muscleGroup: "Lats",
        secondaryMuscles: ["Back", "Biceps", "Forearms"],
        equipment: "Cable",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Pull bar to upper chest, drive elbows down and back, control the return.",
      },
      {
        name: "Barbell Shrug",
        category: "accessory" as const,
        muscleGroup: "Traps",
        secondaryMuscles: ["Forearms"],
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Straight arms, shrug shoulders straight up, avoid rolling them.",
      },
      {
        name: "Farmer's Carry",
        category: "strength" as const,
        muscleGroup: "Traps",
        secondaryMuscles: ["Forearms", "Core", "Glutes", "Quads"],
        equipment: "Dumbbell",
        movementType: "Carry",
        laterality: "bilateral" as const,
        sports: ["Wrestling", "Football", "Track & Field", "MMA", "Martial Arts", "Rugby", "Rowing"],
        instructions: "Heavy dumbbells at sides, walk tall with a braced core for distance or time.",
      },
      {
        name: "Overhead Press",
        category: "strength" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Triceps", "Core", "Traps"],
        equipment: "Barbell",
        movementType: "Press",
        laterality: "bilateral" as const,
        instructions: "Bar at collarbone, press overhead, keep ribs down and glutes tight.",
      },
      {
        name: "Barbell Curl",
        category: "accessory" as const,
        muscleGroup: "Biceps",
        secondaryMuscles: ["Forearms"],
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Elbows pinned to sides, curl without swinging, squeeze at the top.",
      },
      {
        name: "Dumbbell Curl",
        category: "accessory" as const,
        muscleGroup: "Biceps",
        secondaryMuscles: ["Forearms"],
        equipment: "Dumbbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Palms forward, curl without swinging the elbows forward, squeeze at the top and control the negative.",
      },
      {
        name: "Hammer Curl",
        category: "accessory" as const,
        muscleGroup: "Biceps",
        secondaryMuscles: ["Forearms"],
        equipment: "Dumbbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Neutral grip, curl straight up, control the negative.",
      },
      {
        name: "Close-Grip Bench Press",
        category: "strength" as const,
        muscleGroup: "Triceps",
        secondaryMuscles: ["Chest", "Shoulders"],
        equipment: "Barbell",
        movementType: "Push",
        laterality: "bilateral" as const,
        sports: ["Powerlifting"],
        instructions: "Hands just inside shoulder width, elbows tucked, press to lockout.",
      },
      {
        name: "Paused Bench Press",
        category: "strength" as const,
        muscleGroup: "Chest",
        secondaryMuscles: ["Shoulders", "Triceps", "Core"],
        equipment: "Barbell",
        movementType: "Push",
        laterality: "bilateral" as const,
        sports: ["Powerlifting"],
        instructions: "Lower to the chest and hold a dead stop for 1-2 seconds -- no bounce -- before pressing up. Trains the exact no-touch-and-go standard used in competition, and builds the off-the-chest strength that's the most common bench sticking point.",
      },
      {
        name: "Tricep Rope Pushdown",
        category: "accessory" as const,
        muscleGroup: "Triceps",
        secondaryMuscles: ["Shoulders"],
        equipment: "Cable",
        movementType: "Push",
        laterality: "bilateral" as const,
        instructions: "Elbows pinned to sides, press rope down and apart, control the return.",
      },
      {
        name: "Dead Hang",
        category: "mobility" as const,
        muscleGroup: "Forearms",
        secondaryMuscles: ["Lats", "Shoulders"],
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "bilateral" as const,
        instructions: "Full grip hang from a bar, relax shoulders down away from ears, hold for time.",
      },
      {
        name: "Suitcase Carry",
        category: "strength" as const,
        muscleGroup: "Forearms",
        secondaryMuscles: ["Core", "Obliques", "Traps"],
        equipment: "Dumbbell",
        movementType: "Carry",
        laterality: "unilateral" as const,
        sports: ["Wrestling", "MMA", "Martial Arts"],
        instructions: "One heavy dumbbell at your side, walk tall without leaning, resist tipping.",
      },
      {
        name: "Plank",
        category: "accessory" as const,
        muscleGroup: "Core",
        secondaryMuscles: ["Abs", "Shoulders", "Glutes"],
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "bilateral" as const,
        instructions: "Straight line from head to heels, brace core, don't let hips sag.",
      },
      {
        name: "Pallof Press",
        category: "accessory" as const,
        muscleGroup: "Core",
        secondaryMuscles: ["Obliques", "Shoulders"],
        equipment: "Band",
        movementType: "Rotation",
        laterality: "unilateral" as const,
        sports: ["Baseball", "Softball", "Golf", "Tennis", "Ice Hockey", "Boxing", "MMA", "Diving"],
        instructions: "Band anchored to your side, press straight out and resist rotating toward it.",
      },
      {
        name: "Hanging Leg Raise",
        category: "accessory" as const,
        muscleGroup: "Abs",
        secondaryMuscles: ["Hip Flexors", "Forearms"],
        equipment: "Bodyweight",
        movementType: "Activation",
        laterality: "bilateral" as const,
        instructions: "Hang from a bar, raise legs to parallel or higher without swinging.",
      },
      {
        name: "Cable Crunch",
        category: "accessory" as const,
        muscleGroup: "Abs",
        secondaryMuscles: ["Core"],
        equipment: "Cable",
        movementType: "Activation",
        laterality: "bilateral" as const,
        instructions: "Kneel below the cable, crunch down rounding the spine, squeeze at the bottom.",
      },
      {
        name: "Russian Twist",
        category: "accessory" as const,
        muscleGroup: "Obliques",
        secondaryMuscles: ["Core", "Hip Flexors"],
        equipment: "Medicine Ball",
        movementType: "Rotation",
        laterality: "bilateral" as const,
        instructions: "Lean back to a stable torso angle, rotate the weight side to side under control.",
      },
      {
        name: "Side Plank",
        category: "accessory" as const,
        muscleGroup: "Obliques",
        secondaryMuscles: ["Core", "Glutes", "Shoulders"],
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "Stack feet, prop up on one elbow, hold a straight line from head to feet.",
      },
      {
        name: "Back Extension",
        category: "accessory" as const,
        muscleGroup: "Lower Back",
        secondaryMuscles: ["Glutes", "Hamstrings"],
        equipment: "Machine",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        instructions: "Hinge at the hips over the pad, rise to a flat back, avoid hyperextending.",
      },
      {
        name: "Superman Hold",
        category: "mobility" as const,
        muscleGroup: "Lower Back",
        secondaryMuscles: ["Glutes", "Shoulders"],
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
        sports: ["Wrestling", "MMA", "Martial Arts", "Football", "Rugby"],
        instructions: "Gentle manual resistance against the forehead, hold a neutral neck position.",
      },
      {
        name: "Neck Lateral Flexion Hold",
        category: "accessory" as const,
        muscleGroup: "Neck",
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "unilateral" as const,
        sports: ["Wrestling", "MMA", "Martial Arts", "Football", "Rugby"],
        instructions: "Gentle manual resistance against the side of the head, hold without shrugging.",
      },
      {
        name: "Banded Ankle Eversion",
        category: "mobility" as const,
        muscleGroup: "Ankle",
        secondaryMuscles: ["Calves"],
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
        secondaryMuscles: ["Quads", "Glutes", "Traps", "Shoulders", "Back", "Core"],
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        sports: ["Olympic Weightlifting"],
        instructions: "Wide grip, pull the bar from the floor to overhead in one continuous motion.",
      },
      {
        name: "Hang Snatch",
        category: "olympic" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Traps", "Shoulders", "Back", "Core"],
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        sports: ["Olympic Weightlifting"],
        instructions: "Start with the bar at the hang position above the knee, drive the hips forward and pull the bar overhead. Removes the pull off the floor to isolate and groove the second-pull power phase -- a staple technical variation, not a lesser version of the lift.",
      },
      {
        name: "Snatch Pull",
        category: "olympic" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Traps", "Back", "Core"],
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        sports: ["Olympic Weightlifting"],
        instructions: "Snatch grip, pull the bar from the floor to full triple extension and a high shrug without dropping under it. Trains the pulling strength and speed behind the snatch at loads that can exceed the full lift, without the catch.",
      },
      {
        name: "Hang Clean",
        category: "olympic" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Traps", "Back", "Core"],
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        sports: ["Olympic Weightlifting"],
        instructions: "Start with the bar at the hang position above the knee, drive the hips forward and receive the bar in a front rack. The clean's equivalent of the hang snatch -- isolates the second pull for lifters still grooving the full lift from the floor.",
      },
      {
        name: "Clean Pull",
        category: "olympic" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Traps", "Back", "Core"],
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        sports: ["Olympic Weightlifting"],
        instructions: "Clean grip, pull the bar from the floor to full triple extension and a high shrug without dropping under it or receiving it in the rack.",
      },
      {
        name: "Overhead Squat",
        category: "olympic" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Shoulders", "Core", "Adductors"],
        equipment: "Barbell",
        movementType: "Squat",
        laterality: "bilateral" as const,
        sports: ["Olympic Weightlifting"],
        instructions: "Bar locked out overhead in a wide snatch grip, squat to full depth while keeping the bar stacked over the mid-foot. Trains the exact receiving position the snatch demands -- ankle, hip, thoracic, and shoulder mobility all limit this before strength does, so don't load past what clean positions allow.",
      },
      {
        name: "Split Jerk",
        category: "olympic" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Triceps", "Quads", "Glutes", "Core"],
        equipment: "Barbell",
        movementType: "Press",
        laterality: "bilateral" as const,
        sports: ["Olympic Weightlifting"],
        instructions: "From the front rack, dip and drive the bar overhead while splitting one foot forward and one back to receive it locked out, then recover the feet together. The jerk half of the clean & jerk, trained on its own so the drive and footwork can be grooved at heavier loads than the full lift allows.",
      },
      {
        name: "Assault Bike Intervals",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Shoulders", "Core"],
        equipment: "Machine",
        movementType: "Activation",
        laterality: "bilateral" as const,
        instructions: "Hard effort for the prescribed time, arms and legs driving together, easy pace between.",
      },
      {
        name: "Rowing Machine Intervals",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Back", "Quads", "Biceps", "Core"],
        equipment: "Machine",
        movementType: "Activation",
        laterality: "bilateral" as const,
        instructions: "Legs-back-arms sequence on the drive, arms-back-legs on the recovery, steady rhythm.",
      },
      // Upper body push/pull volume, a full bar/trap-bar leg day, and
      // dumbbell-heavy combo work -- covers a push/pull test day, a
      // dedicated leg day, and a mixed upper day without leaning on any one
      // piece of equipment.
      {
        name: "Push Press",
        category: "strength" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Triceps", "Quads", "Core"],
        equipment: "Barbell",
        movementType: "Press",
        laterality: "bilateral" as const,
        sports: ["Olympic Weightlifting"],
        instructions: "Dip through the knees, drive the bar overhead with leg drive, lock out overhead.",
      },
      {
        name: "Dumbbell Shoulder Press",
        category: "strength" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Triceps", "Core"],
        equipment: "Dumbbell",
        movementType: "Press",
        laterality: "bilateral" as const,
        instructions: "Press dumbbells straight overhead from shoulder height, avoid flaring the ribs.",
      },
      {
        name: "Barbell Shoulder Press",
        category: "strength" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Triceps", "Core"],
        equipment: "Barbell",
        movementType: "Press",
        laterality: "bilateral" as const,
        instructions: "Seated, bar at collarbone, press straight overhead without arching the back -- removing leg drive isolates the shoulders more than a standing Overhead Press.",
      },
      {
        name: "Dip",
        category: "strength" as const,
        muscleGroup: "Triceps",
        secondaryMuscles: ["Chest", "Shoulders"],
        equipment: "Bodyweight",
        movementType: "Push",
        laterality: "bilateral" as const,
        instructions: "Lower until shoulders dip below elbows, press back up without flaring the elbows.",
      },
      {
        name: "Push-Up",
        category: "accessory" as const,
        muscleGroup: "Chest",
        secondaryMuscles: ["Shoulders", "Triceps", "Core"],
        equipment: "Bodyweight",
        movementType: "Push",
        laterality: "bilateral" as const,
        instructions: "Straight line from head to heels, lower chest to the floor, press back up.",
      },
      {
        name: "Landmine Press",
        category: "strength" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Triceps", "Core", "Obliques"],
        equipment: "Barbell",
        movementType: "Press",
        laterality: "unilateral" as const,
        instructions: "One end of the bar anchored in a landmine sleeve, press the free end up and slightly across the body.",
      },
      {
        name: "Arnold Press",
        category: "strength" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Triceps", "Core"],
        equipment: "Dumbbell",
        movementType: "Press",
        laterality: "bilateral" as const,
        instructions: "Start palms facing you, rotate to palms-forward as you press overhead.",
      },
      {
        name: "Incline Barbell Bench Press",
        category: "strength" as const,
        muscleGroup: "Chest",
        secondaryMuscles: ["Shoulders", "Triceps"],
        equipment: "Barbell",
        movementType: "Push",
        laterality: "bilateral" as const,
        instructions: "Bench at 30-45°, lower the bar to your upper chest, press up and slightly back.",
      },
      {
        name: "Chin-Up",
        category: "accessory" as const,
        muscleGroup: "Lats",
        secondaryMuscles: ["Biceps", "Back", "Forearms"],
        equipment: "Bodyweight",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Underhand grip, pull your chin over the bar, control the descent.",
      },
      {
        name: "Single-Arm Dumbbell Row",
        category: "strength" as const,
        muscleGroup: "Back",
        secondaryMuscles: ["Lats", "Biceps", "Core"],
        equipment: "Dumbbell",
        movementType: "Pull",
        laterality: "unilateral" as const,
        instructions: "Brace on a bench, row the dumbbell to your hip, keep the torso still.",
      },
      {
        name: "Seated Cable Row",
        category: "accessory" as const,
        muscleGroup: "Back",
        secondaryMuscles: ["Lats", "Biceps", "Traps"],
        equipment: "Cable",
        movementType: "Pull",
        laterality: "bilateral" as const,
        sports: ["Rowing"],
        instructions: "Sit tall, row the handle to your torso, squeeze shoulder blades without leaning back.",
      },
      {
        name: "Machine Row",
        category: "strength" as const,
        muscleGroup: "Back",
        secondaryMuscles: ["Lats", "Biceps", "Traps"],
        equipment: "Machine",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Chest against the pad, row the handles to the torso, squeeze the shoulder blades together, control the return.",
      },
      {
        name: "Face Pull",
        category: "accessory" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Back", "Traps"],
        equipment: "Cable",
        movementType: "Pull",
        laterality: "bilateral" as const,
        isCorrective: true,
        sports: ["Baseball", "Softball", "Volleyball", "Swimming", "Tennis", "Football", "Water Polo", "Badminton"],
        instructions: "Rope at face height, pull apart toward your ears, elbows high.",
      },
      {
        name: "Pendlay Row",
        category: "strength" as const,
        muscleGroup: "Back",
        secondaryMuscles: ["Lats", "Biceps", "Traps"],
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        sports: ["Rowing"],
        instructions: "Bar starts dead on the floor each rep, torso near-parallel, row explosively to the lower ribs.",
      },
      {
        name: "EZ-Bar Curl",
        category: "accessory" as const,
        muscleGroup: "Biceps",
        secondaryMuscles: ["Forearms"],
        equipment: "EZ-Bar",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Angled grip on the EZ-bar, curl without swinging, squeeze at the top.",
      },
      {
        name: "Front Squat",
        category: "strength" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Core", "Adductors"],
        equipment: "Barbell",
        movementType: "Squat",
        laterality: "bilateral" as const,
        sports: ["Olympic Weightlifting"],
        instructions: "Bar in the front rack, elbows high, sit between the knees keeping the torso upright.",
      },
      {
        name: "Romanian Deadlift",
        category: "strength" as const,
        muscleGroup: "Hamstrings",
        secondaryMuscles: ["Glutes", "Lower Back", "Forearms"],
        equipment: "Barbell",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        sports: ["Rowing"],
        instructions: "Soft knees, push hips back and lower the bar along your legs, drive hips forward to stand.",
      },
      {
        name: "Dumbbell Romanian Deadlift",
        category: "strength" as const,
        muscleGroup: "Hamstrings",
        secondaryMuscles: ["Glutes", "Lower Back", "Forearms"],
        equipment: "Dumbbell",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        instructions: "Dumbbells in front of the thighs, hinge back until a deep hamstring stretch, keep the weights close to the legs, drive the hips forward to stand.",
      },
      {
        name: "Barbell Good Morning",
        category: "strength" as const,
        muscleGroup: "Hamstrings",
        secondaryMuscles: ["Glutes", "Lower Back"],
        equipment: "Barbell",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        instructions: "Bar on your back, hinge at the hips with a flat back, return by driving the hips forward.",
      },
      {
        name: "Hex Bar Deadlift",
        category: "strength" as const,
        muscleGroup: "Hamstrings",
        secondaryMuscles: ["Glutes", "Quads", "Traps", "Forearms"],
        equipment: "Trap Bar",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        instructions: "Step inside the bar, hips and shoulders rise together, stand tall through the handles.",
      },
      {
        name: "Hex Bar Jump",
        category: "plyometric" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Hamstrings", "Calves"],
        equipment: "Trap Bar",
        movementType: "Squat",
        laterality: "bilateral" as const,
        instructions: "Hold the trap bar handles, dip and explode into a vertical jump, land soft and reset.",
      },
      // Second major expansion: rounds every muscle group and movement
      // pattern out with the exercises coaches actually reach for most --
      // popular, well-established lifts and drills, not novelty picks --
      // plus a much deeper corrective/mobility bank (shoulder, hip, ankle,
      // thoracic spine, and core stability) since six correctives covered
      // barely a fraction of what real rehab/prehab work looks like.
      {
        name: "Band Internal Rotation",
        category: "mobility" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Back"],
        equipment: "Band",
        movementType: "Activation",
        laterality: "unilateral" as const,
        isCorrective: true,
        sports: ["Baseball", "Softball", "Volleyball", "Swimming", "Tennis", "Water Polo", "Badminton"],
        instructions: "Elbow pinned to side at 90°, rotate forearm in across the body slowly, control the return.",
      },
      {
        name: "Prone Y-Raise",
        category: "accessory" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Back", "Traps"],
        equipment: "Dumbbell",
        movementType: "Activation",
        laterality: "bilateral" as const,
        isCorrective: true,
        sports: ["Baseball", "Softball", "Volleyball", "Swimming", "Tennis", "Water Polo", "Badminton"],
        instructions: "Face down on an incline bench, raise light weights overhead in a Y shape, squeeze shoulder blades down and back.",
      },
      {
        name: "Prone T-Raise",
        category: "accessory" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Back", "Traps"],
        equipment: "Dumbbell",
        movementType: "Activation",
        laterality: "bilateral" as const,
        isCorrective: true,
        sports: ["Baseball", "Softball", "Volleyball", "Swimming", "Tennis", "Water Polo", "Badminton"],
        instructions: "Face down on an incline bench, raise light weights out to the sides in a T shape, pause at the top.",
      },
      {
        name: "Scapular Wall Slide",
        category: "mobility" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Back"],
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "bilateral" as const,
        isCorrective: true,
        sports: ["Baseball", "Softball", "Volleyball", "Swimming", "Tennis", "Olympic Weightlifting", "Water Polo", "Badminton"],
        instructions: "Back and arms flat against a wall in a goalpost position, slide arms overhead keeping contact, slide back down.",
      },
      {
        name: "Serratus Wall Slide",
        category: "mobility" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Core"],
        equipment: "Bodyweight",
        movementType: "Activation",
        laterality: "bilateral" as const,
        isCorrective: true,
        sports: ["Baseball", "Softball", "Volleyball", "Swimming", "Tennis", "Water Polo", "Badminton"],
        instructions: "Forearms on the wall, push through the forearms to round the upper back, protracting the shoulder blades.",
      },
      {
        name: "Sleeper Stretch",
        category: "mobility" as const,
        muscleGroup: "Shoulders",
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "unilateral" as const,
        isCorrective: true,
        sports: ["Baseball", "Softball", "Volleyball", "Swimming", "Tennis", "Water Polo", "Badminton"],
        instructions: "Lying on your side, pin the upper arm at 90°, gently press the forearm toward the floor to stretch the back of the shoulder.",
      },
      {
        name: "Clamshell",
        category: "mobility" as const,
        muscleGroup: "Glutes",
        secondaryMuscles: ["Hip Flexors"],
        equipment: "Band",
        movementType: "Activation",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "Lying on your side, knees bent and stacked, open the top knee like a clamshell keeping feet together.",
      },
      {
        name: "Fire Hydrant",
        category: "mobility" as const,
        muscleGroup: "Glutes",
        secondaryMuscles: ["Hip Flexors", "Core"],
        equipment: "Bodyweight",
        movementType: "Activation",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "On all fours, lift one knee out to the side keeping the hip stacked, avoid rotating the torso.",
      },
      {
        name: "Lateral Band Walk",
        category: "accessory" as const,
        muscleGroup: "Glutes",
        secondaryMuscles: ["Hip Flexors", "Adductors"],
        equipment: "Band",
        movementType: "Activation",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "Band above the knees, half-squat stance, step sideways keeping tension on the band the whole time.",
      },
      {
        name: "Standing Hip Circle",
        category: "mobility" as const,
        muscleGroup: "Hip Flexors",
        secondaryMuscles: ["Glutes", "Adductors"],
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "Hold support, lift one knee and circle it out and around, keep the standing leg stable.",
      },
      {
        name: "Frog Stretch",
        category: "mobility" as const,
        muscleGroup: "Adductors",
        secondaryMuscles: ["Hip Flexors"],
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "bilateral" as const,
        isCorrective: true,
        instructions: "On all fours, spread knees wide, rock hips back slowly keeping ankles in line with knees.",
      },
      {
        name: "Glute Bridge",
        category: "accessory" as const,
        muscleGroup: "Glutes",
        secondaryMuscles: ["Hamstrings", "Core"],
        equipment: "Bodyweight",
        movementType: "Activation",
        laterality: "bilateral" as const,
        isCorrective: true,
        instructions: "Feet flat, drive hips up until knees-hips-shoulders align, squeeze glutes at the top, avoid arching the low back.",
      },
      {
        name: "Bird Dog",
        category: "accessory" as const,
        muscleGroup: "Core",
        secondaryMuscles: ["Glutes", "Lower Back", "Shoulders"],
        equipment: "Bodyweight",
        movementType: "Activation",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "On all fours, extend opposite arm and leg without rotating the hips, hold briefly, switch sides.",
      },
      {
        name: "Banded Ankle Inversion",
        category: "mobility" as const,
        muscleGroup: "Ankle",
        secondaryMuscles: ["Calves"],
        equipment: "Band",
        movementType: "Activation",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "Band around the forefoot, rotate the foot inward against resistance, slow controlled return.",
      },
      {
        name: "Calf Stretch (Wall)",
        category: "mobility" as const,
        muscleGroup: "Calves",
        secondaryMuscles: ["Ankle"],
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "Hands on a wall, back leg straight with heel down, lean forward until you feel a stretch, hold.",
      },
      {
        name: "Tibialis Raise",
        category: "accessory" as const,
        muscleGroup: "Ankle",
        secondaryMuscles: ["Calves"],
        equipment: "Bodyweight",
        movementType: "Activation",
        laterality: "bilateral" as const,
        isCorrective: true,
        instructions: "Heels on a small platform, lift toes as high as possible keeping heels down, slow lower.",
      },
      {
        name: "Single-Leg Balance Reach",
        category: "mobility" as const,
        muscleGroup: "Ankle",
        secondaryMuscles: ["Glutes", "Core"],
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "unilateral" as const,
        isCorrective: true,
        sports: ["Volleyball", "Basketball", "Soccer", "Ice Hockey", "Gymnastics", "Diving", "Skiing", "Snowboarding"],
        instructions: "Balance on one leg, reach the free foot out to tap the floor in front, to the side, and behind, resetting balance each time.",
      },
      {
        name: "Single-Leg Landing Hold",
        category: "plyometric" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Hamstrings", "Ankle"],
        equipment: "Bodyweight",
        movementType: "Squat",
        laterality: "unilateral" as const,
        isCorrective: true,
        sports: ["Volleyball", "Basketball", "Soccer", "Ice Hockey", "Snowboarding", "Skiing"],
        instructions: "Step off a low box and land on one leg, holding the landing for 2-3s -- knee tracking over the toes, no inward collapse. Neuromuscular landing-mechanics work for jump-sport knee/ACL health, not a power exercise -- keep the box low and the focus on control.",
      },
      {
        name: "Open Book Stretch",
        category: "mobility" as const,
        muscleGroup: "Core",
        secondaryMuscles: ["Back"],
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "Lying on your side with knees bent, rotate the top arm open across the body, follow it with your eyes, keep knees together.",
      },
      {
        name: "Cat-Cow",
        category: "mobility" as const,
        muscleGroup: "Lower Back",
        secondaryMuscles: ["Core"],
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "bilateral" as const,
        isCorrective: true,
        instructions: "On all fours, alternate arching and rounding the spine slowly with your breath.",
      },
      {
        name: "Foam Roll Thoracic Spine",
        category: "mobility" as const,
        muscleGroup: "Back",
        equipment: "Foam Roller",
        movementType: "Mobility",
        laterality: "bilateral" as const,
        isCorrective: true,
        instructions: "Roller under the upper back, support your head, extend gently over the roller at each segment.",
      },
      {
        name: "Quadruped Thoracic Rotation",
        category: "mobility" as const,
        muscleGroup: "Core",
        secondaryMuscles: ["Back", "Shoulders"],
        equipment: "Bodyweight",
        movementType: "Rotation",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "On all fours, hand behind your head, rotate the elbow up toward the ceiling then thread it under the body.",
      },
      {
        name: "McGill Curl-Up",
        category: "accessory" as const,
        muscleGroup: "Abs",
        secondaryMuscles: ["Core"],
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "bilateral" as const,
        isCorrective: true,
        instructions: "One knee bent, hands under the low back, lift head and shoulders slightly keeping the spine rigid, hold.",
      },
      {
        name: "Suitcase Hold",
        category: "accessory" as const,
        muscleGroup: "Core",
        secondaryMuscles: ["Obliques", "Forearms"],
        equipment: "Dumbbell",
        movementType: "Isometric",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "Heavy dumbbell in one hand, stand tall and resist leaning to that side, hold for time.",
      },
      {
        name: "Chin Tuck",
        category: "mobility" as const,
        muscleGroup: "Neck",
        equipment: "Bodyweight",
        movementType: "Activation",
        laterality: "bilateral" as const,
        isCorrective: true,
        instructions: "Gently draw the chin straight back to create a double chin, avoid tilting up or down, hold briefly.",
      },
      {
        name: "Wrist Flexor Stretch",
        category: "mobility" as const,
        muscleGroup: "Forearms",
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "Arm extended, palm up, gently pull fingers back with the other hand until you feel a stretch.",
      },
      {
        name: "Wrist Extensor Stretch",
        category: "mobility" as const,
        muscleGroup: "Forearms",
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "unilateral" as const,
        isCorrective: true,
        instructions: "Arm extended, palm down, gently pull the hand down and back until you feel a stretch on top of the forearm.",
      },
      {
        name: "Leg Press",
        category: "strength" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Hamstrings"],
        equipment: "Machine",
        movementType: "Squat",
        laterality: "bilateral" as const,
        instructions: "Feet shoulder-width on the platform, lower until knees reach 90°, press through the whole foot.",
      },
      {
        name: "Leg Extension",
        category: "accessory" as const,
        muscleGroup: "Quads",
        equipment: "Machine",
        movementType: "Press",
        laterality: "bilateral" as const,
        instructions: "Pad against the shins, extend knees fully without swinging, pause at the top.",
      },
      {
        name: "Lying Leg Curl",
        category: "accessory" as const,
        muscleGroup: "Hamstrings",
        secondaryMuscles: ["Calves"],
        equipment: "Machine",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Pad against the ankles, curl heels toward glutes, control the negative.",
      },
      {
        name: "Sumo Deadlift",
        category: "strength" as const,
        muscleGroup: "Hamstrings",
        secondaryMuscles: ["Glutes", "Adductors", "Quads", "Lower Back", "Traps"],
        equipment: "Barbell",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        sports: ["Powerlifting"],
        instructions: "Wide stance, hands inside the knees, drive through the floor keeping the chest tall.",
      },
      {
        name: "Walking Lunge",
        category: "accessory" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Hamstrings", "Adductors", "Core"],
        equipment: "Dumbbell",
        movementType: "Lunge",
        laterality: "unilateral" as const,
        sports: ["Fencing"],
        instructions: "Step forward into a lunge, drive through the front heel to bring the back foot through to the next step.",
      },
      {
        name: "Reverse Lunge",
        category: "accessory" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Hamstrings"],
        equipment: "Dumbbell",
        movementType: "Lunge",
        laterality: "unilateral" as const,
        sports: ["Fencing"],
        instructions: "Step backward into a lunge, front knee tracks over the foot, drive back to standing.",
      },
      {
        name: "Lateral Lunge",
        category: "accessory" as const,
        muscleGroup: "Adductors",
        secondaryMuscles: ["Quads", "Glutes"],
        equipment: "Bodyweight",
        movementType: "Lunge",
        laterality: "unilateral" as const,
        sports: ["Fencing", "Badminton", "Tennis"],
        instructions: "Step wide to one side, sit into that hip keeping the other leg straight, push back to center.",
      },
      {
        name: "Step-Down",
        category: "accessory" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Ankle"],
        equipment: "Bodyweight",
        movementType: "Squat",
        laterality: "unilateral" as const,
        instructions: "Stand on a box, lower the free leg to lightly tap the floor with control, drive back up through the standing leg.",
      },
      {
        name: "Single-Leg Romanian Deadlift",
        category: "accessory" as const,
        muscleGroup: "Hamstrings",
        secondaryMuscles: ["Glutes", "Lower Back", "Core"],
        equipment: "Dumbbell",
        movementType: "Hinge",
        laterality: "unilateral" as const,
        sports: ["Skiing", "Cycling", "Fencing"],
        instructions: "Hinge over one leg as the other extends back for balance, keep hips square, return to standing.",
      },
      {
        name: "Glute Ham Raise",
        category: "accessory" as const,
        muscleGroup: "Hamstrings",
        secondaryMuscles: ["Glutes", "Calves", "Lower Back"],
        equipment: "Machine",
        movementType: "Isometric",
        laterality: "bilateral" as const,
        instructions: "Anchor the ankles, lower the torso under control from the knees, pull back up using the hamstrings.",
      },
      {
        name: "Reverse Hyper",
        category: "accessory" as const,
        muscleGroup: "Lower Back",
        secondaryMuscles: ["Glutes", "Hamstrings"],
        equipment: "Machine",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        instructions: "Hips on the pad, swing the legs from hanging up to parallel using the glutes and low back, control the descent.",
      },
      {
        name: "Cable Pull-Through",
        category: "strength" as const,
        muscleGroup: "Glutes",
        secondaryMuscles: ["Hamstrings", "Lower Back"],
        equipment: "Cable",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        instructions: "Cable between the legs facing away, hinge at the hips to reach back, drive hips forward to stand.",
      },
      {
        name: "Hip Adduction Machine",
        category: "accessory" as const,
        muscleGroup: "Adductors",
        equipment: "Machine",
        movementType: "Activation",
        laterality: "bilateral" as const,
        instructions: "Seated, pads on the inner thighs, squeeze legs together against resistance, control the return.",
      },
      {
        name: "Hip Abduction Machine",
        category: "accessory" as const,
        muscleGroup: "Glutes",
        secondaryMuscles: ["Adductors"],
        equipment: "Machine",
        movementType: "Activation",
        laterality: "bilateral" as const,
        instructions: "Seated, pads on the outer thighs, push legs apart against resistance, control the return.",
      },
      {
        name: "Decline Bench Press",
        category: "strength" as const,
        muscleGroup: "Chest",
        secondaryMuscles: ["Shoulders", "Triceps"],
        equipment: "Barbell",
        movementType: "Push",
        laterality: "bilateral" as const,
        instructions: "Bench angled down, lower the bar to the lower chest, press up and back.",
      },
      {
        name: "Floor Press",
        category: "strength" as const,
        muscleGroup: "Chest",
        secondaryMuscles: ["Shoulders", "Triceps"],
        equipment: "Barbell",
        movementType: "Push",
        laterality: "bilateral" as const,
        sports: ["Powerlifting"],
        instructions: "Lying on the floor, lower until the upper arms touch down, press up without arching off the floor.",
      },
      {
        name: "Cable Fly",
        category: "accessory" as const,
        muscleGroup: "Chest",
        secondaryMuscles: ["Shoulders"],
        equipment: "Cable",
        movementType: "Push",
        laterality: "bilateral" as const,
        instructions: "Cables at chest height, sweep hands together in front of you in a wide arc, squeeze at the finish.",
      },
      {
        name: "Machine Chest Fly",
        category: "accessory" as const,
        muscleGroup: "Chest",
        secondaryMuscles: ["Shoulders"],
        equipment: "Machine",
        movementType: "Push",
        laterality: "bilateral" as const,
        instructions: "Elbows slightly bent, bring the pads together in front of the chest, control the return.",
      },
      {
        name: "Machine Chest Press",
        category: "strength" as const,
        muscleGroup: "Chest",
        secondaryMuscles: ["Shoulders", "Triceps"],
        equipment: "Machine",
        movementType: "Push",
        laterality: "bilateral" as const,
        instructions: "Set the seat so handles sit at chest height, press straight out without locking the elbows hard, control the return.",
      },
      {
        name: "Machine Shoulder Press",
        category: "strength" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Triceps"],
        equipment: "Machine",
        movementType: "Press",
        laterality: "bilateral" as const,
        instructions: "Press the handles straight overhead without arching the back, control the descent.",
      },
      {
        name: "Lateral Raise",
        category: "accessory" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Traps"],
        equipment: "Dumbbell",
        movementType: "Activation",
        laterality: "bilateral" as const,
        instructions: "Slight bend in the elbows, raise arms out to shoulder height, control the descent.",
      },
      {
        name: "Rear Delt Fly",
        category: "accessory" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Back", "Traps"],
        equipment: "Dumbbell",
        movementType: "Activation",
        laterality: "bilateral" as const,
        instructions: "Hinge forward, raise arms out to the sides squeezing the shoulder blades, control the return.",
      },
      {
        name: "Diamond Push-Up",
        category: "accessory" as const,
        muscleGroup: "Triceps",
        secondaryMuscles: ["Chest", "Shoulders"],
        equipment: "Bodyweight",
        movementType: "Push",
        laterality: "bilateral" as const,
        instructions: "Hands together under the chest forming a diamond, lower with elbows close to the body, press back up.",
      },
      {
        name: "Pike Push-Up",
        category: "accessory" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Triceps", "Chest"],
        equipment: "Bodyweight",
        movementType: "Push",
        laterality: "bilateral" as const,
        instructions: "Hips high in an inverted-V, lower the head toward the floor between the hands, press back up.",
      },
      {
        name: "T-Bar Row",
        category: "strength" as const,
        muscleGroup: "Back",
        secondaryMuscles: ["Lats", "Biceps", "Traps"],
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        sports: ["Rowing"],
        instructions: "Chest over the bar, row to the sternum keeping the torso still, control the descent.",
      },
      {
        name: "Inverted Row",
        category: "accessory" as const,
        muscleGroup: "Back",
        secondaryMuscles: ["Lats", "Biceps", "Core"],
        equipment: "Bodyweight",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Body straight under a bar, pull the chest to the bar, control the descent.",
      },
      {
        name: "Straight-Arm Pulldown",
        category: "accessory" as const,
        muscleGroup: "Lats",
        secondaryMuscles: ["Core", "Triceps"],
        equipment: "Cable",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Arms straight, pull the bar down to the thighs using the lats, control the return.",
      },
      {
        name: "Rack Pull",
        category: "strength" as const,
        muscleGroup: "Back",
        secondaryMuscles: ["Hamstrings", "Glutes", "Traps", "Forearms"],
        equipment: "Barbell",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        sports: ["Powerlifting"],
        instructions: "Bar set just below the knee in a rack, hinge and pull to full lockout, control the return.",
      },
      {
        name: "Deficit Deadlift",
        category: "strength" as const,
        muscleGroup: "Hamstrings",
        secondaryMuscles: ["Glutes", "Lower Back", "Traps", "Quads", "Core"],
        equipment: "Barbell",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        sports: ["Powerlifting"],
        instructions: "Stand on a 1-2 inch platform to increase the pull's range of motion, keeping the same setup and bracing as a normal deadlift. Overloads the hardest part of the pull -- getting the bar moving off the floor -- for a lifter whose deadlift breaks down at the start rather than the lockout.",
      },
      {
        name: "Reverse-Grip Lat Pulldown",
        category: "accessory" as const,
        muscleGroup: "Lats",
        secondaryMuscles: ["Biceps", "Back"],
        equipment: "Cable",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Underhand grip, pull the bar to the upper chest, squeeze the lats, control the return.",
      },
      {
        name: "Meadows Row",
        category: "strength" as const,
        muscleGroup: "Back",
        secondaryMuscles: ["Lats", "Biceps", "Traps"],
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "unilateral" as const,
        instructions: "One end of a landmine bar, row it to the hip from a bent-over stance, control the descent.",
      },
      {
        name: "Preacher Curl",
        category: "accessory" as const,
        muscleGroup: "Biceps",
        secondaryMuscles: ["Forearms"],
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Arms braced on the pad, curl without letting the elbows lift, full stretch at the bottom.",
      },
      {
        name: "Concentration Curl",
        category: "accessory" as const,
        muscleGroup: "Biceps",
        secondaryMuscles: ["Forearms"],
        equipment: "Dumbbell",
        movementType: "Pull",
        laterality: "unilateral" as const,
        instructions: "Elbow braced against the inner thigh, curl slowly, squeeze at the top.",
      },
      {
        name: "Cable Curl",
        category: "accessory" as const,
        muscleGroup: "Biceps",
        secondaryMuscles: ["Forearms"],
        equipment: "Cable",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Elbows at your sides, curl the bar up under constant tension, control the descent.",
      },
      {
        name: "Zottman Curl",
        category: "accessory" as const,
        muscleGroup: "Biceps",
        secondaryMuscles: ["Forearms"],
        equipment: "Dumbbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        instructions: "Curl up with palms facing up, rotate palms down at the top, lower slowly for the forearm-focused negative.",
      },
      {
        name: "Skull Crusher",
        category: "accessory" as const,
        muscleGroup: "Triceps",
        equipment: "EZ-Bar",
        movementType: "Push",
        laterality: "bilateral" as const,
        instructions: "Lower the bar toward the forehead by bending only the elbows, press back to lockout.",
      },
      {
        name: "Overhead Tricep Extension",
        category: "accessory" as const,
        muscleGroup: "Triceps",
        equipment: "Dumbbell",
        movementType: "Push",
        laterality: "bilateral" as const,
        instructions: "One dumbbell overhead with both hands, lower behind the head bending only the elbows, press back up.",
      },
      {
        name: "Bench Dip",
        category: "accessory" as const,
        muscleGroup: "Triceps",
        secondaryMuscles: ["Chest", "Shoulders"],
        equipment: "Bodyweight",
        movementType: "Push",
        laterality: "bilateral" as const,
        instructions: "Hands on a bench behind you, lower hips toward the floor bending the elbows, press back up.",
      },
      {
        name: "Ab Wheel Rollout",
        category: "accessory" as const,
        muscleGroup: "Abs",
        secondaryMuscles: ["Core", "Lats", "Lower Back"],
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "bilateral" as const,
        instructions: "From kneeling, roll the wheel out as far as control allows keeping the spine neutral, pull back to start.",
      },
      {
        name: "V-Up",
        category: "accessory" as const,
        muscleGroup: "Abs",
        secondaryMuscles: ["Hip Flexors"],
        equipment: "Bodyweight",
        movementType: "Activation",
        laterality: "bilateral" as const,
        instructions: "Lying flat, simultaneously raise straight legs and torso to touch hands to feet, lower with control.",
      },
      {
        name: "Toes-to-Bar",
        category: "accessory" as const,
        muscleGroup: "Abs",
        secondaryMuscles: ["Hip Flexors", "Forearms", "Lats"],
        equipment: "Bodyweight",
        movementType: "Activation",
        laterality: "bilateral" as const,
        instructions: "Hanging from a bar, raise straight legs to touch the bar without swinging, lower with control.",
      },
      {
        name: "Mountain Climber",
        category: "conditioning" as const,
        muscleGroup: "Core",
        secondaryMuscles: ["Hip Flexors", "Shoulders"],
        equipment: "Bodyweight",
        movementType: "Activation",
        laterality: "bilateral" as const,
        instructions: "In a plank, drive knees toward the chest alternating quickly while keeping the hips level.",
      },
      {
        name: "Cable Woodchop",
        category: "accessory" as const,
        muscleGroup: "Obliques",
        secondaryMuscles: ["Core", "Shoulders"],
        equipment: "Cable",
        movementType: "Rotation",
        laterality: "unilateral" as const,
        instructions: "Cable set high, rotate and pull the handle down and across the body, control the return.",
      },
      {
        name: "Landmine Rotation",
        category: "accessory" as const,
        muscleGroup: "Obliques",
        secondaryMuscles: ["Core", "Shoulders"],
        equipment: "Barbell",
        movementType: "Rotation",
        laterality: "unilateral" as const,
        sports: ["Baseball", "Softball", "Golf", "Tennis", "Ice Hockey", "Boxing", "MMA"],
        instructions: "Hold the end of a landmine bar with both hands, rotate it side to side at hip height, control each swing.",
      },
      {
        name: "Weighted Plank",
        category: "accessory" as const,
        muscleGroup: "Core",
        secondaryMuscles: ["Abs", "Shoulders", "Glutes"],
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "bilateral" as const,
        instructions: "Plate on the upper back, hold a straight line from head to heels without letting the hips sag.",
      },
      {
        name: "Sled Push",
        category: "conditioning" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Calves", "Core"],
        equipment: "Machine",
        movementType: "Push",
        laterality: "bilateral" as const,
        sports: ["Football", "Wrestling", "MMA", "Rugby"],
        instructions: "Low shin angle, drive through the balls of the feet with short powerful steps.",
      },
      {
        name: "Sled Drag",
        category: "conditioning" as const,
        muscleGroup: "Hamstrings",
        secondaryMuscles: ["Glutes", "Calves", "Core"],
        equipment: "Machine",
        movementType: "Carry",
        laterality: "bilateral" as const,
        sports: ["Football", "Wrestling", "MMA", "Rugby", "Rowing"],
        instructions: "Harness or rope attached to the sled, walk backward or forward driving through the legs.",
      },
      {
        name: "Battle Ropes",
        category: "conditioning" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Core", "Forearms"],
        equipment: "Rope",
        movementType: "Activation",
        laterality: "bilateral" as const,
        sports: ["Wrestling", "MMA", "Boxing"],
        instructions: "Alternate slamming the ropes as hard as possible for the prescribed time, stay low in an athletic stance.",
      },
      {
        name: "Jump Rope",
        category: "conditioning" as const,
        muscleGroup: "Calves",
        secondaryMuscles: ["Shoulders", "Core"],
        equipment: "Jump Rope",
        movementType: "Activation",
        laterality: "bilateral" as const,
        instructions: "Small quick jumps on the balls of the feet, wrists doing the turning, stay relaxed.",
      },
      {
        name: "Shuttle Run",
        category: "conditioning" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Hamstrings", "Calves", "Core"],
        equipment: "Bodyweight",
        movementType: "Activation",
        laterality: "bilateral" as const,
        instructions: "Sprint to each line and back at maximum effort, decelerate under control at each turn.",
      },
      {
        name: "Medicine Ball Slam",
        category: "conditioning" as const,
        muscleGroup: "Core",
        secondaryMuscles: ["Shoulders", "Lats"],
        equipment: "Medicine Ball",
        movementType: "Rotation",
        laterality: "bilateral" as const,
        sports: ["Baseball", "Softball", "Football", "Basketball", "Wrestling", "MMA", "Boxing", "Rugby"],
        instructions: "Raise the ball overhead and slam it down as hard as possible, catch the bounce and reset.",
      },
      {
        name: "Medicine Ball Rotational Throw",
        category: "conditioning" as const,
        muscleGroup: "Obliques",
        secondaryMuscles: ["Core", "Shoulders"],
        equipment: "Medicine Ball",
        movementType: "Rotation",
        laterality: "unilateral" as const,
        sports: ["Baseball", "Softball", "Golf", "Tennis", "Lacrosse", "Boxing", "MMA"],
        instructions: "Rotate away from a wall then explosively throw the ball into it, catch and repeat.",
      },
      {
        name: "Medicine Ball Scoop Toss",
        category: "conditioning" as const,
        muscleGroup: "Hips",
        secondaryMuscles: ["Core", "Shoulders", "Glutes"],
        equipment: "Medicine Ball",
        movementType: "Rotation",
        laterality: "unilateral" as const,
        sports: ["Baseball", "Softball"],
        instructions: "Ball loaded at the back hip during your stride, then fire it into a wall or partner by sequencing hips before shoulders. Trains the hip-shoulder separation baseball hitting and throwing both rely on -- let the legs and hips start the throw, not the arms.",
      },
      {
        name: "Wall Ball",
        category: "conditioning" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Shoulders", "Core"],
        equipment: "Medicine Ball",
        movementType: "Squat",
        laterality: "bilateral" as const,
        instructions: "Squat with the ball at the chest, stand and throw it to a target on the wall, catch and repeat.",
      },
      {
        name: "Depth Jump",
        category: "plyometric" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Hamstrings", "Calves"],
        equipment: "Bodyweight",
        movementType: "Squat",
        laterality: "bilateral" as const,
        sports: ["Volleyball", "Basketball", "Track & Field"],
        instructions: "Step off a box, land softly, and immediately explode upward with minimal ground contact time.",
      },
      {
        name: "Approach Jump",
        category: "plyometric" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Hamstrings", "Calves"],
        equipment: "Bodyweight",
        movementType: "Squat",
        laterality: "bilateral" as const,
        sports: ["Volleyball", "Basketball"],
        instructions: "A 3-step approach (step, step, plant both feet) into a max-effort two-foot vertical jump, swinging both arms hard. The volleyball/basketball attack-jump pattern -- score the approach speed and the plant, not just the jump.",
      },
      {
        name: "Tuck Jump",
        category: "plyometric" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Core", "Hip Flexors", "Calves"],
        equipment: "Bodyweight",
        movementType: "Squat",
        laterality: "bilateral" as const,
        sports: ["Volleyball", "Basketball", "Track & Field"],
        instructions: "Jump straight up, drive both knees to the chest, and land soft with knees tracking over the toes before resetting. A landing-mechanics and reactive-power drill for jump-sport athletes -- prioritize a controlled landing over jump height.",
      },
      {
        name: "Lateral Bound",
        category: "plyometric" as const,
        muscleGroup: "Glutes",
        secondaryMuscles: ["Quads", "Adductors", "Calves"],
        equipment: "Bodyweight",
        movementType: "Lunge",
        laterality: "unilateral" as const,
        sports: ["Soccer", "Ice Hockey", "Basketball", "Football", "Tennis"],
        instructions: "Push explosively sideways off one leg, stick the landing on the other before bounding back.",
      },
      {
        name: "Skater Squat",
        category: "accessory" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Hamstrings", "Ankle"],
        equipment: "Bodyweight",
        movementType: "Squat",
        laterality: "unilateral" as const,
        sports: ["Ice Hockey", "Basketball", "Soccer", "Skiing", "Snowboarding"],
        instructions: "Single-leg squat with the back leg trailing behind and across, touching the heel down lightly for balance. Builds the single-leg strength a skating stride depends on -- hold a wall or rail if balance is the limiter, not the leg strength.",
      },
      {
        name: "Pro Agility Shuttle",
        category: "conditioning" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Hamstrings", "Calves", "Core"],
        equipment: "Bodyweight",
        movementType: "Lunge",
        laterality: "bilateral" as const,
        sports: ["Football", "Basketball", "Soccer", "Baseball", "Softball", "Lacrosse", "Badminton", "Rugby"],
        instructions: "The 5-10-5: start in the middle of three lines 5 yards apart, sprint 5 yards to one side and touch the line, change direction and sprint 10 yards to the far line and touch it, then sprint back 5 yards through the start. Score the cut, not just the sprint speed.",
      },
      {
        name: "Lateral Shuffle",
        category: "conditioning" as const,
        muscleGroup: "Glutes",
        secondaryMuscles: ["Quads", "Adductors", "Calves"],
        equipment: "Bodyweight",
        movementType: "Lunge",
        laterality: "bilateral" as const,
        sports: ["Basketball", "Soccer", "Football", "Ice Hockey", "Tennis", "Badminton"],
        instructions: "Low athletic stance, shuffle laterally without crossing your feet or letting your hips rise. Defensive-footwork conditioning -- stay low and reactive rather than covering ground fast and upright.",
      },
      {
        name: "A-Skip",
        category: "mobility" as const,
        muscleGroup: "Hip Flexors",
        secondaryMuscles: ["Glutes", "Calves"],
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "unilateral" as const,
        sports: ["Track & Field", "Football", "Soccer", "Basketball"],
        instructions: "Skip forward driving one knee up to hip height while the opposite arm swings, upright posture, quick ground contact. A sprint-mechanics drill for knee lift and posture, usually part of a speed-day warmup.",
      },
      {
        name: "B-Skip",
        category: "mobility" as const,
        muscleGroup: "Hamstrings",
        secondaryMuscles: ["Hip Flexors", "Glutes", "Calves"],
        equipment: "Bodyweight",
        movementType: "Mobility",
        laterality: "unilateral" as const,
        sports: ["Track & Field"],
        instructions: "Same drive as an A-Skip, but extend the lifted leg out before snapping it down and back underneath the hips, toe up. Teaches the active ground-strike sprinters need instead of reaching/overstriding.",
      },
      {
        name: "Wall Sprint Drill",
        category: "mobility" as const,
        muscleGroup: "Hip Flexors",
        secondaryMuscles: ["Quads", "Calves"],
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "unilateral" as const,
        sports: ["Track & Field", "Football", "Soccer", "Basketball"],
        instructions: "Lean into a wall at a steep forward angle, hands supporting at shoulder height, and cycle the legs through sprint drive mechanics without traveling forward. Teaches front-side mechanics and pushing back into the ground -- the acceleration-phase posture every field-sport sprint starts from.",
      },
      {
        name: "Neck Bridge",
        category: "mobility" as const,
        muscleGroup: "Neck",
        secondaryMuscles: ["Traps", "Lower Back"],
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "bilateral" as const,
        sports: ["Wrestling", "Football", "MMA", "Martial Arts", "Rugby"],
        instructions: "Supporting weight on the head and feet only, arch the back and hold, then rock gently forward and back. Builds the neck strength wrestling and football collisions demand -- start with short holds (20-30s) supported by the hands before removing hand support, and never load this with added weight until neck strength is well established.",
      },
      {
        name: "Sprawl",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Core", "Glutes", "Quads", "Shoulders"],
        equipment: "Bodyweight",
        movementType: "Hinge",
        laterality: "bilateral" as const,
        sports: ["Wrestling", "MMA", "Martial Arts"],
        instructions: "From standing, snap the hips back and drop the chest to the floor into a front-plank position, then explosively recover to standing. The core takedown-defense reaction in wrestling and MMA -- train it for speed off the hips, not just as a conditioning finisher.",
      },
      {
        name: "Bear Crawl",
        category: "conditioning" as const,
        muscleGroup: "Core",
        secondaryMuscles: ["Shoulders", "Quads", "Glutes"],
        equipment: "Bodyweight",
        movementType: "Carry",
        laterality: "bilateral" as const,
        sports: ["Wrestling", "MMA", "Martial Arts", "Football", "Rugby"],
        instructions: "Hands and feet on the floor, knees hovering just off the ground, crawl forward with opposite hand and foot moving together while keeping the hips level. Builds the ground-based scrambling strength grappling exchanges demand -- keep the hips down, don't let them pike up.",
      },
      {
        name: "Hollow Body Hold",
        category: "accessory" as const,
        muscleGroup: "Abs",
        secondaryMuscles: ["Hip Flexors", "Lower Back"],
        equipment: "Bodyweight",
        movementType: "Isometric",
        laterality: "bilateral" as const,
        sports: ["Gymnastics", "Cheerleading", "Volleyball", "Swimming", "Diving"],
        instructions: "Lying on your back, press the lower back into the floor and lift shoulders and legs a few inches off the ground, arms overhead. The foundational full-body tension position gymnastics and cheer skills are built on -- hold without letting the lower back arch off the floor.",
      },
      {
        name: "Power Clean",
        category: "olympic" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Traps", "Back", "Core"],
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
        sports: ["Olympic Weightlifting", "Football", "Rugby"],
        instructions: "Pull the bar from the floor and receive it in a front-rack quarter squat, stand to finish.",
      },
      {
        name: "Turkish Get-Up",
        category: "strength" as const,
        muscleGroup: "Core",
        secondaryMuscles: ["Shoulders", "Glutes", "Quads"],
        equipment: "Kettlebell",
        movementType: "Isometric",
        laterality: "unilateral" as const,
        sports: ["Wrestling", "MMA", "Martial Arts"],
        instructions: "From lying to standing while keeping a weight locked out overhead the entire time, reverse to return to the floor.",
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

    // Combination/complex exercises -- two (or three) movement patterns
    // chained into one continuous rep (a lower-body pattern feeding
    // straight into an upper-body one, e.g. a step-up into a shoulder
    // press) rather than one pattern loaded heavy. These exist for a
    // genuinely different goal than the rest of the library: a time-
    // crunched general-fitness client (a "weekend warrior," a parent, a
    // busy professional) who wants to work as many muscle groups as
    // possible per minute and keep their heart rate elevated throughout a
    // session, not chase a max on any single lift. See
    // COMBINATION_EXERCISE_TRAINING_PRINCIPLES below for how the AI is
    // taught to tell these apart from compound and isolation work and when
    // to actually reach for them. movementType "Combination" (added
    // alongside the rest of MOVEMENT_TYPES in exercise-taxonomy.ts) is
    // what makes these filterable/queryable as their own category instead
    // of just living inside "conditioning" undifferentiated from a sled
    // push or a rowing interval; muscleGroup "Full Body" here (rather than
    // one specific group) is what makes the bodyRegion backfill below tag
    // them "Full Body" too, since a chained exercise doesn't have a single
    // primary region the way an isolated lift does.
    const combinationExercises = [
      {
        name: "Goblet Squat to Overhead Press",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Shoulders", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Hold one dumbbell goblet-style at the chest, squat to depth, then press it overhead as you stand. Pairs a lower-body pattern with a shoulder press in one continuous rep -- a time-efficient way to keep the heart rate up in a circuit rather than a max-load lower-body lift, since the lighter of the two patterns caps how much weight the whole movement can use.",
      },
      {
        name: "Squat to Bicep Curl",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Biceps", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Squat to depth holding a dumbbell in each hand, then curl both as you stand back up. Good for a general-fitness circuit that wants continuous full-body movement -- not for building a heavy squat or a heavy curl, since the load has to stay light enough for the curl the whole set.",
      },
      {
        name: "Squat to Upright Row",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Shoulders", "Traps"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Squat to depth, then as you stand pull both dumbbells straight up along the body to chest height, elbows leading. Chains a lower-body pattern into a shoulder/trap pull for a time-efficient circuit exercise.",
      },
      {
        name: "Sumo Squat to Overhead Press",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Glutes", "Adductors", "Quads", "Shoulders"],
        equipment: "Kettlebell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Wide stance, toes out, squat holding one kettlebell at the chest, then press it overhead as you stand. The wide stance shifts more emphasis to the inner thigh/glutes than a standard squat while still pairing it with a press for full-body, elevated-heart-rate work.",
      },
      {
        name: "Squat to Front Raise",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Shoulders", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Squat to depth, then as you stand raise both dumbbells straight out in front to shoulder height. Front delts are a small muscle group, so this stays light -- the point is continuous full-body movement for a circuit, not loading either half of the pair heavy.",
      },
      {
        name: "Dumbbell Thruster",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Shoulders", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Squat to depth with a dumbbell in each hand at shoulder height, then drive up explosively and press both overhead using the momentum from the stand. The classic squat-to-press combination -- widely used in circuit and conditioning formats specifically because it's demanding on the heart rate without needing much load.",
      },
      {
        name: "Barbell Thruster",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Shoulders", "Core"],
        equipment: "Barbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Front squat to depth, then drive up and press the bar overhead in one continuous motion. Same combined pattern as the dumbbell version, at a heavier relative load thanks to the two-handed bar -- still governed by the shoulder press's lower ceiling, not the squat's.",
      },
      {
        name: "Goblet Squat to Hammer Curl",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Biceps", "Forearms", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Hold two dumbbells at the sides, squat to depth, then curl both with a neutral (hammer) grip as you stand. Neutral grip shifts some emphasis to the forearms alongside the biceps while keeping the same time-efficient full-body pairing.",
      },
      {
        name: "Reverse Lunge to Bicep Curl",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Biceps", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Step back into a reverse lunge, and as you drive back up to standing, curl both dumbbells. A single-leg pattern also challenges balance/stability on top of the combined muscle groups -- good for general-fitness circuits, not for loading either the lunge or the curl heavy.",
      },
      {
        name: "Reverse Lunge to Overhead Press",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Shoulders", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Step back into a reverse lunge, then press both dumbbells overhead as you return to standing. Pairs a single-leg pattern with a shoulder press -- the balance demand of the lunge is as much of the training effect here as the muscles worked.",
      },
      {
        name: "Walking Lunge with Bicep Curl",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Biceps", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Curl both dumbbells at the top of each lunge step as you travel forward. Continuous forward movement plus an upper-body pattern on every rep makes this a staple for a moving, heart-rate-elevating circuit station rather than a stationary strength exercise.",
      },
      {
        name: "Walking Lunge with Overhead Press",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Shoulders", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Press both dumbbells overhead at the top of each lunge step as you travel forward. Same traveling-lunge conditioning value as the curl variant, with a pressing pattern instead of a pull.",
      },
      {
        name: "Curtsy Lunge with Lateral Raise",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Glutes", "Adductors", "Shoulders", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Step one leg diagonally behind the other into a curtsy lunge, and as you stand raise both dumbbells out to the sides. The diagonal step hits the glute medius/adductors differently than a straight reverse lunge, paired here with a shoulder raise for a full-body circuit movement.",
      },
      {
        name: "Lateral Lunge with Overhead Press",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Glutes", "Adductors", "Quads", "Shoulders"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Step out to the side into a lateral lunge, and as you push back to center press both dumbbells overhead. The side-to-side lower-body pattern trains a plane a straight lunge or squat doesn't, chained into an overhead press for the same time-efficient full-body effect.",
      },
      {
        name: "Reverse Lunge with Front Raise",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Shoulders", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Step back into a reverse lunge, and as you return to standing raise both dumbbells straight out in front to shoulder height. Keep the load light -- the front raise is the limiting factor for how much weight the whole movement can use.",
      },
      {
        name: "Reverse Lunge with Tricep Kickback",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Triceps", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Hinge slightly forward with elbows pinned back, step into a reverse lunge, and extend both forearms back into a kickback at the top of the step. Pairs a lower-body pattern with a small, isolated triceps movement -- one of the lighter-load combinations in this group.",
      },
      {
        name: "Split Squat with Hammer Curl",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Biceps", "Forearms"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "From a static split stance, lower into a lunge and curl both dumbbells with a neutral grip as you rise. The rear-foot-elevated or flat-footed split stance holds the lower body in one spot rather than stepping, so this reads as more of a controlled single-leg strength movement than the traveling lunge variants above, still chained to an upper-body pull.",
      },
      {
        name: "Walking Lunge with Overhead Tricep Extension",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Triceps", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Hold one dumbbell overhead with both hands, and extend it behind the head into a tricep extension at the top of each traveling lunge step. A balance-demanding combination -- the overhead load and the single-leg step both challenge stability at once.",
      },
      {
        name: "Reverse Lunge with Torso Rotation",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Obliques", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Hold one dumbbell or medicine ball at the chest, step back into a reverse lunge, and rotate the torso toward the front leg at the bottom of the step. Pairs a lower-body pattern with rotational core work instead of an arm pattern -- a good substitute in this family for a client whose goal is core/rotational control rather than arm work.",
      },
      {
        name: "Step-Up to Shoulder Press",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Hamstrings", "Shoulders"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Drive through the lead heel to step up onto a box, pressing both dumbbells overhead as you reach the top; step down with control. One of the most common combination-exercise pairings for a time-efficient circuit -- a full step-up drive plus a full shoulder press in one rep, without needing max load on either.",
      },
      {
        name: "Step-Up with Bicep Curl",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Hamstrings", "Biceps"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Step up onto a box, curling both dumbbells as you reach the top; step down with control. Same time-efficient logic as the step-up-to-press variant, with a curl instead of a press.",
      },
      {
        name: "Step-Up with Lateral Raise",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Hamstrings", "Shoulders"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Step up onto a box, raising both dumbbells out to the sides as you reach the top; step down with control. Lateral raise is a small-muscle movement, so keep the load light -- it's the limiting factor for the whole pairing.",
      },
      {
        name: "Step-Up with Front Raise",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Hamstrings", "Shoulders"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Step up onto a box, raising both dumbbells out in front to shoulder height as you reach the top; step down with control. Same pairing logic as the lateral-raise variant, targeting the front delts instead of the side delts.",
      },
      {
        name: "Step-Up with Hammer Curl",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Hamstrings", "Biceps", "Forearms"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Step up onto a box, curling both dumbbells with a neutral grip as you reach the top; step down with control. Neutral grip adds forearm involvement to the standard step-up-plus-curl pairing.",
      },
      {
        name: "Step-Up to Push Press",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Hamstrings", "Shoulders"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Step up onto a box, using the drive out of the top of the step to help press both dumbbells overhead; step down with control. The leg drive assisting the press lets this move slightly more load than a strict step-up-to-shoulder-press, while staying in the same combination family.",
      },
      {
        name: "Deadlift to Upright Row",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Hamstrings", "Glutes", "Lower Back", "Shoulders", "Traps"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Hinge to pick up both dumbbells, and as you stand pull them straight up the body to chest height, elbows leading. Pairs a hip-hinge pattern with a shoulder/trap pull -- keep the load moderate since the upright row is the more load-limited half of the pair.",
      },
      {
        name: "Deadlift to Bent-Over Row",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Hamstrings", "Glutes", "Lower Back", "Back", "Lats"],
        equipment: "Barbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Deadlift the bar to standing, then hinge back forward into a bent-over row before standing tall again. Two hinge-adjacent patterns chained together -- a genuinely demanding combination that still trains as circuit/conditioning work at the loads it's typically used with, not a max-effort deadlift.",
      },
      {
        name: "Single-Leg RDL to Row",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Hamstrings", "Glutes", "Back", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Balance on one leg, hinge forward until the torso is roughly parallel to the floor, and row the dumbbell to the ribs before standing back up. Combines a single-leg balance/hinge pattern with a back row -- a demanding stability challenge on top of the two muscle groups worked.",
      },
      {
        name: "Romanian Deadlift to Bicep Curl",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Hamstrings", "Glutes", "Biceps"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Hinge at the hips keeping a soft knee bend, lower both dumbbells along the legs, then stand and curl at the top. A hamstring-dominant hinge paired with an arm pattern -- useful when a circuit wants hamstring work but a straight RDL alone would leave the block feeling too load-focused for the setting.",
      },
      {
        name: "Sumo Deadlift High Pull",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Glutes", "Adductors", "Hamstrings", "Shoulders", "Traps"],
        equipment: "Kettlebell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Wide stance, hinge to grip the kettlebell between the feet, then stand explosively and pull it up along the body to chin height, elbows out. A classic conditioning-format staple precisely because it links a wide-stance hip hinge to an explosive upper-body pull in one continuous, heart-rate-driving motion.",
      },
      {
        name: "Kettlebell Swing to Goblet Squat",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Glutes", "Hamstrings", "Quads", "Core"],
        equipment: "Kettlebell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Perform one kettlebell swing, then on the backswing catch it at the chest and drop straight into a goblet squat before standing back to the next swing. Links the ballistic hip-snap of the swing with the controlled squat pattern -- a genuinely different training stimulus (explosive then controlled) in the same rep, well suited to a conditioning-format circuit.",
      },
      {
        name: "Kettlebell Clean to Press",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Glutes", "Hamstrings", "Shoulders", "Core"],
        equipment: "Kettlebell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Hike the kettlebell back, then explosively clean it to the rack position at the shoulder, and press it overhead. More technical than most exercises in this family -- worth coaching the clean's catch position separately before combining it with the press, same as any other technical pull.",
      },
      {
        name: "Push-Up to Renegade Row",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Chest", "Shoulders", "Back", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "From a plank with hands on dumbbells, perform a push-up, then row one dumbbell to the ribs and the other on the next rep, bracing the core to resist rotating. Combines a horizontal push with an anti-rotation row -- the core stability demand is as much the point as the chest and back muscles worked.",
      },
      {
        name: "Push-Up to Shoulder Tap",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Chest", "Shoulders", "Core", "Obliques"],
        equipment: "Bodyweight",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Perform a push-up, then from the top of a plank tap one hand to the opposite shoulder without letting the hips rotate, alternating sides. A no-equipment combination that pairs a push pattern with anti-rotation core control -- easy to scale down to knees for a true beginner.",
      },
      {
        name: "Bear Crawl to Push-Up",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Chest", "Shoulders", "Core", "Quads"],
        equipment: "Bodyweight",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Crawl forward a set distance in a bear-crawl position, then drop to a push-up at the end before crawling back. Pairs continuous full-body crawling (shoulders, core, and legs all loaded at once) with a push pattern -- a genuinely high-heart-rate combination even with zero equipment.",
      },
      {
        name: "Burpee to Overhead Press",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Chest", "Quads", "Glutes", "Shoulders", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Perform a burpee, and on standing at the top press both dumbbells overhead instead of just a jump. Adds a pressing pattern onto an already full-body movement -- one of the more demanding conditioning combinations in this group, so scale volume down before scaling load up.",
      },
      {
        name: "Burpee with Broad Jump",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Chest", "Quads", "Glutes", "Calves", "Core"],
        equipment: "Bodyweight",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Perform a burpee, and instead of a vertical jump at the top, jump forward for distance before turning around to repeat. Combines a full-body conditioning movement with an explosive horizontal jump -- needs enough space to travel, unlike a standard burpee done in place.",
      },
      {
        name: "Man Maker",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Chest", "Back", "Shoulders", "Quads", "Glutes", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "From a plank with hands on dumbbells: row each arm once, perform a push-up, jump the feet up outside the hands, stand and curl the dumbbells to the shoulders, then press overhead. The most complete combination exercise in this library -- five distinct patterns in one rep -- so it's built entirely for conditioning-format work; nobody should be chasing a load PR on this.",
      },
      {
        name: "Squat with Woodchopper",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Obliques", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Squat to depth holding one dumbbell with both hands at one hip, then as you stand rotate the weight diagonally up and across to the opposite shoulder. Trades an arm pattern for rotational core work while keeping the same lower-body/upper-body combination structure as the rest of this family.",
      },
      {
        name: "Lunge with Woodchopper",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Obliques", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Step into a reverse lunge holding one dumbbell at the hip, and as you drive back up rotate it diagonally across the body to the opposite shoulder. Same rotational-core pairing as the squat version, on a single-leg base for an added balance challenge.",
      },
      {
        name: "Step-Up with Woodchopper",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Obliques", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Step up onto a box holding one dumbbell at the hip, rotating it diagonally up and across to the opposite shoulder as you reach the top. Rounds out the woodchopper family with the step-up's added balance/stability demand.",
      },
      {
        name: "Squat to Push Press",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Shoulders", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Squat to depth, then use the drive out of the bottom to help press both dumbbells overhead. Nearly identical to a thruster, named separately since some coaches distinguish the deliberate two-part tempo (a controlled squat, then a driven press) from the thruster's more continuous single motion -- either name points at the same combined pattern.",
      },
      {
        name: "Lateral Lunge with Bicep Curl",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Glutes", "Adductors", "Quads", "Biceps"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Step out to the side into a lateral lunge, and as you push back to center curl both dumbbells. A side-to-side lower-body pattern paired with an arm curl for the same time-efficient full-body effect as the rest of the lunge combinations.",
      },
      {
        name: "Curtsy Lunge with Bicep Curl",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Glutes", "Adductors", "Biceps"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Step one leg diagonally behind the other into a curtsy lunge, curling both dumbbells as you stand back up. Combines the curtsy lunge's glute-medius emphasis with a curl instead of a raise or press.",
      },
      {
        name: "Deadlift to Hammer Curl",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Hamstrings", "Glutes", "Lower Back", "Biceps", "Forearms"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Hinge to pick up both dumbbells, and curl them with a neutral grip as you stand to finish. Same hip-hinge-plus-arm-pattern logic as the other deadlift combinations, with a neutral grip adding forearm work.",
      },
      {
        name: "Suitcase Deadlift to Row",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Hamstrings", "Glutes", "Obliques", "Back", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Deadlift a single dumbbell held at one side like a suitcase, then row it to the ribs before lowering back to the floor for the next rep. The offset, one-sided load makes the core work anti-laterally the whole set -- a different core demand than the bilateral deadlift-row variants above.",
      },
      {
        name: "Goblet Squat with Front Raise",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Shoulders", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Hold one dumbbell goblet-style, squat to depth, then switch to a two-handed front raise to shoulder height as you stand. An easy entry-level combination -- the goblet hold itself already reinforces upright torso position for a beginner before the raise is added.",
      },
      {
        name: "Box Step-Up with Overhead Tricep Extension",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Hamstrings", "Triceps"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Step up onto a box holding one dumbbell overhead with both hands, extending it into a tricep extension as you reach the top; step down with control. Combines the step-up's balance demand with an overhead triceps movement rather than a curl or press.",
      },
      {
        name: "Reverse Lunge to Bicep Curl to Press",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Biceps", "Shoulders", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "unilateral" as const,
        instructions: "Step back into a reverse lunge; as you stand, curl both dumbbells to the shoulders, then press them overhead. A three-part combination (lunge, curl, press) rather than two -- one of the more complete single-rep circuits in this library, and a good example for the AI of how far a combination exercise can be chained before it becomes its own mini-circuit.",
      },
      {
        name: "Squat to Bicep Curl to Press",
        category: "conditioning" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Biceps", "Shoulders", "Core"],
        equipment: "Dumbbell",
        movementType: "Combination",
        laterality: "bilateral" as const,
        instructions: "Squat to depth; as you stand, curl both dumbbells to the shoulders, then press them overhead. The bilateral version of the three-part lunge/curl/press combination above -- three patterns chained into one rep, built for a conditioning circuit rather than any single strength number.",
      },
    ];
    for (const ex of combinationExercises) {
      if (existingExerciseNames.has(ex.name)) continue;
      const row = await storage.createExercise(coach.id, {
        ...ex,
        videoUrl: videoSearchUrl(ex.name),
      });
      exerciseMap[ex.name] = row.id;
    }

    // 231 -> ~413 library expansion: real gaps in each existing category
    // bucket (more equipment/single-joint variants of patterns already in
    // the library), not new movement patterns -- see the exercise-family.ts
    // comment on why that matters for the accordion picker's Combination
    // bucket specifically staying a real, distinct count rather than 0.
    const expansionExercises = [
      // -- Strength: squat variants --
      { name: "Zercher Squat", category: "strength" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Core", "Back"], equipment: "Barbell", movementType: "Squat", laterality: "bilateral" as const, instructions: "Bar cradled in the crooks of the elbows, squat to depth keeping the torso upright against the front-loaded bar." },
      { name: "Safety Bar Squat", category: "strength" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Hamstrings", "Core"], equipment: "Barbell", movementType: "Squat", laterality: "bilateral" as const, instructions: "Cambered safety-squat bar shifts load slightly forward and frees the hands -- squat to depth as with a back squat." },
      { name: "Pin Squat", category: "strength" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Hamstrings"], equipment: "Barbell", movementType: "Squat", laterality: "bilateral" as const, instructions: "Squat down onto safety pins set at a fixed depth, pause fully dead on the pins to kill the stretch reflex, then drive up from a full stop." },
      { name: "Anderson Squat", category: "strength" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Hamstrings"], equipment: "Barbell", movementType: "Squat", laterality: "bilateral" as const, instructions: "Start from a dead stop on pins at the bottom of the squat with no eccentric -- builds bottom-position drive without any stretch-reflex assistance." },
      { name: "Pause Back Squat", category: "strength" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Hamstrings", "Core"], equipment: "Barbell", movementType: "Squat", laterality: "bilateral" as const, instructions: "Squat to depth and hold 2-3 seconds at the bottom before driving up -- removes the stretch reflex and exposes a weak bottom position." },
      { name: "Pause Front Squat", category: "strength" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Core"], equipment: "Barbell", movementType: "Squat", laterality: "bilateral" as const, instructions: "Front-rack squat to depth, hold 2-3 seconds at the bottom keeping the elbows up and torso vertical, then stand." },
      { name: "Trap Bar Squat", category: "strength" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Hamstrings"], equipment: "Trap Bar", movementType: "Squat", laterality: "bilateral" as const, instructions: "Stand inside the trap bar, squat to depth -- the neutral grip and centered load make this the easiest bar-loaded squat pattern to teach." },
      { name: "Belt Squat", category: "strength" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Hamstrings"], equipment: "Machine", movementType: "Squat", laterality: "bilateral" as const, instructions: "Load hangs from a belt at the hips, not the spine -- squat to depth with zero axial spinal load, useful around a back that needs a break from bar loading." },
      { name: "Cambered Bar Squat", category: "strength" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Hamstrings", "Core"], equipment: "Barbell", movementType: "Squat", laterality: "bilateral" as const, instructions: "The camber's whip adds an unstable, oscillating load through the squat -- same depth and cues as a back squat, more total-body bracing demand." },
      { name: "Landmine Squat", category: "strength" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Core"], equipment: "Landmine", movementType: "Squat", laterality: "bilateral" as const, instructions: "Hold the landmine sleeve at the chest with both hands, squat to depth -- the arcing bar path is an easy first loaded squat for a beginner." },
      // -- Strength: hinge variants --
      { name: "Snatch-Grip Deadlift", category: "strength" as const, muscleGroup: "Hamstrings", secondaryMuscles: ["Glutes", "Back", "Traps"], equipment: "Barbell", movementType: "Hinge", laterality: "bilateral" as const, sports: ["Olympic Weightlifting"], instructions: "Wide snatch-width grip increases range of motion and back/trap demand -- pull from the floor keeping the bar close, hips and shoulders rising together." },
      { name: "Stiff-Leg Deadlift", category: "strength" as const, muscleGroup: "Hamstrings", secondaryMuscles: ["Glutes", "Lower Back"], equipment: "Barbell", movementType: "Hinge", laterality: "bilateral" as const, instructions: "Knees stay nearly locked throughout -- hinge at the hips only, lowering the bar along the shins until a deep hamstring stretch is reached." },
      { name: "Block Pull", category: "strength" as const, muscleGroup: "Hamstrings", secondaryMuscles: ["Glutes", "Back", "Traps"], equipment: "Barbell", movementType: "Hinge", laterality: "bilateral" as const, instructions: "Bar starts elevated on blocks, shortening the pull's range -- lets a coach overload the lockout portion of the deadlift specifically." },
      { name: "Seated Good Morning", category: "strength" as const, muscleGroup: "Lower Back", secondaryMuscles: ["Hamstrings", "Glutes"], equipment: "Barbell", movementType: "Hinge", laterality: "bilateral" as const, instructions: "Seated on a bench with the bar on the back, hinge forward from the hips keeping the low back flat, then return to upright." },
      { name: "Dumbbell Deadlift", category: "strength" as const, muscleGroup: "Hamstrings", secondaryMuscles: ["Glutes", "Lower Back"], equipment: "Dumbbell", movementType: "Hinge", laterality: "bilateral" as const, instructions: "Dumbbells at the sides or in front of the thighs, hinge to the floor and back keeping the spine neutral -- the easiest hinge pattern to teach a beginner." },
      { name: "Dumbbell Sumo Deadlift", category: "strength" as const, muscleGroup: "Glutes", secondaryMuscles: ["Hamstrings", "Adductors"], equipment: "Dumbbell", movementType: "Hinge", laterality: "bilateral" as const, instructions: "Wide stance, single dumbbell hanging between the legs -- hinge to the floor with a more upright torso than a conventional deadlift." },
      // -- Strength: press variants --
      { name: "Behind-the-Neck Press", category: "strength" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Triceps", "Traps"], equipment: "Barbell", movementType: "Press", laterality: "bilateral" as const, instructions: "Press from behind the neck to full lockout overhead -- needs real overhead shoulder mobility; skip it on anyone who doesn't have that mobility yet." },
      { name: "Seated Barbell Press", category: "strength" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Triceps"], equipment: "Barbell", movementType: "Press", laterality: "bilateral" as const, instructions: "Seated to remove leg drive, press the bar from the shoulders to full lockout overhead -- isolates the shoulders/triceps from the standing press's whole-body contribution." },
      { name: "Z Press", category: "strength" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Triceps", "Core"], equipment: "Barbell", movementType: "Press", laterality: "bilateral" as const, instructions: "Seated on the floor with legs straight out, no back support -- press overhead with zero leg or torso assistance, pure shoulder strength and bracing." },
      { name: "Viking Press", category: "strength" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Triceps", "Chest"], equipment: "Machine", movementType: "Press", laterality: "bilateral" as const, instructions: "Neutral-grip press on a landmine-style press rig -- shoulder-friendlier grip path than a straight barbell overhead press." },
      { name: "Single-Arm Overhead Press", category: "strength" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Triceps", "Core"], equipment: "Dumbbell", movementType: "Press", laterality: "unilateral" as const, instructions: "Press one dumbbell overhead to lockout, resisting the urge to lean away -- real anti-lateral-flexion core demand alongside the shoulder work." },
      { name: "Single-Arm Landmine Press", category: "strength" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Triceps", "Chest", "Core"], equipment: "Landmine", movementType: "Press", laterality: "unilateral" as const, instructions: "Press the landmine sleeve from the shoulder up and slightly forward along its arc -- a shoulder-friendly angled press, good for an athlete who can't tolerate a straight overhead path." },
      // -- Strength: horizontal push variants --
      { name: "Spoto Press", category: "strength" as const, muscleGroup: "Chest", secondaryMuscles: ["Triceps", "Shoulders"], equipment: "Barbell", movementType: "Push", laterality: "bilateral" as const, instructions: "Bench press stopping an inch above the chest, no touch-and-go -- kills momentum out of the bottom and builds control through the sticking point." },
      { name: "Larsen Press", category: "strength" as const, muscleGroup: "Chest", secondaryMuscles: ["Triceps", "Shoulders"], equipment: "Barbell", movementType: "Push", laterality: "bilateral" as const, instructions: "Bench press with the feet up off the floor -- removes leg drive entirely, isolating the upper body's pressing strength." },
      { name: "Board Press", category: "strength" as const, muscleGroup: "Chest", secondaryMuscles: ["Triceps", "Shoulders"], equipment: "Barbell", movementType: "Push", laterality: "bilateral" as const, instructions: "Boards on the chest shorten the range of motion -- overloads the top-half lockout portion of the bench press specifically." },
      { name: "Swiss Bar Bench Press", category: "strength" as const, muscleGroup: "Chest", secondaryMuscles: ["Triceps", "Shoulders"], equipment: "Barbell", movementType: "Push", laterality: "bilateral" as const, instructions: "Neutral-grip multi-grip bar -- presses like a bench press with a shoulder-friendlier wrist and elbow path than a straight barbell." },
      { name: "Wide-Grip Bench Press", category: "strength" as const, muscleGroup: "Chest", secondaryMuscles: ["Triceps", "Shoulders"], equipment: "Barbell", movementType: "Push", laterality: "bilateral" as const, instructions: "Wider-than-shoulder grip shortens the bar path and shifts emphasis toward the chest, away from the triceps." },
      { name: "Reverse-Grip Bench Press", category: "strength" as const, muscleGroup: "Chest", secondaryMuscles: ["Triceps", "Shoulders", "Biceps"], equipment: "Barbell", movementType: "Push", laterality: "bilateral" as const, instructions: "Underhand grip on the bar -- shifts emphasis toward the upper chest and reduces shoulder strain for some lifters versus a standard grip." },
      { name: "Pin Press", category: "strength" as const, muscleGroup: "Chest", secondaryMuscles: ["Triceps", "Shoulders"], equipment: "Barbell", movementType: "Push", laterality: "bilateral" as const, instructions: "Press from a dead stop off safety pins set at chest height -- no stretch reflex, pure concentric strength off the chest." },
      // -- Strength: pull/row variants --
      { name: "Yates Row", category: "strength" as const, muscleGroup: "Back", secondaryMuscles: ["Lats", "Biceps", "Traps"], equipment: "Barbell", movementType: "Pull", laterality: "bilateral" as const, instructions: "More upright torso and an underhand grip than a conventional bent-over row -- row to the hips, elbows driving back." },
      { name: "Seal Row", category: "strength" as const, muscleGroup: "Back", secondaryMuscles: ["Lats", "Biceps"], equipment: "Barbell", movementType: "Pull", laterality: "bilateral" as const, instructions: "Chest flat on an elevated bench, row the bar to the chest -- removes all torso momentum, isolating the back's pulling strength." },
      { name: "Kroc Row", category: "strength" as const, muscleGroup: "Back", secondaryMuscles: ["Lats", "Biceps", "Traps"], equipment: "Dumbbell", movementType: "Pull", laterality: "unilateral" as const, instructions: "Heavy single-arm dumbbell row for high reps, some body English allowed -- built for total back work capacity, not strict form." },
      { name: "Chest-Supported Dumbbell Row", category: "strength" as const, muscleGroup: "Back", secondaryMuscles: ["Lats", "Biceps"], equipment: "Dumbbell", movementType: "Pull", laterality: "bilateral" as const, instructions: "Chest braced against an incline bench, row both dumbbells to the ribs -- zero momentum, strict back isolation." },
      // -- Strength: loaded carries --
      { name: "Trap Bar Carry", category: "strength" as const, muscleGroup: "Full Body", secondaryMuscles: ["Forearms", "Core", "Traps"], equipment: "Trap Bar", movementType: "Carry", laterality: "bilateral" as const, instructions: "Deadlift the trap bar to standing, walk a set distance keeping the torso tall and the grip locked in." },
      { name: "Overhead Carry", category: "strength" as const, muscleGroup: "Full Body", secondaryMuscles: ["Shoulders", "Core"], equipment: "Dumbbell", movementType: "Carry", laterality: "bilateral" as const, instructions: "Press the load overhead, walk a set distance keeping the arms locked out directly above the shoulders -- a real overhead-stability and bracing test." },
      { name: "Waiter's Carry", category: "strength" as const, muscleGroup: "Full Body", secondaryMuscles: ["Shoulders", "Core"], equipment: "Dumbbell", movementType: "Carry", laterality: "unilateral" as const, instructions: "Carry a single dumbbell overhead on one side, palm up like a waiter's tray, resisting the lean toward the loaded side." },
      { name: "Zercher Carry", category: "strength" as const, muscleGroup: "Full Body", secondaryMuscles: ["Core", "Back", "Biceps"], equipment: "Barbell", movementType: "Carry", laterality: "bilateral" as const, instructions: "Carry the bar cradled in the crooks of the elbows, torso upright -- brutal on the upper back and core bracing over distance." },
      // -- Strength: loaded unilateral lower --
      { name: "Barbell Bulgarian Split Squat", category: "strength" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Hamstrings", "Adductors", "Core"], equipment: "Barbell", movementType: "Lunge", laterality: "unilateral" as const, instructions: "Back-racked bar, rear foot elevated -- drop straight down through the front leg, same cues as the dumbbell version at meaningfully heavier loads." },
      { name: "Barbell Reverse Lunge", category: "strength" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Hamstrings", "Core"], equipment: "Barbell", movementType: "Lunge", laterality: "unilateral" as const, instructions: "Bar on the back, step backward into a lunge and drive back to standing through the front heel." },
      { name: "Barbell Walking Lunge", category: "strength" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Hamstrings", "Core"], equipment: "Barbell", movementType: "Lunge", laterality: "unilateral" as const, instructions: "Bar on the back, alternate lunging steps forward across a set distance -- adds a real balance and coordination demand under load." },
      { name: "Barbell Step-Up", category: "strength" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Hamstrings", "Core"], equipment: "Barbell", movementType: "Lunge", laterality: "unilateral" as const, instructions: "Bar on the back, drive up through one leg onto a box to full hip extension, control the descent back down." },
      { name: "Machine Hack Squat", category: "strength" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes"], equipment: "Machine", movementType: "Squat", laterality: "bilateral" as const, instructions: "Fixed-path squat sled with the back supported -- squat to depth without the balance/bracing demand of a free-standing squat." },

      // -- Olympic --
      { name: "Muscle Snatch", category: "olympic" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Back", "Traps", "Core"], equipment: "Barbell", movementType: "Pull", laterality: "bilateral" as const, sports: ["Olympic Weightlifting"], instructions: "Pull the bar from the floor to overhead lockout with zero re-bend of the knees under it -- a pure pull-and-press strength drill for the snatch." },
      { name: "Muscle Clean", category: "olympic" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Back", "Traps", "Core"], equipment: "Barbell", movementType: "Pull", laterality: "bilateral" as const, sports: ["Olympic Weightlifting"], instructions: "Pull the bar from the floor to the front rack with no re-bend under it -- exposes a weak finish/turnover in the clean's pull." },
      { name: "Power Snatch", category: "olympic" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Back", "Glutes", "Hamstrings", "Traps"], equipment: "Barbell", movementType: "Pull", laterality: "bilateral" as const, sports: ["Olympic Weightlifting"], instructions: "Pull from the floor and receive overhead in a partial-depth squat, well above parallel -- the speed/power regression of the full snatch." },
      { name: "Hang Power Clean", category: "olympic" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Back", "Glutes", "Hamstrings", "Traps"], equipment: "Barbell", movementType: "Pull", laterality: "bilateral" as const, sports: ["Olympic Weightlifting", "Football", "Track & Field"], instructions: "Start from the hang just above the knee, drive through triple extension and receive in a quarter-squat front rack." },
      { name: "Hang Power Snatch", category: "olympic" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Back", "Glutes", "Hamstrings", "Traps"], equipment: "Barbell", movementType: "Pull", laterality: "bilateral" as const, sports: ["Olympic Weightlifting", "Track & Field"], instructions: "Start from the hang, drive through triple extension and receive overhead in a quarter-squat -- no first pull off the floor to time." },
      { name: "Block Clean", category: "olympic" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Back", "Glutes", "Traps"], equipment: "Barbell", movementType: "Pull", laterality: "bilateral" as const, sports: ["Olympic Weightlifting"], instructions: "Bar starts elevated on blocks at or above the knee -- isolates the clean's second pull and turnover without the floor start." },
      { name: "Block Snatch", category: "olympic" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Back", "Glutes", "Traps"], equipment: "Barbell", movementType: "Pull", laterality: "bilateral" as const, sports: ["Olympic Weightlifting"], instructions: "Bar starts elevated on blocks -- isolates the snatch's second pull and overhead receiving position without the floor start." },
      { name: "Snatch Balance", category: "olympic" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Quads", "Core"], equipment: "Barbell", movementType: "Squat", laterality: "bilateral" as const, sports: ["Olympic Weightlifting"], instructions: "Dip-drive the bar off the back and drop under it into a full overhead squat -- pure receiving-position and overhead-stability drill." },
      { name: "Push Jerk", category: "olympic" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Triceps", "Quads", "Core"], equipment: "Barbell", movementType: "Press", laterality: "bilateral" as const, sports: ["Olympic Weightlifting"], instructions: "Dip and drive the bar off the front rack, catching it overhead in a quarter-squat -- the jerk's leg-drive-assisted overhead lockout." },
      { name: "Jerk Balance", category: "olympic" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Quads", "Core"], equipment: "Barbell", movementType: "Squat", laterality: "bilateral" as const, sports: ["Olympic Weightlifting"], instructions: "From a front rack, dip and press-drop the bar overhead into a split or squat receiving position without a true jerk drive -- a footwork and receiving-position drill." },
      { name: "Tall Clean", category: "olympic" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Back", "Traps"], equipment: "Barbell", movementType: "Pull", laterality: "bilateral" as const, sports: ["Olympic Weightlifting"], instructions: "Start from a fully tall, extended position with the bar at the hip and drop straight under it into the front rack -- pure turnover-under-the-bar speed drill." },
      { name: "Tall Snatch", category: "olympic" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Back", "Traps"], equipment: "Barbell", movementType: "Pull", laterality: "bilateral" as const, sports: ["Olympic Weightlifting"], instructions: "Start from a fully tall, extended position and drop straight under the bar into an overhead squat receive -- pure turnover speed drill." },
      { name: "Snatch-Grip High Pull", category: "olympic" as const, muscleGroup: "Back", secondaryMuscles: ["Traps", "Hamstrings", "Glutes"], equipment: "Barbell", movementType: "Pull", laterality: "bilateral" as const, sports: ["Olympic Weightlifting"], instructions: "Pull the bar from the floor to chest height leading with the elbows, wide snatch grip -- builds the pull's finish without a receiving position." },
      { name: "Clean High Pull", category: "olympic" as const, muscleGroup: "Back", secondaryMuscles: ["Traps", "Hamstrings", "Glutes"], equipment: "Barbell", movementType: "Pull", laterality: "bilateral" as const, sports: ["Olympic Weightlifting"], instructions: "Pull the bar from the floor to chest height leading with the elbows, clean-width grip -- same finish drill as the snatch-grip version, narrower hands." },
      { name: "Pause Clean", category: "olympic" as const, muscleGroup: "Back", secondaryMuscles: ["Traps", "Hamstrings", "Glutes", "Quads"], equipment: "Barbell", movementType: "Pull", laterality: "bilateral" as const, sports: ["Olympic Weightlifting"], instructions: "Pause 1-2 seconds just above the knee mid-pull before finishing the clean -- exposes and fixes a rushed or early-arriving position off the floor." },

      // -- Plyometric --
      { name: "Squat Jump", category: "plyometric" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Calves"], equipment: "Bodyweight", movementType: "Squat", laterality: "bilateral" as const, instructions: "From a static squat with no countermovement, jump for max height, landing soft back into the squat position." },
      { name: "Countermovement Jump", category: "plyometric" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Calves"], equipment: "Bodyweight", movementType: "Squat", laterality: "bilateral" as const, instructions: "Dip quickly into a quarter squat and jump immediately for max height -- the standard reactive vertical jump test movement." },
      { name: "Standing Long Jump", category: "plyometric" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Calves", "Core"], equipment: "Bodyweight", movementType: "Squat", laterality: "bilateral" as const, instructions: "Dip and drive both arms and legs forward for maximum horizontal distance, landing balanced on both feet." },
      { name: "Repeated Broad Jump", category: "plyometric" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Calves"], equipment: "Bodyweight", movementType: "Squat", laterality: "bilateral" as const, instructions: "Chain 3-5 broad jumps back to back with minimal ground contact time between them -- reactive horizontal power, not single-jump distance." },
      { name: "Continuous Box Jump", category: "plyometric" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Calves"], equipment: "Bodyweight", movementType: "Squat", laterality: "bilateral" as const, instructions: "Jump onto the box, step down, and immediately jump again for the prescribed reps -- minimal pause between jumps, unlike a single reset box jump." },
      { name: "Skater Bound", category: "plyometric" as const, muscleGroup: "Glutes", secondaryMuscles: ["Quads", "Adductors", "Calves"], equipment: "Bodyweight", movementType: "Lunge", laterality: "unilateral" as const, sports: ["Ice Hockey", "Speed Skating", "Basketball"], instructions: "Bound laterally from one leg to the other like a speed skater's stride, sticking each landing before the next bound." },
      { name: "Bounding", category: "plyometric" as const, muscleGroup: "Hamstrings", secondaryMuscles: ["Glutes", "Calves"], equipment: "Bodyweight", movementType: "Lunge", laterality: "unilateral" as const, sports: ["Track & Field", "Football"], instructions: "Exaggerated running stride emphasizing max distance and hang time per stride over a set distance -- horizontal reactive power for sprinting." },
      { name: "Drop Jump", category: "plyometric" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Calves"], equipment: "Bodyweight", movementType: "Squat", laterality: "bilateral" as const, instructions: "Step off a low box, and on landing immediately jump for max height -- minimizes ground contact time to train reactive strength." },
      { name: "Squat Jump to Stick", category: "plyometric" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Calves", "Core"], equipment: "Bodyweight", movementType: "Squat", laterality: "bilateral" as const, instructions: "Jump for height and land completely still, holding the landing position for a full 2 seconds -- landing mechanics and deceleration control, not the jump itself." },
      { name: "Single-Leg Hop", category: "plyometric" as const, muscleGroup: "Calves", secondaryMuscles: ["Quads", "Glutes"], equipment: "Bodyweight", movementType: "Squat", laterality: "unilateral" as const, instructions: "Hop repeatedly on one leg for height or distance, resetting balance briefly between each hop." },
      { name: "Lateral Hurdle Hop", category: "plyometric" as const, muscleGroup: "Calves", secondaryMuscles: ["Quads", "Glutes", "Adductors"], equipment: "Bodyweight", movementType: "Lunge", laterality: "unilateral" as const, instructions: "Hop sideways back and forth over a low hurdle or line, staying light and quick on the ground between hops." },
      { name: "Med Ball Chest Pass", category: "plyometric" as const, muscleGroup: "Chest", secondaryMuscles: ["Triceps", "Shoulders", "Core"], equipment: "Medicine Ball", movementType: "Push", laterality: "bilateral" as const, instructions: "Explosively throw the ball from the chest to a wall or partner, catching the return and resetting immediately for the next rep." },
      { name: "Med Ball Overhead Throw", category: "plyometric" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Core", "Triceps"], equipment: "Medicine Ball", movementType: "Press", laterality: "bilateral" as const, instructions: "Load the ball behind the head and throw it forward and down (or up against a wall) with full-body extension -- explosive overhead power, not a strict press." },
      { name: "Reactive Broad Jump", category: "plyometric" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Calves"], equipment: "Bodyweight", movementType: "Squat", laterality: "bilateral" as const, instructions: "Broad jump for distance, and on landing immediately absorb and re-jump again -- distance plus reactive re-jump ability in one drill." },

      // -- Accessory: shoulders --
      { name: "Cable Lateral Raise", category: "accessory" as const, muscleGroup: "Shoulders", equipment: "Cable", movementType: "Push", laterality: "unilateral" as const, instructions: "Raise the cable out to the side to shoulder height, keeping a slight bend in the elbow, then control the descent." },
      { name: "Cable Rear Delt Fly", category: "accessory" as const, muscleGroup: "Shoulders", equipment: "Cable", movementType: "Pull", laterality: "bilateral" as const, instructions: "Cables crossed in front of the body, sweep both arms out and back at shoulder height, squeezing the rear delts." },
      { name: "Machine Lateral Raise", category: "accessory" as const, muscleGroup: "Shoulders", equipment: "Machine", movementType: "Push", laterality: "bilateral" as const, instructions: "Fixed-path lateral raise machine -- raise the arms to shoulder height, control the return." },
      { name: "Dumbbell Front Raise", category: "accessory" as const, muscleGroup: "Shoulders", equipment: "Dumbbell", movementType: "Push", laterality: "bilateral" as const, instructions: "Raise both dumbbells straight out in front to shoulder height, control the descent." },
      { name: "Plate Front Raise", category: "accessory" as const, muscleGroup: "Shoulders", equipment: "Plate", movementType: "Push", laterality: "bilateral" as const, instructions: "Hold a single plate with both hands, raise straight out in front to shoulder height, control the descent." },
      { name: "Cuban Press", category: "accessory" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Traps", "Triceps"], equipment: "Dumbbell", movementType: "Press", laterality: "bilateral" as const, instructions: "Upright row to elbow height, external rotation to a goalpost position, then press overhead -- one continuous rep for shoulder health and pressing strength." },
      { name: "W-Raise", category: "accessory" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Traps"], equipment: "Dumbbell", movementType: "Push", laterality: "bilateral" as const, instructions: "Raise both dumbbells out and up into a W shape, squeezing the shoulder blades together at the top -- light load, real shoulder-health accessory work." },
      { name: "Egyptian Lateral Raise", category: "accessory" as const, muscleGroup: "Shoulders", equipment: "Cable", movementType: "Push", laterality: "unilateral" as const, instructions: "Lean away from the cable stack at the waist and raise the cable out to the side -- the lean increases the stretch and range at the bottom." },
      { name: "Bent-Over Dumbbell Rear Delt Raise", category: "accessory" as const, muscleGroup: "Shoulders", equipment: "Dumbbell", movementType: "Pull", laterality: "bilateral" as const, instructions: "Hinge forward at the hips, raise both dumbbells out to the sides squeezing the rear delts, control the descent." },
      // -- Accessory: chest --
      { name: "Incline Cable Fly", category: "accessory" as const, muscleGroup: "Chest", secondaryMuscles: ["Shoulders"], equipment: "Cable", movementType: "Push", laterality: "bilateral" as const, instructions: "Low-to-high cable path on an incline bench, sweep both arms together at chest height, control the stretch on the way back." },
      { name: "Low-to-High Cable Fly", category: "accessory" as const, muscleGroup: "Chest", secondaryMuscles: ["Shoulders"], equipment: "Cable", movementType: "Push", laterality: "bilateral" as const, instructions: "Cables set low, sweep both arms up and together to chest height -- targets the upper chest fibers a flat-bench fly misses." },
      { name: "Pec Deck", category: "accessory" as const, muscleGroup: "Chest", equipment: "Machine", movementType: "Push", laterality: "bilateral" as const, instructions: "Fixed-path chest fly machine -- squeeze both pads together in front of the chest, control the return." },
      { name: "Svend Press", category: "accessory" as const, muscleGroup: "Chest", secondaryMuscles: ["Shoulders", "Triceps"], equipment: "Plate", movementType: "Push", laterality: "bilateral" as const, instructions: "Squeeze a plate between both palms at the chest and press straight out, keeping constant inward pressure on the plate throughout." },
      { name: "Decline Dumbbell Fly", category: "accessory" as const, muscleGroup: "Chest", secondaryMuscles: ["Shoulders"], equipment: "Dumbbell", movementType: "Push", laterality: "bilateral" as const, instructions: "On a decline bench, lower both dumbbells out to the sides with a slight elbow bend, then sweep them back together over the lower chest." },
      { name: "Incline Dumbbell Fly", category: "accessory" as const, muscleGroup: "Chest", secondaryMuscles: ["Shoulders"], equipment: "Dumbbell", movementType: "Push", laterality: "bilateral" as const, instructions: "On an incline bench, lower both dumbbells out to the sides with a slight elbow bend, then sweep them back together over the upper chest." },
      // -- Accessory: back/lats --
      { name: "Single-Arm Lat Pulldown", category: "accessory" as const, muscleGroup: "Lats", secondaryMuscles: ["Biceps", "Back"], equipment: "Cable", movementType: "Pull", laterality: "unilateral" as const, instructions: "Pull a single handle down to the side of the torso, driving the elbow down and back -- exposes and fixes a side-to-side lat imbalance." },
      { name: "Kneeling Lat Pulldown", category: "accessory" as const, muscleGroup: "Lats", secondaryMuscles: ["Biceps", "Back"], equipment: "Cable", movementType: "Pull", laterality: "bilateral" as const, instructions: "Kneeling under the cable stack, pull the bar down to the upper chest -- removes the seat/thigh-pad assist, more core and lat control required." },
      { name: "Straight-Arm Pushdown", category: "accessory" as const, muscleGroup: "Lats", secondaryMuscles: ["Core"], equipment: "Cable", movementType: "Pull", laterality: "bilateral" as const, instructions: "Arms straight, pull the bar down from overhead to the thighs by driving the shoulders down -- isolates the lats without any elbow-flexion bicep help." },
      { name: "Dumbbell Pullover", category: "accessory" as const, muscleGroup: "Lats", secondaryMuscles: ["Chest", "Triceps"], equipment: "Dumbbell", movementType: "Pull", laterality: "bilateral" as const, instructions: "Lying across a bench, lower a single dumbbell behind the head with slightly bent arms, then pull it back over the chest." },
      { name: "Cable Pullover", category: "accessory" as const, muscleGroup: "Lats", secondaryMuscles: ["Chest", "Triceps"], equipment: "Cable", movementType: "Pull", laterality: "bilateral" as const, instructions: "Standing, pull the cable from overhead down to the thighs in an arc with straight arms -- constant-tension version of the dumbbell pullover." },
      { name: "Renegade Row", category: "accessory" as const, muscleGroup: "Back", secondaryMuscles: ["Core", "Shoulders", "Lats"], equipment: "Dumbbell", movementType: "Pull", laterality: "unilateral" as const, instructions: "From a plank on two dumbbells, row one dumbbell to the ribs while bracing hard against rotation, then switch sides." },
      // -- Accessory: biceps --
      { name: "Cable Hammer Curl", category: "accessory" as const, muscleGroup: "Biceps", secondaryMuscles: ["Forearms"], equipment: "Cable", movementType: "Pull", laterality: "bilateral" as const, instructions: "Rope attachment, neutral grip, curl to the shoulders keeping the elbows pinned to the sides." },
      { name: "Incline Dumbbell Curl", category: "accessory" as const, muscleGroup: "Biceps", equipment: "Dumbbell", movementType: "Pull", laterality: "bilateral" as const, instructions: "Seated on an incline bench with arms hanging straight down, curl both dumbbells up -- the arms-behind-torso position maximizes the bicep stretch." },
      { name: "Spider Curl", category: "accessory" as const, muscleGroup: "Biceps", equipment: "EZ-Bar", movementType: "Pull", laterality: "bilateral" as const, instructions: "Chest against an inclined bench, arms hanging straight down in front, curl the bar up without swinging -- strict, momentum-free bicep isolation." },
      { name: "Drag Curl", category: "accessory" as const, muscleGroup: "Biceps", equipment: "Barbell", movementType: "Pull", laterality: "bilateral" as const, instructions: "Curl the bar up while dragging it along the torso, elbows drifting back rather than staying pinned -- shifts tension differently than a standard curl." },
      { name: "Cross-Body Hammer Curl", category: "accessory" as const, muscleGroup: "Biceps", secondaryMuscles: ["Forearms"], equipment: "Dumbbell", movementType: "Pull", laterality: "unilateral" as const, instructions: "Neutral-grip curl across the body toward the opposite shoulder rather than straight up." },
      { name: "Cable Rope Curl", category: "accessory" as const, muscleGroup: "Biceps", equipment: "Cable", movementType: "Pull", laterality: "bilateral" as const, instructions: "Rope attachment on a low pulley, curl to the shoulders and spread the rope ends apart at the top for extra peak contraction." },
      { name: "Bayesian Cable Curl", category: "accessory" as const, muscleGroup: "Biceps", equipment: "Cable", movementType: "Pull", laterality: "unilateral" as const, instructions: "Facing away from a low cable pulley with the arm extended behind the torso, curl forward -- an arms-behind-body position that maximizes the bicep stretch." },
      // -- Accessory: triceps --
      { name: "Cable Overhead Tricep Extension", category: "accessory" as const, muscleGroup: "Triceps", equipment: "Cable", movementType: "Push", laterality: "bilateral" as const, instructions: "Rope attachment overhead, extend both arms forward and down from behind the head -- the overhead position stretches the long head more than a pushdown." },
      { name: "JM Press", category: "accessory" as const, muscleGroup: "Triceps", secondaryMuscles: ["Chest"], equipment: "Barbell", movementType: "Push", laterality: "bilateral" as const, instructions: "A hybrid between a close-grip bench press and a skull crusher -- lower the bar toward the upper chest/chin, elbows tracking forward, then press back up." },
      { name: "Tate Press", category: "accessory" as const, muscleGroup: "Triceps", equipment: "Dumbbell", movementType: "Push", laterality: "bilateral" as const, instructions: "Lying on a bench, lower both dumbbells to the chest with elbows flared out to the sides, then press back up -- a different elbow path than a standard extension." },
      { name: "Close-Grip Push-Up", category: "accessory" as const, muscleGroup: "Triceps", secondaryMuscles: ["Chest"], equipment: "Bodyweight", movementType: "Push", laterality: "bilateral" as const, instructions: "Hands close together under the chest, elbows tracking back along the ribs rather than flaring out, lower and press back up." },
      { name: "Dumbbell Kickback", category: "accessory" as const, muscleGroup: "Triceps", equipment: "Dumbbell", movementType: "Push", laterality: "unilateral" as const, instructions: "Hinge forward with the upper arm parallel to the floor, extend the forearm straight back, squeeze the tricep, control the return." },
      // -- Accessory: legs --
      { name: "Sissy Squat", category: "accessory" as const, muscleGroup: "Quads", equipment: "Bodyweight", movementType: "Squat", laterality: "bilateral" as const, instructions: "Rise onto the toes and lean the torso back as the knees drive forward, lowering under control, then return to standing -- brutal, isolated quad stretch and contraction." },
      { name: "Standing Leg Curl", category: "accessory" as const, muscleGroup: "Hamstrings", equipment: "Machine", movementType: "Pull", laterality: "unilateral" as const, instructions: "Standing at the machine, curl the pad up toward the glute one leg at a time, control the descent." },
      { name: "Seated Leg Curl", category: "accessory" as const, muscleGroup: "Hamstrings", equipment: "Machine", movementType: "Pull", laterality: "bilateral" as const, instructions: "Seated with the pad against the lower calves, curl down and under the seat, control the return." },
      { name: "Single-Leg Leg Extension", category: "accessory" as const, muscleGroup: "Quads", equipment: "Machine", movementType: "Push", laterality: "unilateral" as const, instructions: "One leg at a time, extend the knee against the pad to full lockout, control the descent -- exposes a side-to-side quad strength gap." },
      { name: "Single-Leg Leg Press", category: "accessory" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes"], equipment: "Machine", movementType: "Squat", laterality: "unilateral" as const, instructions: "One foot on the platform, press through the full leg to lockout, control the descent -- unilateral loading on a fixed, supported path." },
      { name: "Cable Kickback", category: "accessory" as const, muscleGroup: "Glutes", equipment: "Cable", movementType: "Pull", laterality: "unilateral" as const, instructions: "Ankle cuff attached to a low cable, kick the leg straight back and squeeze the glute, control the return." },
      { name: "Frog Pump", category: "accessory" as const, muscleGroup: "Glutes", equipment: "Bodyweight", movementType: "Hinge", laterality: "bilateral" as const, instructions: "Lying on the back with the soles of the feet together and knees dropped out wide, drive the hips up squeezing the glutes at the top." },
      { name: "B-Stance Hip Thrust", category: "strength" as const, muscleGroup: "Glutes", secondaryMuscles: ["Hamstrings"], equipment: "Barbell", movementType: "Hinge", laterality: "unilateral" as const, instructions: "Staggered stance with the rear foot up on its toes for balance -- drives most of the load through the front leg without going fully single-leg." },
      { name: "Single-Leg Hip Thrust", category: "accessory" as const, muscleGroup: "Glutes", secondaryMuscles: ["Hamstrings"], equipment: "Bodyweight", movementType: "Hinge", laterality: "unilateral" as const, instructions: "Shoulders on a bench, one foot planted and the other leg extended, drive the hips up through the planted leg." },
      { name: "Banded Glute Bridge", category: "accessory" as const, muscleGroup: "Glutes", equipment: "Band", movementType: "Hinge", laterality: "bilateral" as const, instructions: "Band above the knees, drive the hips up while pressing the knees out against the band -- adds a lateral-glute demand to a plain bridge." },
      { name: "Curtsy Lunge", category: "accessory" as const, muscleGroup: "Glutes", secondaryMuscles: ["Quads", "Adductors"], equipment: "Dumbbell", movementType: "Lunge", laterality: "unilateral" as const, instructions: "Step one leg diagonally back behind the other into a crossover lunge, drive back up through the front leg." },
      { name: "Deficit Reverse Lunge", category: "accessory" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Hamstrings"], equipment: "Dumbbell", movementType: "Lunge", laterality: "unilateral" as const, instructions: "Standing on a small platform, step back into a reverse lunge that reaches below the platform -- the added deficit increases the range of motion." },
      { name: "Step-Up", category: "accessory" as const, muscleGroup: "Quads", secondaryMuscles: ["Glutes", "Hamstrings"], equipment: "Dumbbell", movementType: "Lunge", laterality: "unilateral" as const, instructions: "Drive up through one leg onto a box to full hip extension, control the descent back down -- dumbbell-loaded version for a lighter entry point than barbell step-ups." },
      { name: "Adductor Rock Back", category: "accessory" as const, muscleGroup: "Adductors", equipment: "Bodyweight", movementType: "Activation", laterality: "unilateral" as const, instructions: "Kneeling with one leg extended out to the side, rock the hips back over the extended leg and return -- a controlled adductor activation drill, not a static stretch." },
      // -- Accessory: calves --
      { name: "Donkey Calf Raise", category: "accessory" as const, muscleGroup: "Calves", equipment: "Machine", movementType: "Push", laterality: "bilateral" as const, instructions: "Bent-over on the machine, rise onto the toes through full range, pause at the top, control the stretch at the bottom." },
      { name: "Leg Press Calf Raise", category: "accessory" as const, muscleGroup: "Calves", equipment: "Machine", movementType: "Push", laterality: "bilateral" as const, instructions: "Balls of the feet on the leg press platform, press through the ankles to full extension, control the return to a deep stretch." },
      { name: "Single-Leg Calf Raise", category: "accessory" as const, muscleGroup: "Calves", equipment: "Bodyweight", movementType: "Push", laterality: "unilateral" as const, instructions: "One foot on a step, rise onto the toes through full range, control the descent into a deep stretch below the step." },
      { name: "Seated Dumbbell Calf Raise", category: "accessory" as const, muscleGroup: "Calves", equipment: "Dumbbell", movementType: "Push", laterality: "bilateral" as const, instructions: "Seated with dumbbells resting on the knees, rise onto the toes through full range, control the return -- targets the soleus more than a standing raise." },
      // -- Accessory: core --
      { name: "Dead Bug", category: "accessory" as const, muscleGroup: "Core", equipment: "Bodyweight", movementType: "Activation", laterality: "unilateral" as const, isCorrective: true, instructions: "Lying on the back, extend the opposite arm and leg toward the floor while keeping the low back pressed flat, then reset and switch." },
      { name: "Weighted Sit-Up", category: "accessory" as const, muscleGroup: "Abs", equipment: "Medicine Ball", movementType: "Isometric", laterality: "bilateral" as const, instructions: "Holding a plate or ball to the chest, sit up to full flexion and control the descent back down." },
      { name: "Decline Sit-Up", category: "accessory" as const, muscleGroup: "Abs", equipment: "Bodyweight", movementType: "Isometric", laterality: "bilateral" as const, instructions: "On a decline bench, sit up to full flexion and control the descent -- the decline angle adds resistance beyond a flat sit-up." },
      { name: "Reverse Crunch", category: "accessory" as const, muscleGroup: "Abs", equipment: "Bodyweight", movementType: "Isometric", laterality: "bilateral" as const, instructions: "Lying on the back, curl the hips and knees up toward the chest using the lower abs, not momentum, then control the descent." },
      { name: "Bicycle Crunch", category: "accessory" as const, muscleGroup: "Obliques", equipment: "Bodyweight", movementType: "Rotation", laterality: "unilateral" as const, instructions: "Alternate driving elbow to opposite knee in a pedaling motion, rotating through the torso each rep rather than just the arms." },
      { name: "Landmine 180", category: "accessory" as const, muscleGroup: "Obliques", secondaryMuscles: ["Core", "Shoulders"], equipment: "Landmine", movementType: "Rotation", laterality: "bilateral" as const, instructions: "Hold the landmine sleeve at arm's length, rotate it side to side from vertical down to each hip, pivoting through the torso and hips together." },
      { name: "Hanging Windshield Wiper", category: "accessory" as const, muscleGroup: "Obliques", equipment: "Bodyweight", movementType: "Rotation", laterality: "bilateral" as const, instructions: "Hanging from a bar with legs raised, rotate the legs side to side under control, keeping the shoulders and grip stable." },
      { name: "Stir the Pot", category: "accessory" as const, muscleGroup: "Core", equipment: "Bodyweight", movementType: "Isometric", laterality: "bilateral" as const, instructions: "Forearms on a stability ball in a plank, draw small circles with the elbows while bracing the whole torso against the ball's instability." },
      // -- Accessory: grip/forearm --
      { name: "Farmer's Hold", category: "accessory" as const, muscleGroup: "Forearms", equipment: "Dumbbell", movementType: "Isometric", laterality: "bilateral" as const, instructions: "Hold two heavy dumbbells at the sides for max time, standing tall -- the static grip-endurance version of the farmer's carry." },
      { name: "Plate Pinch Hold", category: "accessory" as const, muscleGroup: "Forearms", equipment: "Plate", movementType: "Isometric", laterality: "bilateral" as const, instructions: "Pinch two smooth-sided plates together between the fingers and thumb, hold for max time without the plates slipping apart." },
      { name: "Wrist Roller", category: "accessory" as const, muscleGroup: "Forearms", equipment: "Plate", movementType: "Pull", laterality: "bilateral" as const, instructions: "Roll a weighted rope up onto a bar by alternating wrist flexion, then reverse to lower it back down under control." },
      { name: "Reverse Barbell Curl", category: "accessory" as const, muscleGroup: "Forearms", secondaryMuscles: ["Biceps"], equipment: "Barbell", movementType: "Pull", laterality: "bilateral" as const, instructions: "Overhand grip, curl the bar to the shoulders -- shifts emphasis onto the forearms and brachialis versus a standard underhand curl." },
      { name: "Behind-the-Back Wrist Curl", category: "accessory" as const, muscleGroup: "Forearms", equipment: "Barbell", movementType: "Pull", laterality: "bilateral" as const, instructions: "Bar held behind the back at arm's length, curl the wrists up and let them extend down under control -- direct forearm-flexor isolation." },

      // -- Conditioning --
      { name: "Sled Backward Drag", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Quads", "Hamstrings"], equipment: "Sled", movementType: "Carry", laterality: "bilateral" as const, instructions: "Facing the sled, walk backward dragging it toward you in a low athletic stance -- knee-friendly quad and hamstring conditioning work." },
      { name: "Sled Sprint", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Quads", "Glutes", "Calves"], equipment: "Sled", movementType: "Carry", laterality: "bilateral" as const, sports: ["Football", "Track & Field", "Rugby"], instructions: "Sprint forward against the sled's resistance, staying low and driving hard through each step for the full distance." },
      { name: "Sled Row", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Back", "Biceps"], equipment: "Sled", movementType: "Pull", laterality: "bilateral" as const, instructions: "Facing the sled with the straps in hand, drop into a low stance and row hand-over-hand to pull the sled in." },
      { name: "Tire Flip", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Quads", "Back", "Glutes"], equipment: "Tire", movementType: "Hinge", laterality: "bilateral" as const, instructions: "Hinge down, drive the tire up off the ground, then push through underneath it to flip it forward." },
      { name: "Sandbag Clean", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Back", "Glutes", "Hamstrings"], equipment: "Sandbag", movementType: "Pull", laterality: "bilateral" as const, instructions: "Pull the sandbag from the floor and catch it at the shoulders in one motion -- the shifting load makes this harder to time than a barbell clean." },
      { name: "Sandbag Carry", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Core", "Forearms"], equipment: "Sandbag", movementType: "Carry", laterality: "bilateral" as const, instructions: "Carry the sandbag against the chest or on one shoulder for a set distance, bracing against its constant shifting weight." },
      { name: "Sandbag Get-Up", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Core", "Shoulders", "Glutes"], equipment: "Sandbag", movementType: "Isometric", laterality: "unilateral" as const, instructions: "From lying on the ground with the sandbag held at the chest, stand up through a half-kneeling position while keeping the bag controlled." },
      { name: "Battle Rope Alternating Waves", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Shoulders", "Core"], equipment: "Battle Rope", movementType: "Activation", laterality: "bilateral" as const, instructions: "Alternate slamming each rope end down as fast as possible while holding a low athletic stance for the full interval." },
      { name: "Battle Rope Slams", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Shoulders", "Core"], equipment: "Battle Rope", movementType: "Activation", laterality: "bilateral" as const, instructions: "Raise both rope ends overhead and slam them down together as hard as possible, resetting quickly for the next rep." },
      { name: "Battle Rope Circles", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Shoulders", "Core"], equipment: "Battle Rope", movementType: "Activation", laterality: "bilateral" as const, instructions: "Trace large circles with both rope ends simultaneously, keeping continuous tension through the whole interval." },
      { name: "Wall Ball to Squat Jump", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Quads", "Shoulders", "Core"], equipment: "Medicine Ball", movementType: "Combination", laterality: "bilateral" as const, instructions: "Squat and throw the ball to a target overhead, then immediately squat jump on the catch before the next rep -- a squat, throw, and jump chained into one rep." },
      { name: "Devil Press", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Shoulders", "Quads", "Back"], equipment: "Dumbbell", movementType: "Combination", laterality: "bilateral" as const, instructions: "Burpee down to both dumbbells, then snatch them overhead as you stand -- a burpee and a double dumbbell snatch chained into one continuous rep." },
      { name: "Renegade Row to Burpee", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Back", "Core", "Quads"], equipment: "Dumbbell", movementType: "Combination", laterality: "unilateral" as const, instructions: "Row each dumbbell once from a plank, then chest-to-ground burpee and stand -- a row and a burpee chained into one rep." },
      { name: "Bear Crawl to Broad Jump", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Quads", "Shoulders", "Core"], equipment: "Bodyweight", movementType: "Combination", laterality: "bilateral" as const, instructions: "Bear crawl a set distance, then finish with a max-effort broad jump -- crawling conditioning chained straight into a power output test." },
      { name: "Kettlebell Snatch", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Shoulders", "Back", "Glutes"], equipment: "Kettlebell", movementType: "Pull", laterality: "unilateral" as const, sports: ["Wrestling", "MMA"], instructions: "Hike the bell back, then pull and punch the hand through to lock it out overhead in one continuous swing." },
      { name: "Kettlebell Clean", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Shoulders", "Back"], equipment: "Kettlebell", movementType: "Pull", laterality: "unilateral" as const, instructions: "Hike the bell back, then pull it into the rack position at the shoulder, keeping the wrist relaxed to avoid banging the forearm." },
      { name: "Kettlebell Around-the-World", category: "conditioning" as const, muscleGroup: "Core", equipment: "Kettlebell", movementType: "Rotation", laterality: "bilateral" as const, instructions: "Pass the kettlebell around the waist hand to hand in a continuous circle, keeping the torso braced." },
      { name: "Farmer's Carry Shuttle", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Forearms", "Core"], equipment: "Dumbbell", movementType: "Carry", laterality: "bilateral" as const, instructions: "Carry a heavy dumbbell in each hand at a fast walk or jog between two set points, dropping and resetting each shuttle." },
      { name: "Assault Bike Sprint", category: "conditioning" as const, muscleGroup: "Full Body", equipment: "Assault Bike", movementType: "Activation", laterality: "bilateral" as const, instructions: "All-out effort on the assault bike for the prescribed interval, driving both arms and legs together." },
      { name: "Ski Erg Intervals", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Back", "Shoulders", "Triceps"], equipment: "Ski Erg", movementType: "Pull", laterality: "bilateral" as const, instructions: "Drive both handles down and back using the hips and lats, not just the arms, for the prescribed work interval." },
      { name: "Prowler Push", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Quads", "Glutes"], equipment: "Sled", movementType: "Push", laterality: "bilateral" as const, sports: ["Football", "Rugby"], instructions: "Low, driving stance, push the loaded sled forward for the full distance without standing up out of the drive position." },
      { name: "Suicide Sprints", category: "conditioning" as const, muscleGroup: "Full Body", equipment: "Bodyweight", movementType: "Activation", laterality: "bilateral" as const, sports: ["Basketball", "Football", "Soccer"], instructions: "Sprint to each marked line and back to the start in sequence, touching the line each time before turning." },
      { name: "Ladder Drill", category: "conditioning" as const, muscleGroup: "Full Body", secondaryMuscles: ["Calves", "Quads"], equipment: "Agility Ladder", movementType: "Activation", laterality: "bilateral" as const, instructions: "Run the prescribed footwork pattern through the agility ladder, staying light and quick on the balls of the feet." },
      { name: "Cone Shuttle Drill", category: "conditioning" as const, muscleGroup: "Full Body", equipment: "Cones", movementType: "Activation", laterality: "bilateral" as const, instructions: "Sprint and change direction between the cones in the prescribed pattern, decelerating under control at each cut." },

      // -- Mobility --
      { name: "Thoracic Extension over Foam Roller", category: "mobility" as const, muscleGroup: "Back", equipment: "Foam Roller", movementType: "Mobility", laterality: "bilateral" as const, instructions: "Roller placed under the mid-back, hands behind the head, extend back over the roller and return -- targets thoracic extension, not the lumbar spine." },
      { name: "Pigeon Stretch", category: "mobility" as const, muscleGroup: "Hip Flexors", secondaryMuscles: ["Glutes"], equipment: "Bodyweight", movementType: "Mobility", laterality: "unilateral" as const, instructions: "Front shin angled across the body, back leg extended straight behind, sink the hips down and hold." },
      { name: "90/90 Stretch", category: "mobility" as const, muscleGroup: "Hip Flexors", secondaryMuscles: ["Glutes", "Adductors"], equipment: "Bodyweight", movementType: "Mobility", laterality: "unilateral" as const, instructions: "Seated with both legs at 90 degrees, front and back, lean the torso over the front shin and hold." },
      { name: "Ankle CARs", category: "mobility" as const, muscleGroup: "Ankle", equipment: "Bodyweight", movementType: "Mobility", laterality: "unilateral" as const, instructions: "Slowly circle the ankle through its full available range in each direction, staying in control the entire way around." },
      { name: "Hip CARs", category: "mobility" as const, muscleGroup: "Hip Flexors", equipment: "Bodyweight", movementType: "Mobility", laterality: "unilateral" as const, instructions: "Standing tall, slowly circle one knee through its full available hip range in each direction, keeping the torso still." },
      { name: "Shoulder CARs", category: "mobility" as const, muscleGroup: "Shoulders", equipment: "Bodyweight", movementType: "Mobility", laterality: "unilateral" as const, instructions: "Slowly circle one arm through its full available shoulder range, keeping the torso still and the movement controlled throughout." },
      { name: "Deep Squat Hold", category: "mobility" as const, muscleGroup: "Hip Flexors", secondaryMuscles: ["Quads", "Adductors", "Ankle"], equipment: "Bodyweight", movementType: "Mobility", laterality: "bilateral" as const, instructions: "Sink into the deepest comfortable squat, heels down, and hold, using the elbows to gently press the knees out if needed." },
      { name: "Kneeling Hip Flexor Stretch", category: "mobility" as const, muscleGroup: "Hip Flexors", secondaryMuscles: ["Quads"], equipment: "Bodyweight", movementType: "Mobility", laterality: "unilateral" as const, instructions: "Half-kneeling, tuck the pelvis under and shift the hips forward until a stretch is felt down the front of the rear hip." },
      { name: "Bretzel Stretch", category: "mobility" as const, muscleGroup: "Back", secondaryMuscles: ["Hip Flexors", "Chest"], equipment: "Bodyweight", movementType: "Mobility", laterality: "unilateral" as const, instructions: "Side-lying with one knee pulled to the chest and the other pulled behind, rotate the top arm and torso open toward the floor behind you." },
      { name: "Jefferson Curl", category: "mobility" as const, muscleGroup: "Lower Back", secondaryMuscles: ["Hamstrings"], equipment: "Barbell", movementType: "Mobility", laterality: "bilateral" as const, instructions: "Standing on a box with a light bar or plate, roll down one vertebra at a time to full flexion, then reverse the roll back up." },
      { name: "Spiderman Stretch", category: "mobility" as const, muscleGroup: "Hip Flexors", secondaryMuscles: ["Adductors", "Chest"], equipment: "Bodyweight", movementType: "Mobility", laterality: "unilateral" as const, instructions: "From a lunge position, plant both hands inside the front foot and drop the hips low, rotating the same-side elbow toward the sky." },
      { name: "Lizard Stretch", category: "mobility" as const, muscleGroup: "Hip Flexors", secondaryMuscles: ["Adductors"], equipment: "Bodyweight", movementType: "Mobility", laterality: "unilateral" as const, instructions: "From a low lunge with both hands inside the front foot, lower onto the forearms and hold, sinking the hips deeper." },
      { name: "Seated Straddle Stretch", category: "mobility" as const, muscleGroup: "Adductors", secondaryMuscles: ["Hamstrings"], equipment: "Bodyweight", movementType: "Mobility", laterality: "bilateral" as const, instructions: "Seated with legs spread wide, hinge forward from the hips keeping the back flat and reach toward the floor." },
      { name: "Standing Quad Stretch", category: "mobility" as const, muscleGroup: "Quads", equipment: "Bodyweight", movementType: "Mobility", laterality: "unilateral" as const, instructions: "Pull one heel toward the glute, keeping the knees together and hips square, and hold." },
      { name: "Doorway Chest Stretch", category: "mobility" as const, muscleGroup: "Chest", secondaryMuscles: ["Shoulders"], equipment: "Bodyweight", movementType: "Mobility", laterality: "bilateral" as const, instructions: "Forearms on a doorframe at shoulder height, step forward through the doorway until a stretch is felt across the chest." },
      { name: "Cross-Body Shoulder Stretch", category: "mobility" as const, muscleGroup: "Shoulders", equipment: "Bodyweight", movementType: "Mobility", laterality: "unilateral" as const, instructions: "Pull one straight arm across the chest with the opposite hand or forearm, and hold." },
      { name: "Child's Pose", category: "mobility" as const, muscleGroup: "Lower Back", secondaryMuscles: ["Shoulders", "Hip Flexors"], equipment: "Bodyweight", movementType: "Mobility", laterality: "bilateral" as const, instructions: "Kneeling, sit back onto the heels and reach both arms forward along the floor, letting the low back and shoulders release." },
      { name: "Downward Dog", category: "mobility" as const, muscleGroup: "Shoulders", secondaryMuscles: ["Hamstrings", "Calves", "Back"], equipment: "Bodyweight", movementType: "Mobility", laterality: "bilateral" as const, instructions: "Hands and feet on the floor, hips lifted high into an inverted V, pressing the heels toward the floor and the chest toward the thighs." },
      { name: "Thread the Needle", category: "mobility" as const, muscleGroup: "Back", secondaryMuscles: ["Shoulders"], equipment: "Bodyweight", movementType: "Mobility", laterality: "unilateral" as const, instructions: "From all fours, thread one arm under the body and through to the opposite side, rotating through the upper back, then return." },
      { name: "Supine Windshield Wipers", category: "mobility" as const, muscleGroup: "Obliques", secondaryMuscles: ["Core", "Hip Flexors"], equipment: "Bodyweight", movementType: "Mobility", laterality: "bilateral" as const, instructions: "Lying on the back with knees bent and lifted, rock both knees side to side under control, keeping the shoulders flat." },
      { name: "Ankle Circles", category: "mobility" as const, muscleGroup: "Ankle", equipment: "Bodyweight", movementType: "Mobility", laterality: "unilateral" as const, instructions: "Lift one foot off the floor and slowly circle the ankle through its full range in each direction." },
      { name: "Hip Flexor Rock", category: "mobility" as const, muscleGroup: "Hip Flexors", equipment: "Bodyweight", movementType: "Activation", laterality: "unilateral" as const, instructions: "Half-kneeling with the pelvis tucked, gently rock forward and back to actively pump the hip flexor stretch rather than holding it static." },
      { name: "Prone Press-Up", category: "mobility" as const, muscleGroup: "Lower Back", equipment: "Bodyweight", movementType: "Mobility", laterality: "bilateral" as const, instructions: "Lying face down, press the upper body up through the arms while letting the hips stay on the floor, extending through the low back." },
    ];
    for (const ex of expansionExercises) {
      if (existingExerciseNames.has(ex.name)) continue;
      const row = await storage.createExercise(coach.id, {
        ...ex,
        videoUrl: videoSearchUrl(ex.name),
      });
      exerciseMap[ex.name] = row.id;
    }

    // One-time backfill for exercises that already existed before the
    // materials columns were added -- only touches rows still at the
    // just-added default (usesWeight true, everything else false), so it
    // can never clobber a coach's own edit to these fields after the fact.
    for (const existingEx of await storage.getAllExercises()) {
      const untouched =
        existingEx.usesWeight === true &&
        !existingEx.usesBodyweight &&
        !existingEx.usesBand &&
        !existingEx.usesBox;
      if (!untouched) continue;
      const derived = deriveMaterials(existingEx.equipment, existingEx.name);
      const alreadyCorrect =
        existingEx.usesWeight === derived.usesWeight &&
        existingEx.usesBodyweight === derived.usesBodyweight &&
        existingEx.usesBand === derived.usesBand &&
        existingEx.usesBox === derived.usesBox;
      if (alreadyCorrect) continue;
      await storage.updateExercise(existingEx.id, derived);
    }

    // One-time backfill for exercises that already existed before
    // secondaryMuscles was added -- the insert loop above only creates
    // exercises missing by name, so an already-seeded row never picks up a
    // field added to its seedExercises entry after the fact without this.
    // Only touches rows still at null (never set), so a coach's own edit
    // (including deliberately clearing it back to nothing) is never
    // overwritten by a later reseed.
    const seedSecondaryByName = new Map(
      seedExercises
        .filter((ex) => ex.secondaryMuscles && ex.secondaryMuscles.length > 0)
        .map((ex) => [ex.name, ex.secondaryMuscles as string[]]),
    );
    for (const existingEx of await storage.getAllExercises()) {
      if (existingEx.secondaryMuscles) continue;
      const secondary = seedSecondaryByName.get(existingEx.name);
      if (!secondary) continue;
      await storage.updateExercise(existingEx.id, { secondaryMuscles: secondary });
    }

    // One-time backfill for exercises that already existed before sports
    // tags were added, or whose seed entry has since had more sports added
    // to it (e.g. an exercise tagged for baseball earlier also picking up a
    // combat-sports tag later) -- same "insert loop only creates
    // missing-by-name rows" gap as secondaryMuscles above, but unlike that
    // null-checked backfill this one unions in any seed-declared sport not
    // already on the row, rather than skipping once anything is set. Only
    // ever adds tags, never removes one, so it can't undo a deliberate
    // removal -- safe here because the shared Forge-official library is
    // admin-only editable (see transferExerciseOwnership below), not
    // something individual coaches can customize per-row.
    const seedSportsByName = new Map(
      seedExercises
        .filter((ex) => ex.sports && ex.sports.length > 0)
        .map((ex) => [ex.name, ex.sports as string[]]),
    );
    for (const existingEx of await storage.getAllExercises()) {
      const seedSports = seedSportsByName.get(existingEx.name);
      if (!seedSports) continue;
      const current = existingEx.sports ?? [];
      const missing = seedSports.filter((s) => !current.includes(s));
      if (missing.length === 0) continue;
      await storage.updateExercise(existingEx.id, { sports: [...current, ...missing] });
    }

    // One-time backfill for exercises that already existed before the
    // insert loop above started setting videoUrl -- same "insert loop only
    // creates missing-by-name rows" gap as secondaryMuscles above, and the
    // reason some exercises (e.g. Incline Barbell Bench Press) never got a
    // video link even though newer ones do. Only touches rows still at
    // null, so a coach's own edit is never overwritten by a later reseed.
    for (const existingEx of await storage.getAllExercises()) {
      if (existingEx.videoUrl) continue;
      await storage.updateExercise(existingEx.id, { videoUrl: videoSearchUrl(existingEx.name) });
    }

    // One-time backfill for exercises that already existed before this PT
    // audit flagged them as correctives (e.g. Side Plank/Face Pull/Nordic
    // Hamstring Curl were always legitimate corrective work, just never
    // tagged, so they were invisible to the dedicated "Add Corrective"
    // picker). Unlike the null-checked backfills above, isCorrective is a
    // boolean with no "untouched" state to detect -- this only ever flips
    // false to true, never true to false, so a coach who deliberately
    // un-flagged one of these names keeps that decision reverted on the
    // next reseed. Acceptable here since the shared exercise library is
    // admin-only editable (see transferExerciseOwnership below), not
    // something individual coaches can toggle.
    const seedCorrectiveNames = new Set(
      seedExercises.filter((ex) => ex.isCorrective).map((ex) => ex.name),
    );
    for (const existingEx of await storage.getAllExercises()) {
      if (existingEx.isCorrective) continue;
      if (!seedCorrectiveNames.has(existingEx.name)) continue;
      await storage.updateExercise(existingEx.id, { isCorrective: true });
    }

    // Video-check eligibility default: which exercises a coach can turn
    // video/motion tracking on for (see VideoTrackingToggle client-side).
    // Storage cost scales with how many DISTINCT exercises this is true
    // for, not with library size (see the video-retention cost model), so
    // this stays a curated "canonical main lift" set rather than every
    // squat/press/row variant the library carries.
    //
    // Only ~15% of these are ANY named variant of a pattern -- Olympic
    // lifts are the one exception kept in full: each is a genuinely
    // distinct skill (Power Clean vs. Hang Clean vs. Split Jerk), not
    // alternate versions of the same movement the way bench-press variants
    // (Board Press, Spoto Press, Larsen Press...) are of Bench Press.
    const CANONICAL_VIDEO_ELIGIBLE_NAMES = new Set([
      // Strength -- the canonical version of each main-lift pattern only
      "Back Squat", "Front Squat", "Box Squat", "Goblet Squat", "Trap Bar Squat",
      "Deadlift", "Romanian Deadlift", "Sumo Deadlift", "Hex Bar Deadlift", "Hip Thrust",
      "Overhead Press", "Push Press", "Dumbbell Shoulder Press", "Arnold Press",
      "Bench Press", "Incline Barbell Bench Press", "Close-Grip Bench Press", "Dumbbell Bench Press",
      "Bent-Over Row", "T-Bar Row", "Single-Arm Dumbbell Row", "Pendlay Row",
      // Olympic -- every lift
      "Block Clean", "Block Snatch", "Clean & Jerk", "Clean High Pull", "Clean Pull",
      "Hang Clean", "Hang Power Clean", "Hang Power Snatch", "Hang Snatch", "Jerk Balance",
      "Muscle Clean", "Muscle Snatch", "Overhead Squat", "Pause Clean", "Power Clean",
      "Power Snatch", "Push Jerk", "Snatch", "Snatch Balance", "Snatch Pull",
      "Snatch-Grip High Pull", "Split Jerk", "Tall Clean", "Tall Snatch",
      // Plyometric -- the standard, most commonly programmed ones
      "Box Jump", "Broad Jump", "Depth Jump", "Countermovement Jump",
      "Squat Jump", "Tuck Jump", "Standing Long Jump", "Lateral Bound",
    ]);
    const videoRestrictedNames = new Set(
      [...seedExercises, ...combinationExercises, ...expansionExercises]
        .map((ex) => ex.name)
        .filter((name) => !CANONICAL_VIDEO_ELIGIBLE_NAMES.has(name)),
    );
    let videoRestricted = 0;
    for (const existingEx of await storage.getAllExercises()) {
      // Nullable, not boolean-default -- see the column's own comment in
      // shared/schema.ts. Only ever touches a row still at null, so an
      // admin's explicit edit (in either direction) always wins over a
      // future reseed, same posture as isCorrective/sports above.
      if (existingEx.videoEligible !== null) continue;
      if (!videoRestrictedNames.has(existingEx.name)) continue;
      await storage.updateExercise(existingEx.id, { videoEligible: false });
      videoRestricted++;
    }
    if (videoRestricted > 0) {
      console.log(`Set videoEligible=false on ${videoRestricted} exercise(s) outside the canonical main-lift list.`);
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

  // Skills system: seed the Forge official Skill Bank with real
  // baseball/softball drills across all six skill-taxonomy categories (see
  // SKILL_TYPES in client/src/lib/skill-taxonomy.ts). Unlike the strength
  // exercise library above, there's no legacy "seeded under the demo coach,
  // transferred later" history to replicate -- these go straight to
  // whichever admin currently owns the official Forge library
  // (scott.morrow@live.com in production, the demo admin locally) so every
  // coach sees them immediately via getVisibleSkillExercisesForCoach's
  // admin-ownership union.
  {
    const skillLibraryOwner = scott ?? demoAdmin;
    const allSkillExercises = await storage.getAllSkillExercises();
    const existingSkillNames = new Set(allSkillExercises.map((e) => e.name));

    const seedSkillDrills: Array<{
      name: string;
      skillType: string;
      equipment: string[];
      instructions: string;
    }> = [
      // Hitting
      {
        name: "Tee Work - Inside Pitch",
        skillType: "Hitting",
        equipment: ["Batting Tee", "Balls"],
        instructions:
          "Set the tee on the inside third of the plate and work on keeping the barrel inside the ball, driving it to the pull side.",
      },
      {
        name: "Tee Work - Outside Pitch",
        skillType: "Hitting",
        equipment: ["Batting Tee", "Balls"],
        instructions:
          "Set the tee on the outside third and practice staying back to drive the ball the other way without pulling off.",
      },
      {
        name: "Front Toss",
        skillType: "Hitting",
        equipment: ["Screen", "Balls"],
        instructions:
          "Coach flips underhand from the side behind an L-screen; focus on timing the load to the toss.",
      },
      {
        name: "Soft Toss",
        skillType: "Hitting",
        equipment: ["Balls", "Net"],
        instructions:
          "Partner tosses from a 45-degree angle into a net; work on a short, direct path to contact.",
      },
      {
        name: "Live Batting Practice",
        skillType: "Hitting",
        equipment: ["Bat", "Balls", "Screen"],
        instructions:
          "Full-speed pitches from a mound or machine; track pitch recognition and apply game-speed timing.",
      },
      {
        name: "One-Hand Drill",
        skillType: "Hitting",
        equipment: ["Bat", "Tee"],
        instructions:
          "Hit off a tee using only the top hand to isolate and strengthen the direction of the swing path.",
      },
      {
        name: "Walk-Up Swing Drill",
        skillType: "Hitting",
        equipment: ["Bat", "Tee or Toss"],
        instructions:
          "Start with feet together, stride into the box as the ball is delivered to build a rhythmic load and stride.",
      },
      {
        name: "Load and Stride Drill",
        skillType: "Hitting",
        equipment: ["Bat"],
        instructions:
          "Shadow-swing focusing on a controlled weight shift back before striding forward, no ball.",
      },
      {
        name: "Two-Strike Approach Drill",
        skillType: "Hitting",
        equipment: ["Bat", "Balls", "Screen"],
        instructions:
          "Simulate two-strike counts, choking up and shortening the swing to protect the plate.",
      },
      {
        name: "Opposite Field Hitting Drill",
        skillType: "Hitting",
        equipment: ["Bat", "Balls", "Tee or Toss"],
        instructions: "Work pitches on the outer half specifically to drive the ball the opposite way.",
      },
      {
        name: "High Tee Drill (Top Hand Path)",
        skillType: "Hitting",
        equipment: ["Tee (raised)", "Balls"],
        instructions:
          "Set the tee at chest height to train the top hand's path staying above the ball into contact.",
      },
      {
        name: "Bunt Placement Drill",
        skillType: "Hitting",
        equipment: ["Bat", "Balls", "Cones"],
        instructions: "Square around early and practice directing bunts to marked zones down each baseline.",
      },
      {
        name: "Overload/Underload Bat Drill",
        skillType: "Hitting",
        equipment: ["Weighted Bats"],
        instructions: "Alternate swings with a heavier and lighter bat to build bat speed through contrast training.",
      },
      {
        name: "Contact Point Drill",
        skillType: "Hitting",
        equipment: ["Tee", "Balls", "Cones"],
        instructions:
          "Move the tee to different contact points (front hip, middle, deep) to feel how location changes the swing.",
      },
      // Athletic position / movement prep (American Hitting Ch. 2)
      {
        name: "Athletic Stance Hold",
        skillType: "Hitting",
        equipment: ["None"],
        instructions:
          "Set up in an athletic hitting stance -- weight balanced over both feet, knees softly flexed, hands relaxed, eyes level -- and hold for 10-15 seconds, checking that balance stays centered rather than drifting onto the heels or toes.",
      },
      {
        name: "Stance-to-Load Walkthrough",
        skillType: "Hitting",
        equipment: ["Bat"],
        instructions:
          "Walk through the move from a static stance into the load position in slow motion, feeling weight shift onto the back side without losing head position or upper-body posture.",
      },
      {
        name: "Ground Force Hop-to-Stance Drill",
        skillType: "Hitting",
        equipment: ["None"],
        instructions:
          "Perform a small two-foot hop and stick the landing directly into an athletic hitting stance, training the body to feel the ground push back rather than sink passively into it.",
      },
      {
        name: "Posture Line Drill",
        skillType: "Hitting",
        equipment: ["Mirror or Phone Camera"],
        instructions:
          "Set up in the stance and check that the spine angle from head through hips stays consistent from setup through the load, using video or a mirror for instant feedback.",
      },
      // Pitch recognition (American Hitting Ch. 3)
      {
        name: "Colored-Ball Recognition Drill",
        skillType: "Hitting",
        equipment: ["Colored Training Balls", "Tee or Toss"],
        instructions:
          "Coach mixes different colored balls into toss or front-toss work and calls for the color after each swing, forcing the hitter to actually track and identify the ball instead of just reacting to motion.",
      },
      {
        name: "Front Toss Recognition Drill",
        skillType: "Hitting",
        equipment: ["Screen", "Balls"],
        instructions:
          "From a short front-toss distance, the coach mixes locations without warning; the hitter calls out \"in\" or \"away\" as the pitch is released, before deciding whether to swing.",
      },
      {
        name: "Velocity Variation Round",
        skillType: "Hitting",
        equipment: ["Machine or Coach Arm", "Balls"],
        instructions:
          "Coach or machine randomly changes speed between pitches within a round, training the hitter's eyes and rhythm to adjust to velocity changes rather than lock into one fixed tempo.",
      },
      {
        name: "Take/Swing Decision Drill",
        skillType: "Hitting",
        equipment: ["Balls", "Screen"],
        instructions:
          "Hitter loads on every pitch but only swings at balls in a defined zone, calling \"take\" out loud on pitches left alone to reinforce plate discipline under real timing pressure.",
      },
      {
        name: "Ball/Strike Recognition Drill",
        skillType: "Hitting",
        equipment: ["Balls", "Screen or Machine"],
        instructions:
          "Pitches are thrown at or near the edges of the zone; the hitter calls ball or strike before the pitch reaches the plate, training early recognition independent of swinging.",
      },
      // Timing, rhythm & swing tempo (American Hitting Ch. 4)
      {
        name: "Pause-and-Go Load Drill",
        skillType: "Hitting",
        equipment: ["Bat", "Tee or Toss"],
        instructions:
          "Hitter pauses briefly at the top of the load before continuing into the swing, isolating the rhythm that connects the load to the launch.",
      },
      {
        name: "Timing-Window Toss Drill",
        skillType: "Hitting",
        equipment: ["Balls", "Net"],
        instructions:
          "Partner tosses on an irregular count instead of a fixed rhythm, so the hitter has to trigger their load off the toss itself rather than a memorized beat.",
      },
      {
        name: "Rhythm-to-Launch Drill",
        skillType: "Hitting",
        equipment: ["Bat"],
        instructions:
          "Shadow-swing while counting the rhythm out loud through the load and into the swing to build a repeatable internal tempo.",
      },
      {
        name: "Variable-Speed Batting Practice",
        skillType: "Hitting",
        equipment: ["Machine or Coach Arm", "Balls"],
        instructions:
          "Round of batting practice where pitch speed changes every 2-3 pitches without announcement, forcing late timing adjustments instead of pre-set timing.",
      },
      {
        name: "Two-Speed Front Toss Drill",
        skillType: "Hitting",
        equipment: ["Screen", "Balls"],
        instructions:
          "Coach alternates a slow toss and a quick toss back to back so the hitter has to feel the difference in how early or late their load needs to start.",
      },
      // Creating power athletically (American Hitting Ch. 5)
      {
        name: "Rotational Med Ball Scoop Throw",
        skillType: "Hitting",
        equipment: ["Medicine Ball"],
        instructions:
          "From an athletic hitting stance, load and rotate to throw the medicine ball out in front like a swing, training hip-to-hand sequencing.",
      },
      {
        name: "Standing Rotational Med Ball Throw",
        skillType: "Hitting",
        equipment: ["Medicine Ball", "Wall or Partner"],
        instructions:
          "Facing a wall or partner, rotate the hips first and let the throw follow, emphasizing that the lower half initiates the movement before the hands and arms.",
      },
      {
        name: "Resisted Rotation Drill",
        skillType: "Hitting",
        equipment: ["Resistance Band", "Anchor Point"],
        instructions:
          "Anchor a band at hip height behind the hitter and swing against the resistance to train explosive hip rotation strength through the swing path.",
      },
      {
        name: "Bat Speed Overload/Underload Rounds",
        skillType: "Hitting",
        equipment: ["Weighted Bats", "Standard Bat"],
        instructions:
          "Alternate sets of swings between a heavier and lighter bat, then a standard bat, to train the nervous system to produce more bat speed through contrast.",
      },
      {
        name: "Max-Intent Tee Rounds",
        skillType: "Hitting",
        equipment: ["Tee", "Balls"],
        instructions:
          "Take a set number of swings off the tee at full, competitive effort, focusing on the fastest controlled bat speed rather than mechanics, then rest and repeat.",
      },
      // Adjustability & off-speed hitting (American Hitting Ch. 7)
      {
        name: "Fastball/Changeup Recognition Rounds",
        skillType: "Hitting",
        equipment: ["Balls", "Screen or Machine"],
        instructions:
          "Coach mixes fastballs and changeups (same arm speed, different velocity) without pattern; hitter stays back and lets the ball travel before committing.",
      },
      {
        name: "Random Pitch Sequence Drill",
        skillType: "Hitting",
        equipment: ["Balls", "Screen or Machine"],
        instructions:
          "Coach throws random combinations of pitch types and locations in no set order across a round to simulate the unpredictability of a real at-bat.",
      },
      {
        name: "Breaking Ball Recognition Drill",
        skillType: "Hitting",
        equipment: ["Balls", "Screen or Machine"],
        instructions:
          "Coach mixes in pitches that break or change plane; the hitter tracks spin and trajectory out of the hand and calls \"breaking ball\" before deciding to swing.",
      },
      {
        name: "Competitive At-Bat Simulation",
        skillType: "Hitting",
        equipment: ["Balls", "Screen or Machine"],
        instructions:
          "Live simulated at-bats where the hitter reacts to an unknown sequence of pitch types thrown in random order, with each at-bat scored as a competitive result -- good decision, hit, or miss.",
      },
      // Fielding
      {
        name: "Short Hop Fielding Drill",
        skillType: "Fielding",
        equipment: ["Glove", "Balls"],
        instructions:
          "Partner throws or rolls balls that bounce just in front of the glove; work on soft hands absorbing the short hop.",
      },
      {
        name: "Backhand Fielding Drill",
        skillType: "Fielding",
        equipment: ["Glove", "Balls"],
        instructions: "Field ground balls hit to the backhand side, working on footwork to get the glove out in front.",
      },
      {
        name: "Forehand Fielding Drill",
        skillType: "Fielding",
        equipment: ["Glove", "Balls"],
        instructions: "Field balls hit to the glove side, staying low and funneling the ball to the center of the body.",
      },
      {
        name: "Barehand Charge Drill",
        skillType: "Fielding",
        equipment: ["Balls (no glove)"],
        instructions:
          "Charge slow rollers and field them barehand, fielding off the glove-side foot for a quick transfer and throw.",
      },
      {
        name: "Double Play Turn Drill",
        skillType: "Fielding",
        equipment: ["Glove", "Balls", "Bases"],
        instructions: "Practice receiving a feed at second base and completing the pivot and throw to first.",
      },
      {
        name: "First Base Scoop Drill",
        skillType: "Fielding",
        equipment: ["Glove", "Balls"],
        instructions:
          "Practice scooping short-hop and in-the-dirt throws at first base, working footwork to stay on the bag.",
      },
      {
        name: "Pop Fly Communication Drill",
        skillType: "Fielding",
        equipment: ["Glove", "Balls"],
        instructions: "Two or more fielders call loudly for a fly ball to practice communication and avoid collisions.",
      },
      {
        name: "Slow Roller Drill",
        skillType: "Fielding",
        equipment: ["Glove", "Balls"],
        instructions: "Charge a slow-hit ground ball, field it on the move, and make an accurate off-balance throw.",
      },
      {
        name: "Bunt Fielding Drill",
        skillType: "Fielding",
        equipment: ["Glove", "Balls"],
        instructions:
          "Infielders and pitchers practice charging bunts, barehanding, and making a quick throw to the correct base.",
      },
      {
        name: "Wall Ball Reaction Drill",
        skillType: "Fielding",
        equipment: ["Wall", "Ball"],
        instructions: "Throw the ball against a wall at varying angles and speeds to react and field quick rebounds.",
      },
      {
        name: "Ground Ball Angles Drill",
        skillType: "Fielding",
        equipment: ["Glove", "Balls", "Cones"],
        instructions: "Field ground balls from varied angles to train proper angle of approach and shuffle-step positioning.",
      },
      {
        name: "Diving Drill (Lateral Range)",
        skillType: "Fielding",
        equipment: ["Glove", "Balls", "Mats"],
        instructions:
          "Roll or hit balls just out of reach to either side, working the extension dive and quick recovery to a knee.",
      },
      {
        name: "Glove-to-Hand Transfer Drill",
        skillType: "Fielding",
        equipment: ["Glove", "Balls"],
        instructions: "Field a ball and practice a rapid, clean transfer from glove to throwing hand without wasted motion.",
      },
      // Throwing
      {
        name: "Long Toss Progression",
        skillType: "Throwing",
        equipment: ["Balls", "Open Field"],
        instructions:
          "Gradually increase throwing distance with an arc, then work back down with a flatter, more direct throw.",
      },
      {
        name: "Crow Hop Throwing Drill",
        skillType: "Throwing",
        equipment: ["Balls"],
        instructions:
          "Practice the crow-hop footwork pattern (skip-step into throw) to generate momentum on outfield throws.",
      },
      {
        name: "Rapid Fire Throws",
        skillType: "Throwing",
        equipment: ["Balls", "Partner"],
        instructions: "Two partners throw back and forth quickly at short distance to build quick hands and a fast release.",
      },
      {
        name: "One-Knee Throwing Drill",
        skillType: "Throwing",
        equipment: ["Balls", "Partner"],
        instructions:
          "Throw from a kneeling position to isolate the arm path and upper body mechanics without the lower half.",
      },
      {
        name: "Wall Throw Drill",
        skillType: "Throwing",
        equipment: ["Ball", "Wall"],
        instructions: "Throw against a wall and field the rebound solo to repeat proper arm mechanics at high volume.",
      },
      {
        name: "Quick Release Drill",
        skillType: "Throwing",
        equipment: ["Balls", "Partner"],
        instructions: "Emphasize getting rid of the ball as fast as possible after the catch, minimizing extra glove movement.",
      },
      {
        name: "Turn and Burn Drill (Outfield)",
        skillType: "Throwing",
        equipment: ["Balls"],
        instructions: "Outfielder fields the ball on the run and immediately turns the hips to throw without resetting the feet.",
      },
      {
        name: "Jump Throw Drill (Infield)",
        skillType: "Throwing",
        equipment: ["Glove", "Balls"],
        instructions: "Field in the hole and practice a jump-throw to generate arm strength and carry on off-balance throws.",
      },
      {
        name: "4-Seam Grip Accuracy Drill",
        skillType: "Throwing",
        equipment: ["Balls", "Target or Net"],
        instructions: "Throw at a fixed target focusing on a clean four-seam grip and consistent release point for accuracy.",
      },
      {
        name: "Reverse Throws (Arm Care)",
        skillType: "Throwing",
        equipment: ["Light Ball or Towel"],
        instructions: "Perform the throwing motion in reverse, decelerating patterns as a light arm-care warmup routine.",
      },
      {
        name: "Shuffle Throw Drill",
        skillType: "Throwing",
        equipment: ["Glove", "Balls"],
        instructions: "Field a ball moving laterally and practice a quick shuffle of the feet before delivering an accurate throw.",
      },
      {
        name: "Relay Throw Drill",
        skillType: "Throwing",
        equipment: ["Balls", "Multiple Players"],
        instructions: "Outfielder throws to a relay man who redirects the throw to a base, working exchange speed and accuracy.",
      },
      {
        name: "Pull-Down Throwing Drill",
        skillType: "Throwing",
        equipment: ["Balls", "Radar Gun (optional)"],
        instructions:
          "Short-distance, max-effort throws off a small crow hop to build arm strength and measure throwing velocity.",
      },
      // Catching
      {
        name: "Receiving Drill - Framing",
        skillType: "Catching",
        equipment: ["Catcher's Gear", "Balls"],
        instructions: "Receive pitches on the edges of the zone, working quiet hands and a subtle glove turn to frame strikes.",
      },
      {
        name: "Blocking Balls in the Dirt",
        skillType: "Catching",
        equipment: ["Catcher's Gear", "Balls"],
        instructions: "Drop to the block position on pitches thrown short-hop to smother the ball in front of the plate.",
      },
      {
        name: "Pop-Time Transfer Drill",
        skillType: "Catching",
        equipment: ["Catcher's Gear", "Balls", "Stopwatch"],
        instructions:
          "Receive a pitch and time the transfer/throw to second base, working to shave time off the exchange.",
      },
      {
        name: "Blocking Drill - Two Knee",
        skillType: "Catching",
        equipment: ["Catcher's Gear", "Balls"],
        instructions:
          "Practice the two-knee blocking stance for pitches in the dirt, rounding the shoulders to keep the ball in front.",
      },
      {
        name: "Framing Low Strikes Drill",
        skillType: "Catching",
        equipment: ["Catcher's Gear", "Balls"],
        instructions: "Set up low in the zone and work receiving low strikes without stabbing downward at the pitch.",
      },
      {
        name: "Bare-Hand Transfer Drill",
        skillType: "Catching",
        equipment: ["Catcher's Gear", "Balls"],
        instructions:
          "Practice pulling the throwing hand out of the glove quickly on the transfer to speed up throws to bases.",
      },
      {
        name: "Passed Ball Recovery Drill",
        skillType: "Catching",
        equipment: ["Catcher's Gear", "Balls", "Backstop"],
        instructions: "Simulate a ball getting past the catcher and practice the sprint, recovery, and throw home.",
      },
      {
        name: "Throw-Down to Second Drill",
        skillType: "Catching",
        equipment: ["Catcher's Gear", "Balls", "Bases"],
        instructions: "From the crouch, receive and throw down to second base focusing on footwork out of the stance.",
      },
      {
        name: "Backpick Drill",
        skillType: "Catching",
        equipment: ["Catcher's Gear", "Balls"],
        instructions: "Practice a quick backpick throw to first or third base to keep runners honest on their leads.",
      },
      {
        name: "One-Hand Catching Drill",
        skillType: "Catching",
        equipment: ["Catcher's Gear", "Balls"],
        instructions:
          "Receive pitches with the throwing hand tucked behind the back to build confidence in one-handed receiving.",
      },
      {
        name: "Pitch Tracking Drill",
        skillType: "Catching",
        equipment: ["Catcher's Gear", "Balls"],
        instructions:
          "Track the ball fully into the glove without peeking at the target early, improving focus through the catch.",
      },
      {
        name: "Blocking Drill - Lateral Movement",
        skillType: "Catching",
        equipment: ["Catcher's Gear", "Balls"],
        instructions:
          "Block pitches thrown to either side of the plate, working the shuffle needed to square the body to the ball.",
      },
      {
        name: "Catcher Footwork Reset Drill",
        skillType: "Catching",
        equipment: ["Catcher's Gear"],
        instructions: "Practice quickly resetting the feet into a strong throwing base immediately after receiving a pitch.",
      },
      // Footwork
      {
        name: "Ladder Drill - Infield Feet",
        skillType: "Footwork",
        equipment: ["Agility Ladder"],
        instructions: "Run quick-feet ladder patterns to build the fast, choppy footwork needed for infield range.",
      },
      {
        name: "First-Step Quickness Drill",
        skillType: "Footwork",
        equipment: ["Cones"],
        instructions: "React to a visual or verbal cue and explode the first step in a random direction to train reaction time.",
      },
      {
        name: "Crossover Step Drill",
        skillType: "Footwork",
        equipment: ["Cones"],
        instructions: "Practice the crossover step used to cover ground laterally on balls hit into the gap or hole.",
      },
      {
        name: "Base Running - Turn at First",
        skillType: "Footwork",
        equipment: ["Bases"],
        instructions:
          "Run through first base, working a proper banana-shaped turn to be in position to advance on an overthrow.",
      },
      {
        name: "Lead-Off and Return Drill",
        skillType: "Footwork",
        equipment: ["Bases"],
        instructions: "Practice taking a secondary lead and diving or sprinting back safely on a pickoff throw.",
      },
      {
        name: "Rounding Bases Drill",
        skillType: "Footwork",
        equipment: ["Bases"],
        instructions: "Run the bases at full speed, working the footwork to round each bag efficiently without losing speed.",
      },
      {
        name: "Shuffle Step Fielding Drill",
        skillType: "Footwork",
        equipment: ["Cones"],
        instructions:
          "Practice the low, wide shuffle step infielders and outfielders use to move laterally while staying balanced.",
      },
      {
        name: "Drop Step Drill (Outfield)",
        skillType: "Footwork",
        equipment: ["Cones"],
        instructions: "Work the outfielder's first-step drop and turn to run down balls hit over the head.",
      },
      {
        name: "Pivot Footwork Drill (Middle Infield)",
        skillType: "Footwork",
        equipment: ["Glove", "Balls", "Bases"],
        instructions: "Practice the different pivot footwork options at second base for turning a double play.",
      },
      {
        name: "Steal Break Drill",
        skillType: "Footwork",
        equipment: ["Bases", "Stopwatch"],
        instructions: "Practice the first-step burst out of a lead when stealing a base, timing the break for efficiency.",
      },
      {
        name: "Home to First Sprint Drill",
        skillType: "Footwork",
        equipment: ["Bases", "Stopwatch"],
        instructions: "Sprint from home plate to first base at game speed, timing the run to track improvement.",
      },
      {
        name: "Angle Route Drill (Outfield)",
        skillType: "Footwork",
        equipment: ["Cones", "Balls"],
        instructions: "Take proper pursuit angles to fly balls hit to either gap instead of running a direct, inefficient path.",
      },
      {
        name: "Split-Step Timing Drill",
        skillType: "Footwork",
        equipment: ["Balls"],
        instructions: "Practice timing a split-step (small hop) as the ball is hit to be ready to move in any direction.",
      },
      // Pitching
      {
        name: "Bullpen Session - Fastball Command",
        skillType: "Pitching",
        equipment: ["Mound", "Balls", "Catcher"],
        instructions: "Throw a structured bullpen focused on locating the fastball to specific quadrants of the zone.",
      },
      {
        name: "Towel Drill",
        skillType: "Pitching",
        equipment: ["Towel"],
        instructions: "Go through the full pitching motion snapping a towel instead of a ball to groove arm-path mechanics.",
      },
      {
        name: "Balance Point Drill",
        skillType: "Pitching",
        equipment: ["None"],
        instructions: "Lift the leg to the balance point and hold to reinforce a stable, controlled leg lift before driving forward.",
      },
      {
        name: "Long Toss for Pitchers",
        skillType: "Pitching",
        equipment: ["Balls", "Open Field"],
        instructions: "Extend throwing distance to build arm strength as part of a between-starts throwing program.",
      },
      {
        name: "Change-Up Grip and Feel Drill",
        skillType: "Pitching",
        equipment: ["Balls"],
        instructions: "Throw change-ups at short distance focusing purely on grip and release feel rather than velocity.",
      },
      {
        name: "Curveball Spin Drill",
        skillType: "Pitching",
        equipment: ["Balls", "Spin Indicator (optional)"],
        instructions: "Throw curveballs focusing on consistent spin direction and finishing the pitch out in front.",
      },
      {
        name: "Slide Step Drill (Runners On)",
        skillType: "Pitching",
        equipment: ["Mound", "Balls"],
        instructions: "Practice a quickened leg lift and delivery to hold runners on base while maintaining pitch quality.",
      },
      {
        name: "Pickoff Move Drill - First Base",
        skillType: "Pitching",
        equipment: ["Mound", "Bases"],
        instructions: "Practice the pickoff move to first base, working quick, deceptive footwork within the rules.",
      },
      {
        name: "Fielding Position Drill (PFP)",
        skillType: "Pitching",
        equipment: ["Glove", "Balls"],
        instructions: "Practice fielding comebackers and bunts off the mound and making accurate throws to each base.",
      },
      {
        name: "Mound Repeat Drill",
        skillType: "Pitching",
        equipment: ["Mound", "Balls"],
        instructions: "Throw consecutive pitches focusing on repeating the exact same arm slot and release point each time.",
      },
      {
        name: "Stride Length Drill",
        skillType: "Pitching",
        equipment: ["Mound", "Tape Measure (optional)"],
        instructions: "Mark and check stride length down the mound to build a consistent, athletic stride every pitch.",
      },
      {
        name: "Glove-Side Command Drill",
        skillType: "Pitching",
        equipment: ["Balls", "Target or Net"],
        instructions: "Throw specifically to the glove-side edge of the plate to build command away from the arm side.",
      },
      {
        name: "Rocker Drill (Weight Transfer)",
        skillType: "Pitching",
        equipment: ["None"],
        instructions: "Rock weight back onto the drive leg and then transfer forward to reinforce proper sequencing off the rubber.",
      },
      {
        name: "Bullpen Session - Off-Speed Mix",
        skillType: "Pitching",
        equipment: ["Mound", "Balls", "Catcher"],
        instructions: "Throw a bullpen mixing fastballs with off-speed pitches to simulate real at-bat sequencing.",
      },
    ];

    for (const drill of seedSkillDrills) {
      if (existingSkillNames.has(drill.name)) continue;
      await storage.createSkillExercise(skillLibraryOwner.id, {
        ...drill,
        sports: ["Baseball", "Softball"],
        videoUrl: skillVideoSearchUrl(drill.name),
      });
    }

    // Multi-sport expansion: real, sport-technical drills across the 10
    // sports with a genuine technical-skill vocabulary worth camera-based
    // mechanics review (see the skillType additions in skill-taxonomy.ts).
    // Deliberately excludes strength/conditioning-dominant sports
    // (Powerlifting, Cross Country, Cycling, Rowing) -- those are already
    // covered by the Strength exercise library, not this one. Each item
    // carries its own `sports` tag (unlike the uniform Baseball/Softball
    // tag above) since these aren't one shared sport's content -- and the
    // trailing "Athletic Footwork & Agility" block deliberately tags
    // several sports per drill, the cross-sport overlap the picker's Sport
    // accordion is built to surface.
    const multiSportSkillDrills: Array<{
      name: string;
      skillType: string;
      sports: string[];
      equipment: string[];
      instructions: string;
    }> = [
      // ============ BASKETBALL (~45) ============
      // Shooting
      { name: "Form Shooting - Close Range", skillType: "Shooting", sports: ["Basketball"], equipment: ["Basketball"], instructions: "Shoot one-handed from 3 feet, focusing on a high release and full wrist snap before stepping back once form is consistent." },
      { name: "Catch-and-Shoot Reps", skillType: "Shooting", sports: ["Basketball"], equipment: ["Basketball", "Partner"], instructions: "Catch a pass on the move and get the shot off within one dribble or less, feet already squared before the catch." },
      { name: "Off-the-Dribble Pull-Up", skillType: "Shooting", sports: ["Basketball"], equipment: ["Basketball"], instructions: "Attack off one or two dribbles and rise into a balanced jump shot, landing in the same spot you jumped from." },
      { name: "Free Throw Routine Reps", skillType: "Shooting", sports: ["Basketball"], equipment: ["Basketball"], instructions: "Repeat the exact same pre-shot routine every rep -- same number of dribbles, same breath, same release -- to build a reliable pressure habit." },
      { name: "Spot-Up Shooting Circuit", skillType: "Shooting", sports: ["Basketball"], equipment: ["Basketball", "Partner"], instructions: "Rotate through 5 perimeter spots, catching and shooting from each before moving to the next." },
      { name: "Floater/Runner Finishing", skillType: "Shooting", sports: ["Basketball"], equipment: ["Basketball"], instructions: "Attack the paint off two feet or one, releasing a soft touch shot over an imagined shot-blocker before contact." },
      { name: "Step-Back Jumper", skillType: "Shooting", sports: ["Basketball"], equipment: ["Basketball"], instructions: "Drive, plant, and push off to create separation backward into a squared, balanced jumper." },
      { name: "Corner Three Reps", skillType: "Shooting", sports: ["Basketball"], equipment: ["Basketball", "Partner"], instructions: "Catch on the move from the corner and release quickly -- the shortest three-point shot demands the fastest release." },
      { name: "Contested Shot Reps", skillType: "Shooting", sports: ["Basketball"], equipment: ["Basketball", "Partner"], instructions: "A partner closes out with a hand up on every rep -- focus on staying balanced and not fading away from a normal shot." },
      { name: "Mikan Drill", skillType: "Shooting", sports: ["Basketball"], equipment: ["Basketball"], instructions: "Alternate finishing layups off the glass on each side of the rim without the ball touching the ground, building both-hands finishing." },
      // Ball Handling
      { name: "Stationary Two-Ball Dribbling", skillType: "Ball Handling", sports: ["Basketball"], equipment: ["Basketball"], instructions: "Dribble two balls simultaneously in place, alternating pound and crossover patterns without looking down." },
      { name: "Crossover Series", skillType: "Ball Handling", sports: ["Basketball"], equipment: ["Basketball"], instructions: "Chain in-and-out, crossover, and behind-the-back moves stationary, then walking, then at full speed." },
      { name: "Full-Court Speed Dribble", skillType: "Ball Handling", sports: ["Basketball"], equipment: ["Basketball"], instructions: "Push the ball ahead with the dominant hand at a sprint pace, keeping the dribble low and controlled." },
      { name: "Cone Weave Dribbling", skillType: "Ball Handling", sports: ["Basketball"], equipment: ["Basketball", "Cones"], instructions: "Weave through a line of cones using a crossover or between-the-legs move at each one, changing hands every touch." },
      { name: "Two-Ball Alternating Dribble", skillType: "Ball Handling", sports: ["Basketball"], equipment: ["Basketball"], instructions: "Dribble two balls at alternating heights and rhythms to build independent hand control." },
      { name: "Pressure Dribbling vs. Defender", skillType: "Ball Handling", sports: ["Basketball"], equipment: ["Basketball", "Partner"], instructions: "A live defender applies ball pressure while the ball handler works to protect the ball and change speeds." },
      { name: "Between-the-Legs Combo", skillType: "Ball Handling", sports: ["Basketball"], equipment: ["Basketball"], instructions: "Chain between-the-legs dribbles into a hesitation move, walking then at game speed." },
      { name: "Change-of-Pace Attack Dribble", skillType: "Ball Handling", sports: ["Basketball"], equipment: ["Basketball", "Cones"], instructions: "Drive at a cone simulating a defender, decelerate hard, then explode past it at full speed." },
      { name: "One-Hand Dribble Tag", skillType: "Ball Handling", sports: ["Basketball"], equipment: ["Basketball", "Partner"], instructions: "Two players dribble in a confined space, each trying to knock the other's ball away while protecting their own." },
      { name: "Reaction Ball Handling", skillType: "Ball Handling", sports: ["Basketball"], equipment: ["Basketball", "Partner"], instructions: "Dribble while reacting to a partner's called-out direction or hand signal, forcing a live decision every few seconds." },
      // Passing
      { name: "Chest Pass Accuracy Reps", skillType: "Passing", sports: ["Basketball"], equipment: ["Basketball", "Wall"], instructions: "Snap crisp chest passes at a wall target, stepping into each pass with a full follow-through." },
      { name: "Bounce Pass Under Pressure", skillType: "Passing", sports: ["Basketball"], equipment: ["Basketball", "Partner"], instructions: "Deliver a bounce pass around a passive defender's outstretched arm, landing it two-thirds of the way to the receiver." },
      { name: "Outlet Pass Reps", skillType: "Passing", sports: ["Basketball"], equipment: ["Basketball", "Partner"], instructions: "Grab a rebound and fire a full-court outlet pass to a sprinting teammate before your feet fully reset." },
      { name: "No-Look Pass Reps", skillType: "Passing", sports: ["Basketball"], equipment: ["Basketball", "Partner"], instructions: "Practice disguising the pass direction with eyes while still delivering it accurately to the real target." },
      { name: "Skip Pass Reps", skillType: "Passing", sports: ["Basketball"], equipment: ["Basketball", "Partner"], instructions: "Fire a one-motion pass across the court to the far side, skipping the middle defender entirely." },
      { name: "Pick-and-Roll Passing Reps", skillType: "Passing", sports: ["Basketball"], equipment: ["Basketball", "Partner"], instructions: "Read a rolling screener's angle to the rim and deliver a pocket pass timed to their stride, not their stop." },
      { name: "Entry Pass to the Post", skillType: "Passing", sports: ["Basketball"], equipment: ["Basketball", "Partner"], instructions: "Deliver the ball to a post player on the correct hand (away from the defender) with a firm, one-motion pass." },
      { name: "Pivot-and-Pass Reps", skillType: "Passing", sports: ["Basketball"], equipment: ["Basketball", "Partner"], instructions: "Catch, pivot to find an open passing lane, and deliver -- building the habit of surveying the floor before passing on autopilot." },
      // Post Moves
      { name: "Drop Step Finish", skillType: "Post Moves", sports: ["Basketball"], equipment: ["Basketball"], instructions: "From the block, feel the defender's position, drop-step to the open side, and finish strong at the rim." },
      { name: "Up-and-Under Move", skillType: "Post Moves", sports: ["Basketball"], equipment: ["Basketball"], instructions: "Show a shot fake to draw the defender off their feet, then step through and finish underneath." },
      { name: "Jump Hook Reps", skillType: "Post Moves", sports: ["Basketball"], equipment: ["Basketball"], instructions: "Seal position on the block and release a one-motion jump hook, keeping the ball high and away from the defender's reach." },
      { name: "Post Spin Move", skillType: "Post Moves", sports: ["Basketball"], equipment: ["Basketball"], instructions: "Reverse pivot away from ball pressure into a spin that opens a clean path to the rim." },
      { name: "Face-Up Post Attack", skillType: "Post Moves", sports: ["Basketball"], equipment: ["Basketball"], instructions: "Catch on the block, square up facing the basket, and attack with a single power dribble to the rim." },
      { name: "Sealing and Positioning Drill", skillType: "Post Moves", sports: ["Basketball"], equipment: ["Basketball", "Partner"], instructions: "Practice using the lower body to seal a defender on their hip before the entry pass ever arrives." },
      { name: "Two-Ball Post Touch Drill", skillType: "Post Moves", sports: ["Basketball"], equipment: ["Basketball"], instructions: "Catch back-to-back post feeds and finish each one with a different move to build a real post-move counter." },
      { name: "Baby Hook Reps", skillType: "Post Moves", sports: ["Basketball"], equipment: ["Basketball"], instructions: "A short-range hook shot off one dribble from the block, releasing before the shoulder squares fully to the rim." },
      // Defense
      { name: "Defensive Slide Footwork", skillType: "Defense", sports: ["Basketball"], equipment: [], instructions: "Slide laterally in a low defensive stance without crossing the feet, staying square to an imaginary ball handler." },
      { name: "Closeout Footwork", skillType: "Defense", sports: ["Basketball"], equipment: [], instructions: "Sprint out of a help position under control, chopping the feet down into a balanced stance with a hand up on arrival." },
      { name: "On-Ball Containment Drill", skillType: "Defense", sports: ["Basketball"], equipment: ["Partner"], instructions: "Stay in front of a live ball handler for a set number of dribbles, mirroring their hips rather than the ball." },
      { name: "Help-and-Recover Drill", skillType: "Defense", sports: ["Basketball"], equipment: ["Partner"], instructions: "Step into the driving lane to help, then sprint back out to close on your original assignment before the pass arrives." },
      { name: "Box-Out Reps", skillType: "Defense", sports: ["Basketball"], equipment: ["Basketball", "Partner"], instructions: "Make contact and pivot into a low, wide base to seal a rebounder away from the ball before going to get it." },
      { name: "Charge Take Drill", skillType: "Defense", sports: ["Basketball"], equipment: ["Partner"], instructions: "Establish position early and take contact with a set, low base rather than a late, off-balance lunge." },
      { name: "Deny Position Footwork", skillType: "Defense", sports: ["Basketball"], equipment: ["Partner"], instructions: "Work on-ball-side denial positioning against an off-ball cutter, staying between the ball and the offensive player." },
      { name: "Shell Drill", skillType: "Defense", sports: ["Basketball"], equipment: ["Basketball", "Partner"], instructions: "Four defenders rotate on the pass, practicing help-side positioning and closing out as the ball moves around the perimeter." },
      { name: "Lateral Mirror Drill", skillType: "Defense", sports: ["Basketball"], equipment: ["Partner"], instructions: "Mirror a partner's random lateral movements in a defensive stance without a ball, purely for footwork and reaction." },

      // ============ SOCCER (~45) ============
      // Ball Control
      { name: "First Touch - Ground Ball", skillType: "Ball Control", sports: ["Soccer"], equipment: ["Soccer Ball", "Wall"], instructions: "Receive a rolling pass and cushion it into your next stride in one touch, without it bouncing away." },
      { name: "First Touch - Aerial Ball", skillType: "Ball Control", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Cushion a dropping ball out of the air with the instep, chest, or thigh, killing its speed dead before the second touch." },
      { name: "Juggling Reps", skillType: "Ball Control", sports: ["Soccer"], equipment: ["Soccer Ball"], instructions: "Keep the ball off the ground using feet, thighs, and chest for a target number of consecutive touches." },
      { name: "Wall Passing - One Touch", skillType: "Ball Control", sports: ["Soccer"], equipment: ["Soccer Ball", "Wall"], instructions: "Pass into a wall and return it in one touch, alternating feet, to build fast, clean receiving under pressure of time." },
      { name: "Turn and Control Under Pressure", skillType: "Ball Control", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Receive with a defender closing from behind and use the first touch to turn away from pressure in one motion." },
      { name: "Chest Control to Volley", skillType: "Ball Control", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Cushion a thrown ball on the chest, let it drop, and strike a controlled volley before it hits the ground." },
      { name: "Sole Roll Control", skillType: "Ball Control", sports: ["Soccer"], equipment: ["Soccer Ball"], instructions: "Trap a passed ball under the sole of the foot and immediately roll it into space away from a defender." },
      { name: "Two-Touch Passing Circuit", skillType: "Ball Control", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Limit every touch to control-then-pass, forcing a quick, decisive first touch on every rep." },
      { name: "Back Pressure Shielding", skillType: "Ball Control", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Receive with your body between the ball and a defender applying pressure from behind, protecting it until support arrives." },
      // Dribbling
      { name: "Cone Weave Dribbling", skillType: "Dribbling", sports: ["Soccer"], equipment: ["Soccer Ball", "Cones"], instructions: "Weave through a tight line of cones using the inside and outside of both feet, keeping the ball close." },
      { name: "Step-Over Move", skillType: "Dribbling", sports: ["Soccer"], equipment: ["Soccer Ball"], instructions: "Circle the foot over the ball without touching it to sell a fake direction, then push off the opposite way." },
      { name: "Cruyff Turn", skillType: "Dribbling", sports: ["Soccer"], equipment: ["Soccer Ball"], instructions: "Fake a pass or shot, then drag the ball behind the standing leg to reverse direction in one motion." },
      { name: "1v1 Attacking Moves", skillType: "Dribbling", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Attack a live defender in a small grid, working to beat them with a change of pace or direction rather than pure speed." },
      { name: "Close Control Sprint", skillType: "Dribbling", sports: ["Soccer"], equipment: ["Soccer Ball"], instructions: "Push the ball with quick, light touches at a full sprint, keeping it within playing distance the entire way." },
      { name: "Elastico Move", skillType: "Dribbling", sports: ["Soccer"], equipment: ["Soccer Ball"], instructions: "Push the ball out with the outside of the foot, then snap it back inside in one continuous motion to change direction." },
      { name: "Change of Direction Dribbling", skillType: "Dribbling", sports: ["Soccer"], equipment: ["Soccer Ball", "Cones"], instructions: "Dribble at a cone, plant, and cut sharply away at a new angle without slowing the ball down more than necessary." },
      { name: "Nutmeg Attempt Drill", skillType: "Dribbling", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Work on selling a different move before slipping the ball through a defender's open stance." },
      { name: "Ball Mastery Circuit", skillType: "Dribbling", sports: ["Soccer"], equipment: ["Soccer Ball"], instructions: "Chain toe taps, sole rolls, and inside-outside touches in a stationary circuit to build raw foot-ball familiarity." },
      // Passing
      { name: "Long Diagonal Passing", skillType: "Passing", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Strike a driven ball across a long diagonal distance, focusing on weight and accuracy over pure power." },
      { name: "Give-and-Go Passing", skillType: "Passing", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Pass and immediately sprint into space to receive a return pass, building the timing of a one-two combination." },
      { name: "Through Ball Passing", skillType: "Passing", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Time a pass into the space behind a defensive line for a teammate's run, not to their current position." },
      { name: "Switching the Field", skillType: "Passing", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Strike a long, accurate pass from one side of the field to the other to change the point of attack." },
      { name: "One-Touch Passing Square", skillType: "Passing", sports: ["Soccer"], equipment: ["Soccer Ball", "Cones"], instructions: "Four players pass one-touch around a square, forcing quick decisions and accurate weight on every ball." },
      { name: "Driven Ball Passing", skillType: "Passing", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Strike through the ball's center with a locked ankle to keep it low and firm over medium distance." },
      { name: "Chip Pass Accuracy", skillType: "Passing", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Get underneath the ball with a stabbing motion to loft it over a defender and drop it at a teammate's feet." },
      { name: "Crossing from Wide Areas", skillType: "Passing", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Deliver a driven or floated cross into the box from wide, aiming for a specific target zone in front of goal." },
      { name: "Back Pass to Keeper", skillType: "Passing", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Practice a firm, controlled pass back to the goalkeeper under pressure, angled away from an onrushing attacker." },
      // Shooting
      { name: "Instep Drive Shooting", skillType: "Shooting", sports: ["Soccer"], equipment: ["Soccer Ball", "Net"], instructions: "Strike through the ball's center with the laces, plant foot alongside the ball, for a powerful, low shot." },
      { name: "Finesse Shot Placement", skillType: "Shooting", sports: ["Soccer"], equipment: ["Soccer Ball", "Net"], instructions: "Curl a shot with the inside of the foot toward a corner of the goal, prioritizing placement over power." },
      { name: "First-Time Finishing", skillType: "Shooting", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Strike a passed or crossed ball on the first touch without settling it, timing the run to the ball's arrival." },
      { name: "Volley Shooting", skillType: "Shooting", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Strike a ball out of the air before it touches the ground, keeping the body over the ball to stay low." },
      { name: "Breakaway Finishing", skillType: "Shooting", sports: ["Soccer"], equipment: ["Soccer Ball", "Net"], instructions: "Attack one-on-one against a goalkeeper, working on composure and picking a corner rather than blasting at the keeper." },
      { name: "Header Shooting Reps", skillType: "Shooting", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Attack a crossed ball in the air, snapping the neck through contact to direct it downward on target." },
      { name: "Penalty Kick Routine", skillType: "Shooting", sports: ["Soccer"], equipment: ["Soccer Ball", "Net"], instructions: "Repeat the exact same run-up and pick a target before the strike, building a reliable pressure routine." },
      // Defending
      { name: "1v1 Defending Stance", skillType: "Defending", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Approach an attacker under control, staying goal-side and jockeying rather than diving in for a tackle." },
      { name: "Slide Tackle Technique", skillType: "Defending", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Time a slide tackle to win the ball cleanly, leading with the near foot and staying low through contact." },
      { name: "Jockeying and Delay", skillType: "Defending", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Delay an attacker's progress with a low, balanced stance, forcing them wide without committing to a tackle." },
      { name: "Interception Reads", skillType: "Defending", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Read a passing lane and step in front of it to intercept before the ball reaches its intended target." },
      { name: "Defensive Line Shape Drill", skillType: "Defending", sports: ["Soccer"], equipment: ["Cones"], instructions: "Move as a unit to maintain a flat defensive line, stepping up together to catch attackers offside." },
      { name: "Recovery Run Defending", skillType: "Defending", sports: ["Soccer"], equipment: ["Partner"], instructions: "Sprint back into a defensive position after being beaten, angling the run to cut off the attacker's path rather than chasing straight." },
      // Goalkeeping
      { name: "Diving Save Technique", skillType: "Goalkeeping", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Push off the near foot to dive across the goal, leading with the hands and collapsing the body behind the ball." },
      { name: "Low Shot Handling", skillType: "Goalkeeping", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Get the body behind a low, driven shot, scooping with both hands rather than stabbing at it with one." },
      { name: "Crosses and High Ball Claims", skillType: "Goalkeeping", sports: ["Soccer"], equipment: ["Soccer Ball", "Partner"], instructions: "Read the flight of a crossed ball and attack it at its highest point, catching with both hands framing a W shape." },

      // ============ VOLLEYBALL (~35) ============
      // Serving
      { name: "Float Serve Technique", skillType: "Serving", sports: ["Volleyball"], equipment: ["Volleyball", "Net"], instructions: "Toss with minimal spin and strike the center of the ball flat-handed to produce an unpredictable, wobbling flight." },
      { name: "Jump Serve Reps", skillType: "Serving", sports: ["Volleyball"], equipment: ["Volleyball", "Net"], instructions: "Toss out in front, approach, and strike at the peak of the jump like a spike, driving the ball down and deep." },
      { name: "Serve Target Accuracy", skillType: "Serving", sports: ["Volleyball"], equipment: ["Volleyball", "Net", "Cones"], instructions: "Serve at marked zones on the court, prioritizing consistent placement over pure power." },
      { name: "Underhand Serve Fundamentals", skillType: "Serving", sports: ["Volleyball"], equipment: ["Volleyball", "Net"], instructions: "Step into the serve and strike the ball with a straight, locked arm from below, ideal for a beginner's first reliable serve." },
      { name: "Topspin Serve Reps", skillType: "Serving", sports: ["Volleyball"], equipment: ["Volleyball", "Net"], instructions: "Snap the wrist over the top of the ball on contact to generate forward spin that drops the ball sharply." },
      { name: "Serve Under Fatigue", skillType: "Serving", sports: ["Volleyball"], equipment: ["Volleyball", "Net"], instructions: "Serve immediately after a short conditioning burst to build the habit of a repeatable routine even when tired." },
      { name: "Serve Receive Pressure Drill", skillType: "Serving", sports: ["Volleyball"], equipment: ["Volleyball", "Net", "Partner"], instructions: "Serve at a specific back-row target to pressure-test a receiver's positioning and passing platform." },
      // Passing/Digging
      { name: "Forearm Passing Platform", skillType: "Passing", sports: ["Volleyball"], equipment: ["Volleyball", "Partner"], instructions: "Build a flat, stable forearm platform early and use the legs, not the arms, to direct the ball to target." },
      { name: "Serve Receive Reps", skillType: "Passing", sports: ["Volleyball"], equipment: ["Volleyball", "Net", "Partner"], instructions: "Receive live serves and pass them to the target zone near the net, tracking the ball's spin and speed early." },
      { name: "Digging Hard-Driven Balls", skillType: "Passing", sports: ["Volleyball"], equipment: ["Volleyball", "Partner"], instructions: "React to a hard-hit ball with a low, wide base, absorbing pace rather than swinging the platform at it." },
      { name: "Pursuit Digging Drill", skillType: "Passing", sports: ["Volleyball"], equipment: ["Volleyball", "Partner"], instructions: "Chase down a ball hit outside your normal range, prioritizing getting a platform under it over perfect form." },
      { name: "Emergency Dig - Overhead", skillType: "Passing", sports: ["Volleyball"], equipment: ["Volleyball", "Partner"], instructions: "Use an overhead tomahawk or pancake technique to save a ball that arrives too fast for a normal platform." },
      { name: "Cross-Court Passing Reps", skillType: "Passing", sports: ["Volleyball"], equipment: ["Volleyball", "Partner"], instructions: "Angle the platform to redirect a ball arriving from one side back across the court to target." },
      { name: "Passing Footwork Drill", skillType: "Footwork", sports: ["Volleyball"], equipment: [], instructions: "Shuffle into position ahead of the ball's arrival so the platform is set and still before contact, never reaching." },
      // Setting
      { name: "Overhead Set Technique", skillType: "Setting", sports: ["Volleyball"], equipment: ["Volleyball", "Net"], instructions: "Frame the ball with both hands above the forehead and extend through the legs and arms together for a soft, controlled set." },
      { name: "Back Set Reps", skillType: "Setting", sports: ["Volleyball"], equipment: ["Volleyball", "Net"], instructions: "Set a ball behind you without turning the body, arching the back and extending upward to place it accurately." },
      { name: "Jump Set Reps", skillType: "Setting", sports: ["Volleyball"], equipment: ["Volleyball", "Net"], instructions: "Set from a jump to disguise the set location from blockers, releasing the ball at the top of the jump." },
      { name: "Setting Off a Bad Pass", skillType: "Setting", sports: ["Volleyball"], equipment: ["Volleyball", "Net", "Partner"], instructions: "Move quickly to a poorly passed ball and still deliver a hittable set, prioritizing recovery footwork over perfect hand position." },
      { name: "Quick Set (Tempo) Reps", skillType: "Setting", sports: ["Volleyball"], equipment: ["Volleyball", "Net", "Partner"], instructions: "Deliver a fast, low set tight to the antenna, timed for a hitter already in their approach." },
      { name: "Setter Footwork and Positioning", skillType: "Footwork", sports: ["Volleyball"], equipment: [], instructions: "Practice the setter's shuffle-and-square footwork to arrive under the ball with the body already facing the target." },
      // Attacking
      { name: "Approach and Armswing", skillType: "Attacking", sports: ["Volleyball"], equipment: ["Volleyball", "Net"], instructions: "Time a three-step approach into a full armswing, contacting the ball at the highest point in front of the hitting shoulder." },
      { name: "Line and Cross-Court Hitting", skillType: "Attacking", sports: ["Volleyball"], equipment: ["Volleyball", "Net"], instructions: "Direct the same swing down the line or cross-court using shoulder rotation and wrist angle, not a different approach." },
      { name: "Off-Speed Shot (Tip/Roll)", skillType: "Attacking", sports: ["Volleyball"], equipment: ["Volleyball", "Net"], instructions: "Disguise a full-speed approach into a soft tip or roll shot over or around the block." },
      { name: "Back Row Attack Reps", skillType: "Attacking", sports: ["Volleyball"], equipment: ["Volleyball", "Net"], instructions: "Approach and hit from behind the 10-foot line, jumping from before the line to legally attack a back-row set." },
      { name: "Hitting Against a Block", skillType: "Attacking", sports: ["Volleyball"], equipment: ["Volleyball", "Net", "Partner"], instructions: "Attack against a live single or double block, working to find the seam or tool the block out of bounds." },
      { name: "Quick Attack (Middle) Timing", skillType: "Attacking", sports: ["Volleyball"], equipment: ["Volleyball", "Net", "Partner"], instructions: "Time the approach to arrive at the peak of the jump as the quick set arrives, a fraction of a second faster than an outside swing." },
      { name: "Cut Shot Reps", skillType: "Attacking", sports: ["Volleyball"], equipment: ["Volleyball", "Net"], instructions: "Snap the wrist sharply to redirect the ball at a steep angle close to the net, rather than a full-power swing." },
      // Blocking
      { name: "Block Footwork - Lateral Slide", skillType: "Blocking", sports: ["Volleyball"], equipment: ["Net"], instructions: "Slide laterally along the net to get square to a hitter, planting the outside foot to jump straight up, not forward." },
      { name: "Timing the Block Jump", skillType: "Blocking", sports: ["Volleyball"], equipment: ["Volleyball", "Net", "Partner"], instructions: "Read the hitter's approach and jump slightly after them, penetrating the hands over the net at the top of the swing." },
      { name: "Double Block Coordination", skillType: "Blocking", sports: ["Volleyball"], equipment: ["Volleyball", "Net", "Partner"], instructions: "Two blockers close the seam between them and jump together, eliminating the gap a hitter could tool." },
      { name: "Reading Hitter Approach for Block", skillType: "Blocking", sports: ["Volleyball"], equipment: ["Net", "Partner"], instructions: "Watch the hitter's shoulder angle and approach line pre-jump to predict shot direction before committing to block." },
      { name: "Block-to-Transition Footwork", skillType: "Footwork", sports: ["Volleyball"], equipment: ["Net"], instructions: "Land from a block and immediately open the hips to transition backward off the net for the next attack." },

      // ============ FOOTBALL (~40) ============
      // Route Running
      { name: "Slant Route Technique", skillType: "Route Running", sports: ["Football"], equipment: ["Football"], instructions: "Push off the line at full speed for 3 steps, then break sharply at a 45-degree angle without rounding the cut." },
      { name: "Out Route Technique", skillType: "Route Running", sports: ["Football"], equipment: ["Football", "Cones"], instructions: "Sell a vertical stem before planting the outside foot and driving hard toward the sideline on a flat angle." },
      { name: "Comeback Route Technique", skillType: "Route Running", sports: ["Football"], equipment: ["Football", "Cones"], instructions: "Push deep to sell a go route, then decelerate and drive back downhill toward the quarterback at a sharp angle." },
      { name: "Release Package vs. Press", skillType: "Route Running", sports: ["Football"], equipment: ["Football", "Partner"], instructions: "Work hand-fighting and footwork releases against a jamming corner before the route stem even begins." },
      { name: "Double Move Route Running", skillType: "Route Running", sports: ["Football"], equipment: ["Football"], instructions: "Sell a hard break on the first cut to freeze the defender before accelerating into the real, second-level route." },
      { name: "Route Tree Cone Drill", skillType: "Route Running", sports: ["Football"], equipment: ["Football", "Cones"], instructions: "Run the full route tree off a single stem at each cone, building precise, repeatable breakpoints." },
      { name: "Comeback Catch and Sideline Awareness", skillType: "Route Running", sports: ["Football"], equipment: ["Football", "Partner", "Cones"], instructions: "Catch a comeback route near a marked sideline, dragging the toes to stay in bounds." },
      { name: "Post Route Timing", skillType: "Route Running", sports: ["Football"], equipment: ["Football", "Partner"], instructions: "Push vertical then break at a diagonal toward the goal post, timed to a deep-arm throw already in the air." },
      { name: "Option Route Reads", skillType: "Route Running", sports: ["Football"], equipment: ["Football", "Partner"], instructions: "Read the leverage of the covering defender mid-route and break toward whichever side is open." },
      // Blocking (Football)
      { name: "Drive Block Technique", skillType: "Blocking (Football)", sports: ["Football"], equipment: ["Blocking Sled"], instructions: "Fire off the line with a low pad level, striking with both hands inside the frame and driving the legs through contact." },
      { name: "Pass Protection Footwork", skillType: "Blocking (Football)", sports: ["Football"], equipment: ["Partner"], instructions: "Kick-slide backward staying square, mirroring a pass rusher's hips rather than their hands or shoulder fakes." },
      { name: "Pull and Trap Block", skillType: "Blocking (Football)", sports: ["Football"], equipment: ["Blocking Sled"], instructions: "Pull laterally down the line and square up to seal a defender on a designed running lane." },
      { name: "Combo Block Reps", skillType: "Blocking (Football)", sports: ["Football"], equipment: ["Blocking Sled", "Partner"], instructions: "Two linemen double-team a defensive lineman before one climbs off to the second level on the linebacker." },
      { name: "Cut Block Technique", skillType: "Blocking (Football)", sports: ["Football"], equipment: ["Partner"], instructions: "Aim the shoulder low through the defender's outside hip to take out their legs on a designed cut block." },
      // Tackling
      { name: "Form Tackle - Head-Up", skillType: "Tackling", sports: ["Football"], equipment: ["Partner"], instructions: "Wrap up with the head across the front of the ball carrier, driving the legs through contact to finish the tackle." },
      { name: "Open Field Tackling", skillType: "Tackling", sports: ["Football"], equipment: ["Partner"], instructions: "Break down into a short-stepped, balanced position before closing the final distance to a moving ball carrier." },
      { name: "Angle Tackling Drill", skillType: "Tackling", sports: ["Football"], equipment: ["Partner"], instructions: "Take a proper pursuit angle to cut off a ball carrier's path rather than chasing straight from behind." },
      { name: "Gang Tackling Reps", skillType: "Tackling", sports: ["Football"], equipment: ["Partner"], instructions: "Multiple defenders converge on a ball carrier, the first player breaking down to slow them for teammates arriving." },
      { name: "Tackle Circuit - Sled and Bags", skillType: "Tackling", sports: ["Football"], equipment: ["Blocking Sled"], instructions: "Rep proper wrap, drive, and finish technique against a sled or bag before live contact work." },
      // QB Mechanics
      { name: "Five-Step Drop Technique", skillType: "QB Mechanics", sports: ["Football"], equipment: ["Football"], instructions: "Drop back on a consistent, balanced path, hitting the fifth step with the base already set to throw." },
      { name: "Play-Action Fake and Reset", skillType: "QB Mechanics", sports: ["Football"], equipment: ["Football", "Partner"], instructions: "Sell a hand-off fake convincingly with the eyes and ball carriage before resetting the base to throw." },
      { name: "Footwork Under Pressure", skillType: "QB Mechanics", sports: ["Football"], equipment: ["Football", "Partner"], instructions: "Climb the pocket or slide away from pressure while keeping the base under control and eyes downfield." },
      { name: "Deep Ball Touch and Trajectory", skillType: "QB Mechanics", sports: ["Football"], equipment: ["Football", "Partner"], instructions: "Throw a deep ball with a high, arcing trajectory that drops into a receiver's stride rather than a flat line drive." },
      { name: "Rollout Throwing Mechanics", skillType: "QB Mechanics", sports: ["Football"], equipment: ["Football", "Partner"], instructions: "Keep the shoulders square while rolling out, throwing off a set base rather than fully sideways momentum." },
      { name: "Progression Reads Drill", skillType: "QB Mechanics", sports: ["Football"], equipment: ["Football", "Partner"], instructions: "Work through a full route progression at a fixed pace, forcing a decision by the last read rather than staring down one target." },
      { name: "Release Point Consistency Reps", skillType: "QB Mechanics", sports: ["Football"], equipment: ["Football"], instructions: "Throw from a fixed spot at a target, focusing on a repeatable, high release point on every rep." },
      // Kicking
      { name: "Field Goal Approach and Plant", skillType: "Kicking", sports: ["Football"], equipment: ["Football", "Kicking Tee"], instructions: "Take a consistent angled approach, planting the non-kicking foot beside the ball at a fixed distance every time." },
      { name: "Punt Drop and Contact", skillType: "Kicking", sports: ["Football"], equipment: ["Football"], instructions: "Drop the ball onto the foot from a consistent height and angle, striking through the laces for a clean spiral." },
      { name: "Kickoff Technique", skillType: "Kicking", sports: ["Football"], equipment: ["Football", "Kicking Tee"], instructions: "Approach with a full run-up and strike through the lower third of the ball for maximum hang time and distance." },
      { name: "Onside Kick Technique", skillType: "Kicking", sports: ["Football"], equipment: ["Football", "Kicking Tee"], instructions: "Strike down and through the top of the ball to produce a low, tumbling kick that becomes live at 10 yards." },

      // ============ LACROSSE (~25) ============
      // Stick Handling
      { name: "Cradling Fundamentals", skillType: "Stick Handling", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls"], instructions: "Rock the stick in a smooth wrist-and-forearm motion to keep the ball secure in the pocket while moving." },
      { name: "Split Dodge", skillType: "Stick Handling", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls"], instructions: "Switch the stick hand-to-hand in front of the body while changing direction to beat a defender head-on." },
      { name: "Face Dodge", skillType: "Stick Handling", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls"], instructions: "Bring the stick across the face to the opposite shoulder to protect it while cutting past a defender." },
      { name: "Wall Ball Passing Reps", skillType: "Stick Handling", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Wall"], instructions: "Throw and catch off a wall at increasing speed, alternating hands to build stick skills on both sides." },
      { name: "Cradle Under Pressure", skillType: "Stick Handling", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Partner"], instructions: "Cradle and protect the ball while a defender applies a check, keeping the stick head away from their reach." },
      { name: "Catching on the Run", skillType: "Stick Handling", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Partner"], instructions: "Catch a pass in stride at full speed without breaking cadence, giving with the hands to absorb the ball's speed." },
      { name: "Off-Hand Stick Work", skillType: "Stick Handling", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Wall"], instructions: "Repeat cradling and passing drills exclusively with the non-dominant hand to remove a predictable tendency." },
      // Shooting
      { name: "Overhand Shooting Technique", skillType: "Shooting", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Net"], instructions: "Snap the top hand through release like a throwing motion, driving the shot low and hard to a corner." },
      { name: "Sidearm Shooting Reps", skillType: "Shooting", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Net"], instructions: "Rotate the hips and release the shot on a flat, sidearm plane to change the shot angle a goalie sees." },
      { name: "Shooting on the Run", skillType: "Shooting", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Net"], instructions: "Catch and release a shot in one continuous motion while sprinting, without settling the feet first." },
      { name: "Time and Room Shooting", skillType: "Shooting", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Net"], instructions: "From distance with no defender close, focus on picking a corner and full-power accuracy rather than a quick release." },
      { name: "Bounce Shot Technique", skillType: "Shooting", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Net"], instructions: "Aim the shot to bounce a few feet in front of the goal, harder for a goalie to read than a direct line." },
      { name: "Shooting Off a Dodge", skillType: "Shooting", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Net", "Partner"], instructions: "Chain a dodge move directly into a shot release without a pause, before the defense can recover." },
      // Dodging
      { name: "Roll Dodge Technique", skillType: "Dodging", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Partner"], instructions: "Plant and pivot the body around a defender, keeping the stick on the far side away from a check the whole way." },
      { name: "Question Mark Dodge", skillType: "Dodging", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Partner"], instructions: "Approach on a curving path that looks like a question mark, changing speed to freeze the defender before attacking downhill." },
      { name: "Bull Dodge", skillType: "Dodging", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Partner"], instructions: "Attack a defender directly at speed, using the shoulder and body to power through rather than around them." },
      { name: "Change of Direction Dodging", skillType: "Dodging", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Cones"], instructions: "Chain multiple direction changes through cones while cradling at speed, simulating reading a shifting defense." },
      { name: "Dodging Off the Catch", skillType: "Dodging", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Partner"], instructions: "Catch a pass already moving into a dodge, eliminating the pause that lets a defense reset." },
      // Face-offs
      { name: "Face-Off Clamp Technique", skillType: "Face-offs", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Partner"], instructions: "Snap the top hand down to trap the ball against the ground the instant the whistle sounds." },
      { name: "Face-Off Exit Moves", skillType: "Face-offs", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Partner"], instructions: "Practice pulling the ball to space and controlling it in the same motion as winning the clamp." },
      { name: "Face-Off Counter Moves", skillType: "Face-offs", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Partner"], instructions: "React to an opponent's clamp attempt with a rake or jam counter to still come away with possession." },
      { name: "Face-Off Ground Ball Battle", skillType: "Face-offs", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls", "Partner"], instructions: "Fight for a loose ball immediately after the clamp, simulating the wing players closing in." },
      { name: "Face-Off Explosiveness Reps", skillType: "Face-offs", sports: ["Lacrosse"], equipment: ["Lacrosse Stick", "Balls"], instructions: "Repeat the clamp-and-explode motion for pure first-step speed off a stationary set position." },

      // ============ ICE HOCKEY (~30) ============
      // Skating
      { name: "Forward Crossover Technique", skillType: "Skating", sports: ["Ice Hockey"], equipment: [], instructions: "Push laterally through a turn by crossing the outside skate over the inside one without losing speed." },
      { name: "Backward Skating Technique", skillType: "Skating", sports: ["Ice Hockey"], equipment: [], instructions: "Push in a C-cut motion with each skate while keeping the knees bent and chest up to track a play backward." },
      { name: "Stop-and-Start Acceleration", skillType: "Skating", sports: ["Ice Hockey"], equipment: [], instructions: "Snap to a hard stop and explode back to full speed immediately, simulating a live defensive read." },
      { name: "Tight Turn Technique", skillType: "Skating", sports: ["Ice Hockey"], equipment: ["Cones"], instructions: "Lean into a tight turn around a cone or marker while maintaining speed, edges doing the work rather than the toes." },
      { name: "Edge Work - Inside/Outside", skillType: "Skating", sports: ["Ice Hockey"], equipment: [], instructions: "Practice controlled inside- and outside-edge turns at varying speeds to build overall balance and control." },
      { name: "Transition Skating (Forward-Backward)", skillType: "Skating", sports: ["Ice Hockey"], equipment: [], instructions: "Pivot cleanly from forward to backward skating and back without losing stride or speed through the transition." },
      { name: "Explosive First-Stride Acceleration", skillType: "Skating", sports: ["Ice Hockey"], equipment: [], instructions: "From a stationary start, drive the first several strides low and choppy to build maximum acceleration off the line." },
      // Stick Handling
      { name: "Puck Handling in Tight Spaces", skillType: "Stick Handling", sports: ["Ice Hockey"], equipment: ["Hockey Stick", "Puck", "Cones"], instructions: "Weave the puck through a tight cone course, keeping the head up rather than watching the puck." },
      { name: "Toe Drag Move", skillType: "Stick Handling", sports: ["Ice Hockey"], equipment: ["Hockey Stick", "Puck"], instructions: "Pull the puck back with the toe of the blade past a defender's stick check to change the attack angle." },
      { name: "Saucer Pass Reps", skillType: "Stick Handling", sports: ["Ice Hockey"], equipment: ["Hockey Stick", "Puck", "Partner"], instructions: "Lift the puck slightly off the ice with a scooping motion to pass over a defender's stick and land flat for a teammate." },
      { name: "Puck Protection Along the Boards", skillType: "Stick Handling", sports: ["Ice Hockey"], equipment: ["Hockey Stick", "Puck", "Partner"], instructions: "Position the body between the puck and a checking defender along the boards, using edges to hold the wall." },
      { name: "One-Timer Reps", skillType: "Stick Handling", sports: ["Ice Hockey"], equipment: ["Hockey Stick", "Puck", "Partner"], instructions: "Redirect a passed puck directly into a shot without stopping it first, timing the blade to the pass's arrival." },
      { name: "Deking Moves at Speed", skillType: "Stick Handling", sports: ["Ice Hockey"], equipment: ["Hockey Stick", "Puck", "Partner"], instructions: "Chain a fake shot or pass into a lateral puck move to beat a defender one-on-one." },
      // Shooting
      { name: "Wrist Shot Technique", skillType: "Shooting", sports: ["Ice Hockey"], equipment: ["Hockey Stick", "Puck", "Net"], instructions: "Roll the puck from heel to toe of the blade while transferring weight forward for a quick, accurate release." },
      { name: "Slap Shot Technique", skillType: "Shooting", sports: ["Ice Hockey"], equipment: ["Hockey Stick", "Puck", "Net"], instructions: "Wind up and strike just behind the puck to flex the stick, loading power into a full-speed release." },
      { name: "Snap Shot Technique", skillType: "Shooting", sports: ["Ice Hockey"], equipment: ["Hockey Stick", "Puck", "Net"], instructions: "A quicker, shorter-loading version of the slap shot, prioritizing release speed over maximum power." },
      { name: "Backhand Shot Reps", skillType: "Shooting", sports: ["Ice Hockey"], equipment: ["Hockey Stick", "Puck", "Net"], instructions: "Cup the puck on the backhand side of the blade and release with a rolling wrist motion for a surprise angle." },
      { name: "In-Tight Finishing Moves", skillType: "Shooting", sports: ["Ice Hockey"], equipment: ["Hockey Stick", "Puck", "Net"], instructions: "Work quick-release finishing moves from close range against a goaltender, prioritizing deception over power." },
      // Goaltending
      { name: "Butterfly Save Technique", skillType: "Goaltending", sports: ["Ice Hockey"], equipment: ["Hockey Stick", "Puck", "Partner"], instructions: "Drop both knees to the ice simultaneously, sealing the five-hole while keeping the upper body square to the shooter." },
      { name: "Post-to-Post Movement", skillType: "Goaltending", sports: ["Ice Hockey"], equipment: [], instructions: "Push explosively from one post to the other on a cross-crease pass, arriving set before the shot." },
      { name: "Rebound Control Reps", skillType: "Goaltending", sports: ["Ice Hockey"], equipment: ["Hockey Stick", "Puck", "Partner"], instructions: "Direct saved pucks to the corner or smother them rather than leaving a juicy rebound in the slot." },
      { name: "Angle and Depth Positioning", skillType: "Goaltending", sports: ["Ice Hockey"], equipment: [], instructions: "Adjust depth in the crease to cut down the shooting angle without overcommitting and opening the far post." },
      { name: "Tracking Screened Shots", skillType: "Goaltending", sports: ["Ice Hockey"], equipment: ["Hockey Stick", "Puck", "Partner"], instructions: "Move laterally to find a clear sightline around a screening player before the shot arrives." },

      // ============ TENNIS (~25) ============
      // Groundstrokes
      { name: "Forehand Technique Reps", skillType: "Groundstrokes", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls"], instructions: "Take the racquet back early and drive through contact with a full hip and shoulder rotation." },
      { name: "Two-Handed Backhand Reps", skillType: "Groundstrokes", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls"], instructions: "Turn the shoulders fully on the takeback and drive both hands through contact together." },
      { name: "One-Handed Backhand Reps", skillType: "Groundstrokes", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls"], instructions: "Lead with the elbow on the takeback and extend fully through contact with a firm wrist." },
      { name: "Topspin Groundstroke Drill", skillType: "Groundstrokes", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls"], instructions: "Brush up the back of the ball on contact to generate topspin that dips the shot in before the baseline." },
      { name: "Cross-Court Rally Consistency", skillType: "Groundstrokes", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls", "Partner"], instructions: "Rally cross-court with a partner, prioritizing consecutive clean contacts over pace or winners." },
      { name: "Down-the-Line Shot Reps", skillType: "Groundstrokes", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls", "Partner"], instructions: "Redirect a cross-court feed down the line, using an earlier contact point and a squarer stance." },
      { name: "Approach Shot and Net Transition", skillType: "Groundstrokes", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls", "Partner"], instructions: "Hit a deep approach shot on the move and immediately close toward the net behind it." },
      { name: "High Ball / Moon Ball Handling", skillType: "Groundstrokes", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls", "Partner"], instructions: "Take a high-bouncing ball at shoulder height with a full, controlled swing rather than backing away from it." },
      // Serve
      { name: "Serve Toss Consistency", skillType: "Serve", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls"], instructions: "Release the ball from a straight, extended arm to the same spot on every toss, without spinning it." },
      { name: "Flat Serve Technique", skillType: "Serve", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls", "Net"], instructions: "Drive straight through contact at full extension for maximum pace with minimal spin." },
      { name: "Kick Serve Technique", skillType: "Serve", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls", "Net"], instructions: "Brush up and across the back of the ball to generate a high, kicking bounce off the second serve." },
      { name: "Slice Serve Technique", skillType: "Serve", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls", "Net"], instructions: "Brush across the side of the ball to curve the serve wide, pulling a returner off the court." },
      { name: "Second Serve Reliability Reps", skillType: "Serve", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls", "Net"], instructions: "Hit second serves exclusively, prioritizing a high make-percentage with real spin over first-serve power." },
      { name: "Serve Placement Targets", skillType: "Serve", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls", "Net", "Cones"], instructions: "Serve at marked targets in each service box to build precision to the body, T, and wide corners." },
      // Net Play
      { name: "Forehand Volley Technique", skillType: "Net Play", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls", "Partner"], instructions: "Punch through the volley with a short, firm stroke and minimal backswing, letting the incoming pace do the work." },
      { name: "Backhand Volley Technique", skillType: "Net Play", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls", "Partner"], instructions: "Lead with the racquet edge and punch through contact with a locked wrist and short stroke." },
      { name: "Overhead Smash Technique", skillType: "Net Play", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls", "Partner"], instructions: "Track a lob like a serve toss and drive through contact fully extended overhead." },
      { name: "Half-Volley Reps", skillType: "Net Play", sports: ["Tennis"], equipment: ["Tennis Racquet", "Balls", "Partner"], instructions: "Block a ball bouncing right at the feet with a short, controlled stroke immediately after the bounce." },
      { name: "Split Step Timing", skillType: "Footwork", sports: ["Tennis"], equipment: ["Partner"], instructions: "Land a small hop just as an opponent contacts the ball, loading the legs to explode toward the next shot." },
      { name: "Net Approach Footwork", skillType: "Footwork", sports: ["Tennis"], equipment: [], instructions: "Close toward the net in controlled, balanced steps rather than a flat-out sprint, staying ready to volley or cover a lob." },

      // ============ GOLF (~20) ============
      // Full Swing
      { name: "Full Swing - Driver", skillType: "Full Swing", sports: ["Golf"], equipment: ["Golf Clubs", "Balls"], instructions: "Build a wide, connected backswing and rotate through impact with the club face square to the target line." },
      { name: "Iron Ball-Striking Reps", skillType: "Full Swing", sports: ["Golf"], equipment: ["Golf Clubs", "Balls"], instructions: "Focus on ball-then-turf contact, hitting down and through the ball on a descending strike." },
      { name: "Tempo and Rhythm Drill", skillType: "Full Swing", sports: ["Golf"], equipment: ["Golf Clubs"], instructions: "Swing at 75% effort with an exaggerated pause at the top to build a consistent, unrushed tempo." },
      { name: "Draw/Fade Shot Shaping", skillType: "Full Swing", sports: ["Golf"], equipment: ["Golf Clubs", "Balls"], instructions: "Adjust the swing path and face angle at address to intentionally curve the ball's flight one direction." },
      { name: "Fairway Wood Reps", skillType: "Full Swing", sports: ["Golf"], equipment: ["Golf Clubs", "Balls"], instructions: "Sweep the ball off the turf with a shallower attack angle than an iron, staying level through the swing." },
      { name: "Punch Shot Under Trouble", skillType: "Full Swing", sports: ["Golf"], equipment: ["Golf Clubs", "Balls"], instructions: "Shorten the backswing and finish to keep the ball flight low, useful under branches or into the wind." },
      { name: "Alignment and Setup Fundamentals", skillType: "Full Swing", sports: ["Golf"], equipment: ["Golf Clubs"], instructions: "Check that the feet, hips, and shoulders are all square and parallel to the target line at address, every time." },
      // Short Game
      { name: "Chipping Technique", skillType: "Short Game", sports: ["Golf"], equipment: ["Golf Clubs", "Balls"], instructions: "Use a short, wrist-quiet stroke with weight favoring the front foot to get the ball rolling quickly on the green." },
      { name: "Pitch Shot Distance Control", skillType: "Short Game", sports: ["Golf"], equipment: ["Golf Clubs", "Balls"], instructions: "Vary backswing length while keeping tempo constant to dial in specific yardages with a lofted club." },
      { name: "Bunker Shot Technique", skillType: "Short Game", sports: ["Golf"], equipment: ["Golf Clubs", "Balls"], instructions: "Open the club face and strike the sand a couple inches behind the ball, letting the sand splash it out." },
      { name: "Flop Shot Technique", skillType: "Short Game", sports: ["Golf"], equipment: ["Golf Clubs", "Balls"], instructions: "Open the face wide and swing fully through to pop the ball high and soft over an obstacle." },
      { name: "Bump-and-Run Reps", skillType: "Short Game", sports: ["Golf"], equipment: ["Golf Clubs", "Balls"], instructions: "Use a lower-lofted club with a putting-style stroke to run the ball along the ground toward the hole." },
      { name: "Up-and-Down Pressure Reps", skillType: "Short Game", sports: ["Golf"], equipment: ["Golf Clubs", "Balls"], instructions: "Chip from a random spot around the green and putt out, tracking how often you get down in two." },
      // Putting
      { name: "Putting Stroke Fundamentals", skillType: "Putting", sports: ["Golf"], equipment: ["Golf Clubs", "Balls"], instructions: "Keep the stroke a simple pendulum from the shoulders, with the head and lower body completely still." },
      { name: "Distance Control Ladder Drill", skillType: "Putting", sports: ["Golf"], equipment: ["Golf Clubs", "Balls"], instructions: "Putt to progressively longer targets, matching stroke length to distance rather than changing the tempo." },
      { name: "Breaking Putt Reads", skillType: "Putting", sports: ["Golf"], equipment: ["Golf Clubs", "Balls"], instructions: "Read the slope from behind the ball and behind the hole before committing to a line and speed." },
      { name: "Short Pressure Putts", skillType: "Putting", sports: ["Golf"], equipment: ["Golf Clubs", "Balls"], instructions: "Make a set number of 3-foot putts in a row, starting over from zero on any miss to build pressure focus." },

      // ============ WRESTLING (~25) ============
      // Takedowns
      { name: "Single Leg Takedown", skillType: "Takedowns", sports: ["Wrestling"], equipment: ["Wrestling Mat", "Partner"], instructions: "Penetrate deep on a level change, securing the leg tight to the chest before finishing to either side." },
      { name: "Double Leg Takedown", skillType: "Takedowns", sports: ["Wrestling"], equipment: ["Wrestling Mat", "Partner"], instructions: "Shoot with a low level change, driving through both legs and finishing with the head up and hips low." },
      { name: "High Crotch Takedown", skillType: "Takedowns", sports: ["Wrestling"], equipment: ["Wrestling Mat", "Partner"], instructions: "Secure one leg high near the hip and use a lift or trip to finish the takedown." },
      { name: "Ankle Pick Technique", skillType: "Takedowns", sports: ["Wrestling"], equipment: ["Wrestling Mat", "Partner"], instructions: "Snap the head down to create an angle, then reach for the ankle on the same side as the opponent's weight." },
      { name: "Duck Under Takedown", skillType: "Takedowns", sports: ["Wrestling"], equipment: ["Wrestling Mat", "Partner"], instructions: "Duck the head and shoulder under a tied-up arm to get to the opponent's back before they can react." },
      { name: "Sprawl and Front Headlock", skillType: "Takedowns", sports: ["Wrestling"], equipment: ["Wrestling Mat", "Partner"], instructions: "Sprawl the hips back and down against a shot, then secure a front headlock as the opponent's head is exposed." },
      { name: "Fireman's Carry", skillType: "Takedowns", sports: ["Wrestling"], equipment: ["Wrestling Mat", "Partner"], instructions: "Duck under an arm and load the opponent across the shoulders before driving them down to their back." },
      { name: "Setup and Level Change Drilling", skillType: "Takedowns", sports: ["Wrestling"], equipment: ["Wrestling Mat", "Partner"], instructions: "Chain a hand-fighting setup directly into a level change and shot without a pause between the two." },
      // Escapes
      { name: "Stand-Up Escape", skillType: "Escapes", sports: ["Wrestling"], equipment: ["Wrestling Mat", "Partner"], instructions: "Post a hand and foot to drive up to a base, clearing the opponent's hands before standing fully." },
      { name: "Sit-Out Escape", skillType: "Escapes", sports: ["Wrestling"], equipment: ["Wrestling Mat", "Partner"], instructions: "Extend the legs forward and hip out to create separation, then turn in to face the opponent." },
      { name: "Switch Escape", skillType: "Escapes", sports: ["Wrestling"], equipment: ["Wrestling Mat", "Partner"], instructions: "Reach back for the far ankle while turning the hips through to reverse position underneath an opponent." },
      { name: "Granby Roll Escape", skillType: "Escapes", sports: ["Wrestling"], equipment: ["Wrestling Mat", "Partner"], instructions: "Roll over the near shoulder from a sit-out position to reverse an opponent trying to ride from behind." },
      // Par Terre / Positioning
      { name: "Top Position Riding Technique", skillType: "Par Terre", sports: ["Wrestling"], equipment: ["Wrestling Mat", "Partner"], instructions: "Control the near wrist and far ankle from the top position, keeping weight driving forward through the opponent's hips." },
      { name: "Half Nelson Turn", skillType: "Par Terre", sports: ["Wrestling"], equipment: ["Wrestling Mat", "Partner"], instructions: "Drive the arm under and across the opponent's far shoulder, using hip pressure to turn them toward their back." },
      { name: "Cradle Turn Technique", skillType: "Par Terre", sports: ["Wrestling"], equipment: ["Wrestling Mat", "Partner"], instructions: "Lock the head and near knee together and roll the opponent's shoulders toward the mat for back points." },
      { name: "Referee's Position Stance Drill", skillType: "Par Terre", sports: ["Wrestling"], equipment: ["Wrestling Mat"], instructions: "Build a strong, balanced base in the down or top starting position before the whistle, weight evenly distributed." },
      { name: "Defensive Base Building", skillType: "Par Terre", sports: ["Wrestling"], equipment: ["Wrestling Mat", "Partner"], instructions: "Widen the base and drop the hips against a top-position rider to prevent being turned or broken down flat." },
      { name: "Live Bottom Escape Series", skillType: "Escapes", sports: ["Wrestling"], equipment: ["Wrestling Mat", "Partner"], instructions: "Chain multiple escape attempts back-to-back against a live, resisting partner from the bottom position." },

      // ============ TRACK & FIELD (~25) ============
      // Sprint Mechanics
      { name: "Arm Swing Mechanics Drill", skillType: "Sprint Mechanics", sports: ["Track & Field"], equipment: [], instructions: "Drive the elbows back with relaxed hands at 90 degrees, keeping the swing forward-and-back, never crossing the body." },
      { name: "High Knee Drill", skillType: "Sprint Mechanics", sports: ["Track & Field"], equipment: [], instructions: "Drive the knee to hip height on each stride while maintaining a tall, upright posture and quick ground contact." },
      { name: "Butt Kick Drill", skillType: "Sprint Mechanics", sports: ["Track & Field"], equipment: [], instructions: "Snap the heel up toward the glute on each stride to build hamstring recovery speed in the sprint cycle." },
      { name: "A-Skip Drill", skillType: "Sprint Mechanics", sports: ["Track & Field"], equipment: [], instructions: "Skip while driving the knee up and punching the ground down and back, combining posture and ground contact cues in one drill." },
      { name: "Wicket Sprint Drill", skillType: "Sprint Mechanics", sports: ["Track & Field"], equipment: ["Cones"], instructions: "Sprint over a series of low, evenly spaced hurdles to enforce consistent stride length and shin angle." },
      { name: "Max Velocity Mechanics", skillType: "Sprint Mechanics", sports: ["Track & Field"], equipment: [], instructions: "Focus on tall posture, full extension, and minimal ground contact time during the top-speed phase of a sprint." },
      { name: "Deceleration Mechanics", skillType: "Sprint Mechanics", sports: ["Track & Field"], equipment: [], instructions: "Practice controlled deceleration after a sprint, lowering the hips and shortening the stride rather than stopping abruptly." },
      // Starts
      { name: "Block Start Setup", skillType: "Starts", sports: ["Track & Field"], equipment: ["Starting Blocks"], instructions: "Set the blocks to a comfortable, powerful angle and practice the 'set' position with hips slightly above the shoulders." },
      { name: "First Three Steps Drill", skillType: "Starts", sports: ["Track & Field"], equipment: ["Starting Blocks", "Stopwatch"], instructions: "Focus purely on the first three steps out of the blocks, driving low and powerful before standing up to sprint." },
      { name: "Reaction Time Starts", skillType: "Starts", sports: ["Track & Field"], equipment: ["Starting Blocks", "Stopwatch", "Partner"], instructions: "Practice exploding out of the blocks off an unpredictable audible start signal from a partner." },
      { name: "Standing Start Acceleration", skillType: "Starts", sports: ["Track & Field"], equipment: ["Stopwatch"], instructions: "Accelerate from a standing start with a strong forward lean and driving arms for the first 10-15 meters." },
      { name: "Falling Start Drill", skillType: "Starts", sports: ["Track & Field"], equipment: [], instructions: "Lean forward from a tall standing position until forced to catch yourself with a sprint step, building the feel of forward drive." },
      // Combine-style timed sprints -- unlike the rest of this Track & Field
      // block, these are cross-sport staples (the 40 is football's classic
      // combine number but shows up everywhere; the 60 is baseball/softball's
      // and indoor track's own standard; the 20 is the common first-step-
      // acceleration test, and its own "20yd" SPRINT_PRESETS entry already
      // existed in sprint-tracking.ts before this drill did -- no tracking
      // code to add, just the Skill Bank entry), so they're tagged broadly
      // rather than Track & Field-only. "Starts" skillType makes all three
      // automatically Sprint-Timing-eligible (see
      // SPRINT_TIMING_ELIGIBLE_SKILL_TYPES below) without needing a
      // name-list entry the way a Footwork-typed drill would.
      { name: "20-Yard Dash", skillType: "Starts", sports: ["Football", "Track & Field", "Baseball", "Softball", "Basketball", "Soccer", "Lacrosse", "Field Hockey"], equipment: ["Stopwatch"], instructions: "Sprint 20 yards from a three-point or standing start at maximum effort -- the standard combine benchmark for first-step acceleration." },
      { name: "40-Yard Dash", skillType: "Starts", sports: ["Football", "Track & Field", "Baseball", "Softball", "Basketball", "Soccer", "Lacrosse", "Field Hockey"], equipment: ["Stopwatch"], instructions: "Sprint 40 yards from a three-point or standing start at maximum effort -- the standard combine benchmark for straight-line speed." },
      { name: "60-Yard Dash", skillType: "Starts", sports: ["Baseball", "Softball", "Track & Field", "Football"], equipment: ["Stopwatch"], instructions: "Sprint 60 yards from a standing start at maximum effort -- the standard baseball/softball combine benchmark for top-end speed." },
      // Jumps & Throws
      { name: "Long Jump Approach and Takeoff", skillType: "Jumps & Throws", sports: ["Track & Field"], equipment: [], instructions: "Build a consistent, accelerating approach run to a precise takeoff board hit without checking stride length late." },
      { name: "High Jump Approach Curve", skillType: "Jumps & Throws", sports: ["Track & Field"], equipment: [], instructions: "Run a curved approach that leans the body inward, converting horizontal speed into vertical lift at takeoff." },
      { name: "Shot Put Glide Technique", skillType: "Jumps & Throws", sports: ["Track & Field"], equipment: [], instructions: "Drive across the ring in a low glide before extending explosively through the release, keeping the shot tucked to the neck." },
      { name: "Discus Spin Technique", skillType: "Jumps & Throws", sports: ["Track & Field"], equipment: [], instructions: "Build rotational speed through the spin while staying balanced over the middle of the ring, releasing at the front." },
      { name: "Javelin Approach and Release", skillType: "Jumps & Throws", sports: ["Track & Field"], equipment: [], instructions: "Build momentum through a crossover approach before a whip-like release driven by the hips and shoulder, not just the arm." },
      { name: "Pole Vault Plant and Takeoff", skillType: "Jumps & Throws", sports: ["Track & Field"], equipment: [], instructions: "Time the pole plant to the final stride and drive the takeoff knee upward to begin the swing-up phase." },
      { name: "Triple Jump Phase Transitions", skillType: "Jumps & Throws", sports: ["Track & Field"], equipment: [], instructions: "Work the hop-step-jump rhythm, keeping each phase balanced rather than sacrificing the final jump for a bigger hop." },
      { name: "Hurdle Trail Leg Technique", skillType: "Jumps & Throws", sports: ["Track & Field"], equipment: ["Cones"], instructions: "Snap the trail leg through tight and fast over the hurdle, minimizing time spent in the air over each barrier." },

      // ============ CROSS-SPORT: ATHLETIC FOOTWORK & AGILITY (~22) ============
      // Deliberate overlap -- the "bleed" the sport picker's accordion is
      // built to surface, since a lateral shuffle or deceleration drill is
      // genuinely the same skill whether it's trained for basketball,
      // soccer, or football.
      { name: "Lateral Shuffle Footwork", skillType: "Agility", sports: ["Basketball", "Football", "Soccer", "Tennis", "Volleyball"], equipment: [], instructions: "Shuffle laterally in an athletic stance without crossing the feet, staying low and quick over short distances." },
      { name: "Backpedal to Sprint Transition", skillType: "Agility", sports: ["Football", "Basketball", "Soccer"], equipment: [], instructions: "Backpedal under control, then plant and explode forward into a full sprint on a called cue." },
      { name: "5-10-5 Pro Agility Footwork", skillType: "Agility", sports: ["Football", "Basketball", "Soccer", "Ice Hockey", "Lacrosse"], equipment: ["Cones"], instructions: "Sprint 5 yards, plant and touch the line, sprint 10 yards the other way, plant, then sprint 5 yards back through the start." },
      { name: "T-Drill Change of Direction", skillType: "Agility", sports: ["Basketball", "Soccer", "Football", "Volleyball"], equipment: ["Cones"], instructions: "Sprint forward, shuffle laterally to each side, then backpedal to the start in a T-shaped pattern." },
      { name: "Mirror Drill - Reactive Footwork", skillType: "Agility", sports: ["Basketball", "Soccer", "Tennis", "Football"], equipment: ["Partner"], instructions: "Mirror a partner's random lateral and forward-backward movements as closely and quickly as possible." },
      { name: "Ladder Drill - Icky Shuffle", skillType: "Footwork", sports: ["Football", "Basketball", "Soccer", "Track & Field"], equipment: ["Agility Ladder"], instructions: "Move through the ladder alternating a two-step-per-box pattern, staying light and quick on the balls of the feet." },
      { name: "Ladder Drill - Lateral High Knees", skillType: "Footwork", sports: ["Football", "Basketball", "Soccer", "Ice Hockey"], equipment: ["Agility Ladder"], instructions: "Move sideways through the ladder driving the knees high with each step, staying square to the ladder throughout." },
      { name: "Cone Zig-Zag Sprint", skillType: "Agility", sports: ["Soccer", "Football", "Basketball", "Lacrosse", "Field Hockey"], equipment: ["Cones"], instructions: "Sprint a zig-zag path between staggered cones, planting hard and cutting at each one without rounding the turn." },
      { name: "Deceleration and Stick Landing", skillType: "Agility", sports: ["Basketball", "Soccer", "Football", "Volleyball", "Tennis"], equipment: [], instructions: "Sprint and decelerate to a dead stop within a set distance, landing balanced with the knees bent, not locked out." },
      { name: "Reactive Cone Touch Drill", skillType: "Agility", sports: ["Basketball", "Soccer", "Football", "Tennis"], equipment: ["Cones", "Partner"], instructions: "React to a partner pointing at one of several cones and sprint to touch it as fast as possible." },
      { name: "Carioca Footwork Drill", skillType: "Footwork", sports: ["Soccer", "Basketball", "Football", "Tennis"], equipment: [], instructions: "Cross the trail leg alternately in front of and behind the lead leg while moving laterally at speed." },
      { name: "Box Drill Agility", skillType: "Agility", sports: ["Football", "Basketball", "Soccer", "Ice Hockey"], equipment: ["Cones"], instructions: "Sprint, shuffle, backpedal, and shuffle again around the four corners of a square, changing movement pattern at each cone." },
      { name: "Reaction Ball Footwork", skillType: "Agility", sports: ["Basketball", "Soccer", "Tennis", "Football"], equipment: ["Medicine Ball", "Partner"], instructions: "React to an irregularly bouncing ball dropped by a partner, closing the distance with quick, controlled footwork." },
      { name: "Overhand Throwing Mechanics", skillType: "Throwing", sports: ["Baseball", "Softball", "Football", "Volleyball", "Water Polo"], equipment: ["Balls"], instructions: "Load the throwing arm high with the elbow above the shoulder and drive through a full hip-to-shoulder rotation on release." },
      { name: "Crossover Step Acceleration", skillType: "Agility", sports: ["Baseball", "Softball", "Football", "Basketball", "Tennis"], equipment: [], instructions: "Drive off a crossover first step to accelerate laterally, common to a fielder's first move, a defensive closeout, or a wide receiver's release." },
      { name: "Reactive Start Drill", skillType: "Agility", sports: ["Football", "Basketball", "Soccer", "Track & Field", "Baseball"], equipment: ["Partner"], instructions: "Explode from a stationary athletic position on an unpredictable visual or audio cue from a partner." },
      { name: "Single-Leg Balance and Stability", skillType: "Agility", sports: ["Soccer", "Basketball", "Ice Hockey", "Tennis", "Golf"], equipment: [], instructions: "Hold a single-leg balance position, adding a reach or perturbation once the base position is stable." },
      { name: "Hip Turn and Open-Gate Drill", skillType: "Footwork", sports: ["Football", "Basketball", "Baseball", "Softball"], equipment: [], instructions: "Rotate the hips open to sprint at an angle without crossing the feet, common to a defensive back's turn or an infielder's first move." },
      { name: "Multi-Directional Sprint Cone Drill", skillType: "Agility", sports: ["Soccer", "Football", "Lacrosse", "Field Hockey", "Ice Hockey"], equipment: ["Cones"], instructions: "Sprint to a randomly called cone in one of several directions, forcing a true reactive decision rather than a memorized pattern." },
      { name: "Approach Run Rhythm Drill", skillType: "Footwork", sports: ["Volleyball", "Track & Field", "Football"], equipment: ["Cones"], instructions: "Build a consistent, rhythmic multi-step approach into a jump or kick, common to a volleyball attack approach or a track jump." },
      { name: "Quick Feet In-Place Drill", skillType: "Footwork", sports: ["Basketball", "Football", "Boxing", "Tennis", "Soccer"], equipment: ["Agility Ladder"], instructions: "Rapidly alternate foot contacts in place for a set time, building the fast, light ground contact common across reactive sports." },
      { name: "Change of Pace Running", skillType: "Sprint Mechanics", sports: ["Football", "Soccer", "Track & Field", "Baseball", "Softball"], equipment: [], instructions: "Alternate between a controlled jog and a full sprint burst on a called cue, building the ability to change gears without losing form." },
    ];

    for (const drill of multiSportSkillDrills) {
      if (existingSkillNames.has(drill.name)) continue;
      await storage.createSkillExercise(skillLibraryOwner.id, {
        ...drill,
        videoUrl: skillVideoSearchUrl(drill.name),
      });
    }

    // Video-check eligibility default for skill drills: which ones a coach
    // can turn Sprint Timing or Mechanics tracking on for (see
    // SprintTrackingToggle/TrackingToggle client-side). Same cost-containment
    // rationale as the exercise videoEligible backfill above -- storage cost
    // scales with how many DISTINCT drills this is true for, not with
    // library size. Rule (skillType-driven, not a hand-picked name list,
    // since drills within a skillType are functionally interchangeable for
    // this purpose): a skillType with a real "correct form" a coach reviews
    // on camera is Mechanics-eligible; Agility/Starts and the timed-pattern
    // Footwork drills (ladder/cone/sprint, not positioning footwork) are
    // Sprint-Timing-eligible; everything else (reactive, positional,
    // continuous-flow, or contact-heavy) stays restricted.
    const MECHANICS_ELIGIBLE_SKILL_TYPES = new Set([
      "Hitting", "Pitching", "Throwing", "Fielding", "Catching", "Shooting",
      "Full Swing", "Groundstrokes", "Serve", "Serving", "QB Mechanics",
      "Kicking", "Sprint Mechanics", "Jumps & Throws", "Takedowns",
    ]);
    const SPRINT_TIMING_ELIGIBLE_SKILL_TYPES = new Set(["Agility", "Starts"]);
    const SPRINT_TIMING_ELIGIBLE_FOOTWORK_NAMES = new Set([
      "Approach Run Rhythm Drill", "Base Running - Turn at First", "Carioca Footwork Drill",
      "Crossover Step Drill", "First-Step Quickness Drill", "Home to First Sprint Drill",
      "Ladder Drill - Icky Shuffle", "Ladder Drill - Infield Feet", "Ladder Drill - Lateral High Knees",
      "Quick Feet In-Place Drill", "Rounding Bases Drill", "Steal Break Drill",
    ]);
    function isSkillVideoEligible(skillType: string, name: string): boolean {
      if (MECHANICS_ELIGIBLE_SKILL_TYPES.has(skillType)) return true;
      if (SPRINT_TIMING_ELIGIBLE_SKILL_TYPES.has(skillType)) return true;
      if (skillType === "Footwork" && SPRINT_TIMING_ELIGIBLE_FOOTWORK_NAMES.has(name)) return true;
      return false;
    }
    let skillVideoRestricted = 0;
    for (const existingSkill of await storage.getAllSkillExercises()) {
      // Nullable, not boolean-default -- only ever touches a row still at
      // null, so an admin's explicit edit always wins over a future reseed.
      if (existingSkill.videoEligible !== null) continue;
      if (isSkillVideoEligible(existingSkill.skillType, existingSkill.name)) continue;
      await storage.updateSkillExercise(existingSkill.id, { videoEligible: false });
      skillVideoRestricted++;
    }
    if (skillVideoRestricted > 0) {
      console.log(`Set videoEligible=false on ${skillVideoRestricted} skill drill(s) outside the camera-tracking-eligible set.`);
    }

    // Cross-sport Skill Bank paywall: which drills every Free Agent gets
    // free regardless of their signup sport (see
    // getVisibleSkillExercisesForFreeAgent and
    // SKILL_SPORT_UNLOCK_MONTHLY_PRICE_CENTS in shared/free-agent-tiers.ts).
    // This is exactly the CROSS-SPORT: ATHLETIC FOOTWORK & AGILITY block
    // seeded above -- a name list, not a sports.length-based inference,
    // since a future single-sport drill sharing the same skillType
    // shouldn't silently become free.
    const CROSS_SPORT_FREE_SKILL_NAMES = new Set([
      "Lateral Shuffle Footwork", "Backpedal to Sprint Transition", "5-10-5 Pro Agility Footwork",
      "T-Drill Change of Direction", "Mirror Drill - Reactive Footwork", "Ladder Drill - Icky Shuffle",
      "Ladder Drill - Lateral High Knees", "Cone Zig-Zag Sprint", "Deceleration and Stick Landing",
      "Reactive Cone Touch Drill", "Carioca Footwork Drill", "Box Drill Agility",
      "Reaction Ball Footwork", "Overhand Throwing Mechanics", "Crossover Step Acceleration",
      "Reactive Start Drill", "Single-Leg Balance and Stability", "Hip Turn and Open-Gate Drill",
      "Multi-Directional Sprint Cone Drill", "Approach Run Rhythm Drill", "Quick Feet In-Place Drill",
      "Change of Pace Running", "20-Yard Dash", "40-Yard Dash", "60-Yard Dash",
    ]);
    let skillCrossSportBackfilled = 0;
    for (const existingSkill of await storage.getAllSkillExercises()) {
      if (existingSkill.crossSportFree) continue;
      if (!CROSS_SPORT_FREE_SKILL_NAMES.has(existingSkill.name)) continue;
      await storage.updateSkillExercise(existingSkill.id, { crossSportFree: true });
      skillCrossSportBackfilled++;
    }
    if (skillCrossSportBackfilled > 0) {
      console.log(`Set crossSportFree=true on ${skillCrossSportBackfilled} cross-sport skill drill(s).`);
    }
  }

  // The platform's first paid, drip-content Class: "American Hitting -
  // Athletic Hitting Development Program", 8 chapters of original
  // instructional content (server/seed-data/american-hitting-content.ts)
  // over the Hitting skill drills seeded just above. isForgeOfficial
  // (owned by the admin, same as the Skill Bank/Coaches Corner above) --
  // available to every coach to assign, and the only kind of Class a Free
  // Agent (no coach) can ever see or enroll in. Chapter 1 is free; Chapter
  // 2 is the payment wall; Chapters 3-8 ride free once past it, since
  // paymentRequired is checked per-lesson (see recomputeClassProgress).
  // Every lesson keeps the "immediate" default unlock rule -- reachability
  // for lesson N+1 already requires lesson N's skillAssignmentId to exist,
  // which for a quiz-bearing lesson only happens once the athlete has read
  // it, passed its quiz, and tapped Add to Calendar (activateClassLesson);
  // a coach who wants to additionally force real practice reps or a
  // minimum wait between chapters can layer that on with their own
  // classCoachSettings pacing override without touching this content.
  let americanHittingClassId: number | undefined;
  {
    const classOwner = scott ?? demoAdmin;
    const AMERICAN_HITTING_CLASS_NAME = "American Hitting: Athletic Hitting Development Program";
    const existingClass = await db.query.classes.findFirst({
      where: and(eq(classes.name, AMERICAN_HITTING_CLASS_NAME), eq(classes.coachId, classOwner.id)),
    });
    americanHittingClassId = existingClass?.id;
    if (!existingClass) {
      const allSkills = await storage.getAllSkillExercises();
      const skillIdByName = new Map(allSkills.map((s) => [s.name, s.id]));
      function drillEx(name: string, orderIndex: number) {
        const skillExerciseId = skillIdByName.get(name);
        if (!skillExerciseId) {
          throw new Error(`American Hitting seed: missing skill exercise "${name}"`);
        }
        return {
          skillExerciseId,
          orderIndex,
          sets: 3,
          reps: "10",
          restSeconds: null,
          notes: null,
          trackingLevel: americanHittingTrackingLevel(name),
        };
      }

      const CHAPTER_DRILLS: Record<number, string[]> = {
        1: ["Athletic Stance Hold", "Tee Work - Inside Pitch", "Tee Work - Outside Pitch"],
        2: [
          "Athletic Stance Hold",
          "Stance-to-Load Walkthrough",
          "Ground Force Hop-to-Stance Drill",
          "Posture Line Drill",
        ],
        3: [
          "Colored-Ball Recognition Drill",
          "Front Toss Recognition Drill",
          "Velocity Variation Round",
          "Take/Swing Decision Drill",
          "Ball/Strike Recognition Drill",
        ],
        4: [
          "Pause-and-Go Load Drill",
          "Timing-Window Toss Drill",
          "Rhythm-to-Launch Drill",
          "Variable-Speed Batting Practice",
          "Two-Speed Front Toss Drill",
        ],
        5: [
          "Rotational Med Ball Scoop Throw",
          "Standing Rotational Med Ball Throw",
          "Resisted Rotation Drill",
          "Bat Speed Overload/Underload Rounds",
          "Max-Intent Tee Rounds",
        ],
        6: [
          "Contact Point Drill",
          "Tee Work - Inside Pitch",
          "Tee Work - Outside Pitch",
          "High Tee Drill (Top Hand Path)",
          "Opposite Field Hitting Drill",
        ],
        7: [
          "Fastball/Changeup Recognition Rounds",
          "Random Pitch Sequence Drill",
          "Breaking Ball Recognition Drill",
          "Two-Strike Approach Drill",
          "Competitive At-Bat Simulation",
        ],
        8: ["Live Batting Practice", "Max-Intent Tee Rounds"],
      };

      const structure = classStructureSchema.parse({
        name: AMERICAN_HITTING_CLASS_NAME,
        description:
          "Develop the athlete. Educate the hitter. Build the competitor. An 8-chapter athletic hitting development program teaching baseball and softball players to understand their swing, track and decide on pitches, and become complete, adjustable hitters -- not just memorize mechanical positions.",
        lessons: AMERICAN_HITTING_CHAPTERS.map((chapter) => ({
          lessonNumber: chapter.lessonNumber,
          title: chapter.title,
          description: chapter.description,
          unlockRule: "immediate" as const,
          unlockThreshold: null,
          priceCents: chapter.lessonNumber === 2 ? 4999 : null,
          exercises: (CHAPTER_DRILLS[chapter.lessonNumber] ?? []).map((name, i) => drillEx(name, i)),
          content: chapter.content,
          quizQuestions: chapter.quizQuestions,
        })),
      });

      const created = await storage.createClassWithStructure(classOwner.id, structure, true);
      americanHittingClassId = created.id;
      // createClassWithStructure always starts a class as a private draft
      // (see Batch N's "build in private, publish when ready" design) --
      // this is the platform's real, live, for-sale flagship Class, so
      // publish it immediately rather than leaving it invisible to every
      // Free Agent and coach until someone remembers to flip it by hand.
      await db.update(classes).set({ isDraft: false }).where(eq(classes.id, created.id));
      console.log(`Seeded "${AMERICAN_HITTING_CLASS_NAME}" class.`);
    }
  }

  // One-time (idempotent) correction: the class as originally seeded gave
  // every drill trackingLevel "none", which left every American Hitting
  // lesson entirely un-loggable -- see americanHittingTrackingLevel's own
  // comment. Updates trackingLevel IN PLACE on the existing
  // skillProgramExercises rows rather than going through
  // updateClassStructure's wipe-and-rebuild path, which would cascade-
  // delete any skillSessionLogs an athlete has already captured against
  // those exercise ids (see the onDelete: "cascade" FKs on
  // skillSessionLogs.skillProgramDayId/skillProgramExerciseId).
  if (americanHittingClassId != null) {
    const lessonsWithDrills = await db.query.classLessons.findMany({
      where: eq(classLessons.classId, americanHittingClassId),
      with: {
        skillProgram: {
          with: {
            weeks: { with: { days: { with: { exercises: { with: { skillExercise: true } } } } } },
          },
        },
      },
    });
    for (const lesson of lessonsWithDrills) {
      const day = lesson.skillProgram.weeks[0]?.days[0];
      if (!day) continue;
      for (const ex of day.exercises) {
        const desired = americanHittingTrackingLevel(ex.skillExercise.name);
        if (ex.trackingLevel !== desired) {
          await db
            .update(skillProgramExercises)
            .set({ trackingLevel: desired })
            .where(eq(skillProgramExercises.id, ex.id));
        }
      }
    }
  }

  // Keeps each lesson's reading content (pages, videos, diagrams) in sync
  // with AMERICAN_HITTING_CHAPTERS on every deploy -- safe to just overwrite
  // in place, unlike the drill/exercise tree above, since `content` is a
  // plain JSON column on classLessons itself with nothing else keyed off
  // its shape (no session logs or ids reference it).
  if (americanHittingClassId != null) {
    const lessons = await db.query.classLessons.findMany({
      where: eq(classLessons.classId, americanHittingClassId),
      orderBy: asc(classLessons.lessonNumber),
    });
    for (const lesson of lessons) {
      const chapter = AMERICAN_HITTING_CHAPTERS.find((c) => c.lessonNumber === lesson.lessonNumber);
      if (!chapter) continue;
      await db.update(classLessons).set({ content: chapter.content }).where(eq(classLessons.id, lesson.id));
    }
  }

  // Keeps each lesson's quiz in sync with AMERICAN_HITTING_CHAPTERS on every
  // deploy too -- quiz questions are otherwise only ever created once, at
  // initial class creation, so a content edit (e.g. trimming question count)
  // would never reach an already-created class. Safe to wipe and rebuild:
  // deleting a question cascades its answers, and nothing else references
  // quiz question/answer ids -- results are graded live, with only the
  // pass/fail timestamp persisted on classLessonProgress.
  if (americanHittingClassId != null) {
    const lessons = await db.query.classLessons.findMany({
      where: eq(classLessons.classId, americanHittingClassId),
      orderBy: asc(classLessons.lessonNumber),
    });
    for (const lesson of lessons) {
      const chapter = AMERICAN_HITTING_CHAPTERS.find((c) => c.lessonNumber === lesson.lessonNumber);
      if (!chapter) continue;
      await db.delete(classLessonQuizQuestions).where(eq(classLessonQuizQuestions.classLessonId, lesson.id));
      for (const q of chapter.quizQuestions) {
        const [question] = await db
          .insert(classLessonQuizQuestions)
          .values({ classLessonId: lesson.id, orderIndex: q.orderIndex, questionText: q.questionText })
          .returning();
        await db.insert(classLessonQuizAnswers).values(
          q.answers.map((a) => ({
            questionId: question.id,
            orderIndex: a.orderIndex,
            answerText: a.answerText,
            isCorrect: a.isCorrect,
            explanation: a.explanation,
          })),
        );
      }
    }
  }

  // Demo Free Agent gets full, ungated access to the American Hitting
  // class -- every lesson active on their calendar, no payment/content/
  // quiz gate in the way, so the class is fully explorable without having
  // to click/read/quiz through all 8 chapters first. Idempotent (see
  // grantFullClassAccessToAthlete) -- re-running this seed never resets an
  // athlete's real progress, it just tops up anything not yet active.
  if (americanHittingClassId != null) {
    await storage.grantFullClassAccessToAthlete(freeAgent.id, americanHittingClassId);
  }

  // Coaches Corner: admin-authored coach education, seeded once and matched
  // by title (system-wide, not owner-scoped -- there's no per-coach
  // ownership concept here at all, see academyTracks in shared/schema.ts).
  {
    const existingTracks = await storage.getAllAcademyTracks();
    const existingTrackIdByTitle = new Map(existingTracks.map((t) => [t.title, t.id]));

    const seedAcademyTracks: Array<{
      title: string;
      description: string;
      keyPrinciplesForAi: string;
      lessons: Array<{ lessonNumber: number; title: string; content: string; estMinutes: number }>;
      quizQuestions: Array<{
        orderIndex: number;
        questionText: string;
        answers: Array<{ orderIndex: number; answerText: string; isCorrect: boolean; explanation: string }>;
      }>;
    }> = [
      {
        title: "Strength & Conditioning Fundamentals",
        description:
          "The core program-design knowledge every strength coach should have: exercise sequencing, progressive overload, periodization models, and safe testing protocols.",
        keyPrinciplesForAi:
          "When advising on training structure, apply core program-design principles: sequence exercises multi-joint/power before single-joint/isolation within a session, respect the inverse relationship between volume and intensity (don't max both at once), and progress load conservatively using autoregulation (RPE/RIR) rather than fixed percentage jumps every week. Recommend safe, standardized testing/assessment protocols appropriate to the athlete's training age, and favor direct 1RM testing only for athletes with sufficient technical proficiency -- otherwise use an estimated max from a submaximal set.",
        lessons: [
          {
            lessonNumber: 1,
            title: "Program Design: The Big Picture",
            estMinutes: 6,
            content:
              "Every effective strength program answers three questions before a single set is written: what is this athlete training for, how much can they currently recover from, and how will the plan change over time to keep producing adaptation. Skipping straight to picking exercises is the most common mistake a new coach makes -- the exercises are the last decision, not the first.\n\nStart with exercise order within a session. The general rule is to sequence from the most technically demanding and neurologically taxing movements to the least: power/explosive work (jumps, throws, Olympic-lift variations) first, followed by primary strength lifts (squat, deadlift, press patterns), then accessory and isolation work, finishing with low-skill conditioning or corrective work. The reasoning is simple -- an athlete's technical precision and rate of force development are both highest when fresh, and a movement like a box jump or a clean pull deteriorates fast (and becomes a real injury risk) under fatigue in a way a bicep curl simply doesn't.\n\nNext, understand the volume-intensity relationship: as intensity (load relative to a max, or generally how hard a set is) goes up, the volume (total sets x reps, or total reps at that intensity) an athlete can sustain goes down. A program that tries to push both high volume and high intensity at the same time, every week, is a program that breaks athletes down faster than it builds them up. Good programs wave one against the other -- a high-volume, moderate-intensity block followed by a lower-volume, higher-intensity block is a common, effective pattern.\n\nFinally, plan for change over time. A program that looks identical in week 8 as it did in week 1 has no mechanism left to keep producing adaptation -- the body has already adapted to that exact stimulus. This doesn't mean constant novelty for its own sake (a common youth-coaching mistake); it means a deliberate, gradual progression in load, volume, or complexity, planned in advance rather than improvised set-to-set.",
          },
          {
            lessonNumber: 2,
            title: "Progressive Overload & Autoregulation",
            estMinutes: 6,
            content:
              "Progressive overload -- gradually increasing the demand placed on the body over time -- is the single most important variable in a strength program. Without it, an athlete plateaus almost immediately, regardless of how well-designed everything else is. But progressive overload done carelessly (adding weight on a fixed schedule regardless of how the athlete is actually responding) is exactly how programs cause overuse injuries and burnout.\n\nThe fix is autoregulation: letting the athlete's actual daily readiness adjust the plan within a bounded range, instead of forcing a fixed number every session no matter what. The most practical tool for this is RPE (Rate of Perceived Exertion) or its inverse, RIR (Reps in Reserve) -- after a set, the athlete rates how hard it felt. A \"top set at RPE 8\" means the athlete could have done roughly 2 more reps before failure; that's a very different, more honest target than \"225 lbs for 5,\" which might be an RPE 6 on a good day and an RPE 10 on a bad one.\n\nFor youth or novice athletes, full RPE-based autoregulation can be too abstract at first -- a simpler entry point is a basic self-check: \"Could you have done 2 more good reps with the same form?\" If yes, they're in a reasonable working range; if the last rep looked nothing like the first, the weight was too heavy for the intended purpose.\n\nThe practical rule of thumb: plan the program's structure in advance, but let RPE/RIR govern the exact load on the bar each session. This gives you the best of both worlds -- a program with real direction, but one that still respects a bad night's sleep or a hard practice the day before, rather than blindly forcing a number that was written weeks in advance without knowing how today would actually feel.",
          },
          {
            lessonNumber: 3,
            title: "Periodization Models",
            estMinutes: 7,
            content:
              "Periodization is simply the deliberate, planned variation of training variables (volume, intensity, exercise selection) over time, structured around when an athlete needs to peak. Three models cover almost every real-world situation a team-sport coach will run into.\n\nLinear periodization moves in one direction over a training block: volume starts high and intensity low, then volume gradually decreases as intensity gradually increases, aiming at a single peak. This works well for an off-season block building toward a defined testing day or season start, where there's no in-season competition to interrupt the progression.\n\nUndulating (or non-linear) periodization varies volume and intensity from session to session or week to week, rather than one long ramp. This suits athletes who train frequently and need more varied stimulus to keep adapting, and it tolerates a disrupted schedule better than a strict linear ramp does, since missing one session doesn't derail a months-long progression.\n\nBlock periodization groups training into short, concentrated blocks each targeting one or two qualities hard (a hypertrophy/volume block, then a strength/intensity block, then a short power/peaking block) rather than trying to develop everything at once. This tends to produce the sharpest peaks and suits athletes who already have a solid training base and a clear, single peak event to build toward.\n\nFor a team sport with a long in-season competitive calendar, the practical answer is usually a hybrid: an off-season block that's more linear or block-style building a base, transitioning to an undulating in-season model that can flex around the game schedule without demanding a rigid multi-week ramp the season won't allow.",
          },
          {
            lessonNumber: 4,
            title: "Assessment & Testing Protocols",
            estMinutes: 6,
            content:
              "Testing tells you whether the program is actually working and gives athletes concrete, motivating feedback -- but testing done poorly can waste a training day, produce meaningless numbers, or genuinely hurt someone. A few principles keep it useful and safe.\n\nStandardize the conditions. The same warm-up, the same order of tests, the same equipment, and ideally the same time of day and rest since the last hard session, every time you test. An athlete's numbers can swing meaningfully based on fatigue alone -- if you don't control for that, you can't tell whether a number changed because of training or because of when you happened to test.\n\nMatch the test to the athlete's training age. A true 1-rep max test requires enough technical proficiency that a breakdown in form under maximal load doesn't turn into an injury -- this generally means a novice lifter (especially a younger one) should use an estimated max from a submaximal set rather than testing an actual 1RM. Reserve true 1RM testing for athletes who have already demonstrated clean technique under heavy, but sub-maximal, load.\n\nTest what you'll actually use. A focused set -- something from each of speed, power, and strength, plus anything sport-specific -- is usually enough to track real trends without turning a testing day into an all-day event.\n\nFinally, set a retest cadence you'll actually keep. Every 6-8 weeks, aligned with the end of a training block, is a reasonable default for most team-sport programs.",
          },
        ],
        quizQuestions: [
          {
            orderIndex: 0,
            questionText: "Within a single training session, which exercise sequencing is generally recommended?",
            answers: [
              {
                orderIndex: 0,
                answerText: "Power/explosive work first, then primary strength lifts, then accessory work",
                isCorrect: true,
                explanation: "This is correct: technical precision and rate of force development are highest when fresh, so the most neurologically demanding work (jumps, throws, Olympic-lift variations) should come first, before fatigue makes those movements riskier and less effective.",
              },
              {
                orderIndex: 1,
                answerText: "Accessory work first to pre-fatigue the muscle before the main lift",
                isCorrect: false,
                explanation: "This is a valid bodybuilding technique in some contexts, but it's backwards for general athletic development -- pre-fatiguing before a power or primary strength movement increases injury risk and reduces the quality of the most important work in the session.",
              },
              {
                orderIndex: 2,
                answerText: "Whatever the athlete feels like starting with that day",
                isCorrect: false,
                explanation: "Random ordering ignores the real physiological reasoning behind sequencing -- technical, high-skill movements need to happen while the nervous system is freshest, not whenever it's convenient.",
              },
              {
                orderIndex: 3,
                answerText: "Conditioning first to get the 'hard part' out of the way",
                isCorrect: false,
                explanation: "Conditioning first fatigues the athlete before the technical strength and power work, which is exactly backwards -- it increases injury risk on lifts that need the most precision.",
              },
            ],
          },
          {
            orderIndex: 1,
            questionText: "What does \"RPE 8\" on a top set generally mean?",
            answers: [
              {
                orderIndex: 0,
                answerText: "The athlete could have done roughly 2 more reps before failure",
                isCorrect: true,
                explanation: "Correct -- RPE (Rate of Perceived Exertion) on a 1-10 scale directly maps to reps in reserve; an 8 means about 2 reps were left, a more honest target than a fixed weight number.",
              },
              {
                orderIndex: 1,
                answerText: "The athlete hit an exact percentage of their 1-rep max",
                isCorrect: false,
                explanation: "RPE is about how the set actually felt, not a fixed percentage -- the whole point of autoregulation is that the same percentage can feel very different depending on the day.",
              },
              {
                orderIndex: 2,
                answerText: "The set was a warm-up set",
                isCorrect: false,
                explanation: "RPE 8 describes a genuinely hard working set, not a warm-up -- warm-ups are typically well below this effort level.",
              },
              {
                orderIndex: 3,
                answerText: "The athlete failed to complete the set",
                isCorrect: false,
                explanation: "Failure would be RPE 10 -- RPE 8 specifically means reps were left in reserve, not that the set broke down.",
              },
            ],
          },
          {
            orderIndex: 2,
            questionText: "Which periodization model is generally best suited to a long in-season competitive calendar?",
            answers: [
              {
                orderIndex: 0,
                answerText: "A hybrid: base-building block/linear off-season transitioning to undulating in-season",
                isCorrect: true,
                explanation: "Correct -- build a base when there's no competition to interrupt a longer ramp, then switch to a model that can flex week-to-week around games.",
              },
              {
                orderIndex: 1,
                answerText: "Pure linear periodization straight through the whole year",
                isCorrect: false,
                explanation: "A strict linear ramp assumes an uninterrupted progression toward one peak, which a long in-season game schedule won't allow -- games and travel will constantly disrupt it.",
              },
              {
                orderIndex: 2,
                answerText: "No periodization -- keep training identical year-round",
                isCorrect: false,
                explanation: "Identical training year-round has no mechanism to keep producing adaptation, and ignores that off-season and in-season have fundamentally different goals.",
              },
              {
                orderIndex: 3,
                answerText: "Block periodization exclusively, with no adjustment for the season",
                isCorrect: false,
                explanation: "Block periodization's short, single-quality-focused blocks work best building toward one clear peak -- a season with games happening constantly doesn't offer that clean, uninterrupted structure.",
              },
            ],
          },
        ],
      },
      {
        title: "Olympic Lift Technique & Progressions",
        description:
          "Teaching progressions for the snatch and clean & jerk, from safe starting positions through the full lift, plus the most common faults and the cues that fix them.",
        keyPrinciplesForAi:
          "Olympic lifts (snatch, clean & jerk) build rate of force development and explosive power, but require a coached technical progression -- never recommend a novice or young athlete jump straight to a full lift from the floor; teach from the hang/high-hang and power positions first, and only add the full pull once positions are clean. If asked about faults, the most common are an early arm pull, a looping bar path away from the body, and the knees drifting forward on the catch -- correct with cues, not just more weight.",
        lessons: [
          {
            lessonNumber: 1,
            title: "Why Olympic Lifts? Benefits and Risks",
            estMinutes: 5,
            content:
              "The snatch and clean & jerk (and their many partial variations -- hang cleans, power snatches, clean pulls) are, from a sports-performance standpoint, the highest rate-of-force-development exercises available in a weight room. Nothing else trains an athlete to produce large amounts of force in a very short amount of time as directly as these lifts do, which is exactly the quality that shows up in a sprint start, a jump, or a swing.\n\nThat benefit comes with real technical demand. These are the most technically complex lifts a strength coach will teach -- more joints, more sequencing, and more room for a fault to compound than a squat or a bench press. The risk isn't the load on the bar (Olympic lifts are almost always programmed at a lower relative intensity than a squat or deadlift); the risk is a technical breakdown under any load turning into an awkward catch or a lost bar.\n\nThis means the honest answer to \"should I be teaching these?\" depends entirely on whether you can actually coach the technique. If you don't have that background yet, partial and regression versions still deliver most of the power-development benefit with a fraction of the technical risk, and are a completely legitimate place to stop. There's no rule that says a team has to work up to a full competition snatch from the floor.\n\nFor younger or newer athletes specifically, the value of Olympic lifts is less about the lift itself and more about what it teaches: triple extension, catching/absorbing force, and general explosiveness. A well-coached regression that teaches those things safely is a better outcome than a poorly-coached full lift that technically \"counts.\"",
          },
          {
            lessonNumber: 2,
            title: "The Progression Ladder: From Hang to Floor",
            estMinutes: 6,
            content:
              "Never start a new athlete with the full lift from the floor. The standard teaching progression works backward from the easiest position to the hardest, building each position's technique in isolation before combining them.\n\nStart at the power position (bar at mid-thigh, knees slightly bent, torso near vertical) -- this isolates the explosive hip/knee/ankle extension without any of the first-pull complexity of getting the bar off the floor. An athlete drills jumping/shrugging from here with an empty bar or light load until the extension is crisp and vertical, not looping forward.\n\nNext, move to the high hang and then the hang (knee height), each adding a little more of the first pull. Only once these positions look consistently good should you add the full hang-to-floor pull, and even then, many programs simply stay at hang or high-hang variations indefinitely -- again, there's no rule requiring the full lift.\n\nThroughout this whole ladder, the catch position (front rack for the clean, overhead for the snatch) should be drilled completely separately, usually starting from a static position before ever combining it with a pull. Trying to teach the pull and the catch simultaneously on a brand-new athlete is how you get the most common fault of all: an athlete who pulls with the arms early to \"save\" a bad catch position.\n\nA practical rule: an athlete graduates to the next position in the ladder only when the current one is clean and repeatable under a light training load, not on a fixed calendar schedule.",
          },
          {
            lessonNumber: 3,
            title: "Clean & Jerk Teaching Progressions",
            estMinutes: 6,
            content:
              "The clean and the jerk are two separate lifts that happen to be contested together, and they should be taught that way -- as two distinct skills, not one continuous motion, until both are independently solid.\n\nFor the clean, the front rack position is the foundation everything else depends on: elbows up and pointed forward, bar resting on the front deltoids, fingertips loose under the bar. An athlete who can't hold a comfortable front rack with an empty bar has no business catching a loaded clean -- spend real time here first, including mobility work for athletes who physically can't get the elbows up yet.\n\nOnce the front rack is solid, drill the catch in isolation using a muscle clean and then a power clean (catching above parallel) before ever asking for a full squat clean. This lets the athlete feel a clean catch position repeatedly at low technical risk before adding the extra complexity of dropping under a fast-moving bar into a full squat.\n\nFor the jerk, footwork is the whole lesson: a short, quick split with the front foot flat and the back foot up on the ball, torso staying vertical through the dip. The most common jerk fault in beginners is diving forward instead of driving straight up -- a simple fix is drilling the footwork pattern with no bar at all, dozens of times, before ever loading it.",
          },
          {
            lessonNumber: 4,
            title: "Common Faults and Coaching Cues",
            estMinutes: 6,
            content:
              "Three faults account for the large majority of technical breakdowns in Olympic lift coaching, and each has a specific, repeatable cue that fixes it faster than simply saying \"do it again.\"\n\nEarly arm pull: the athlete starts bending the elbows and pulling with the arms before full leg/hip extension is complete, which short-circuits the power output of the lift and usually means the bar path drifts away from the body. Cue: \"long arms until your hips are open\" or \"jump the bar up, don't pull it up\" -- have the athlete feel the extension as a jump first, arms staying passive until the very top.\n\nLooping bar path: instead of traveling in a tight, near-vertical line close to the body, the bar swings out and away during the first pull, then has to loop back in. This is very often actually a hip/torso positioning issue, not an arm issue: the athlete is starting with hips too high. Cue: \"keep the bar brushing your thighs,\" combined with checking the starting hip height.\n\nForward knee travel on the catch: in the receiving position, the knees drift forward past the toes and the torso collapses forward to compensate. This is frequently a mobility limitation as much as a cueing issue, so pair the verbal cue -- \"sit back into your heels, chest tall\" -- with an honest mobility screen; cueing alone won't fix a genuine range-of-motion restriction.",
          },
        ],
        quizQuestions: [
          {
            orderIndex: 0,
            questionText: "What's the recommended starting point for teaching a brand-new athlete an Olympic lift?",
            answers: [
              {
                orderIndex: 0,
                answerText: "The power position, isolating the final explosive extension",
                isCorrect: true,
                explanation: "Correct -- starting at the power position lets the athlete groove the actual explosive extension without the added complexity of the first pull off the floor.",
              },
              {
                orderIndex: 1,
                answerText: "A full competition snatch from the floor, to learn the whole lift at once",
                isCorrect: false,
                explanation: "This is specifically what the progression is designed to avoid -- combining the hardest first-pull mechanics with the hardest catch position on day one is how technical breakdowns and injuries happen.",
              },
              {
                orderIndex: 2,
                answerText: "The catch position under maximum load, to build confidence",
                isCorrect: false,
                explanation: "Catching under heavy load before the position is proven safe under light load is backwards -- the catch should be drilled statically and lightly first.",
              },
              {
                orderIndex: 3,
                answerText: "Whichever position the athlete finds most comfortable",
                isCorrect: false,
                explanation: "Comfort isn't the criterion here -- the progression exists because certain positions are objectively safer starting points regardless of preference.",
              },
            ],
          },
          {
            orderIndex: 1,
            questionText: "An athlete's bar path loops away from the body during the first pull. What's the most likely underlying cause?",
            answers: [
              {
                orderIndex: 0,
                answerText: "Starting the pull with hips too high, more like a stiff-leg deadlift",
                isCorrect: true,
                explanation: "Correct -- a looping bar path is very often a hip-height problem at the start, not an arm problem; cueing \"keep the bar brushing your thighs\" alongside checking starting hip height addresses the root cause.",
              },
              {
                orderIndex: 1,
                answerText: "The athlete is using too little weight",
                isCorrect: false,
                explanation: "Bar path problems are technical, not load-related -- adding weight to a looping pull just makes the flawed pattern more dangerous, not more correct.",
              },
              {
                orderIndex: 2,
                answerText: "The athlete's grip width is too narrow",
                isCorrect: false,
                explanation: "Grip width affects the catch position, not the pull's bar path -- this isn't the relevant variable for this fault.",
              },
              {
                orderIndex: 3,
                answerText: "The athlete needs to pull with the arms earlier",
                isCorrect: false,
                explanation: "This is the opposite of the fix -- pulling with the arms earlier is itself a separate major fault (early arm pull) and doesn't address a looping bar path.",
              },
            ],
          },
          {
            orderIndex: 2,
            questionText: "Why might a coach choose to never progress a team past hang or high-hang variations?",
            answers: [
              {
                orderIndex: 0,
                answerText: "Because most of the power-development benefit is available without the added technical risk of a full floor pull",
                isCorrect: true,
                explanation: "Correct -- the value of Olympic lifts for most athletes is the triple extension and force development, which hang/high-hang variations already deliver, at lower technical risk than the full lift.",
              },
              {
                orderIndex: 1,
                answerText: "Because the full lift is against competition rules for team sports",
                isCorrect: false,
                explanation: "There's no such rule -- this isn't a regulatory issue, it's a risk/benefit and coaching-capacity decision.",
              },
              {
                orderIndex: 2,
                answerText: "Because hang variations use heavier loads and are therefore superior",
                isCorrect: false,
                explanation: "Hang variations are not about using heavier loads -- the reasoning is about reducing technical complexity, not increasing load.",
              },
              {
                orderIndex: 3,
                answerText: "Because full-lift Olympic lifts don't build explosive power",
                isCorrect: false,
                explanation: "Full Olympic lifts absolutely build explosive power -- the reason to stop at a partial isn't that the full lift lacks benefit, it's managing technical risk relative to coaching resources.",
              },
            ],
          },
        ],
      },
      {
        title: "Youth Long-Term Athletic Development (LTAD)",
        description:
          "Why youth training isn't scaled-down adult training, the real cost of early specialization, and how to structure a season around a young athlete's actual development.",
        keyPrinciplesForAi:
          "Youth athletes are not small adults -- never recommend adult-scaled training volume or intensity for a pre-pubertal or early-pubertal athlete. Actively discourage single-sport early specialization when asked about it, and frame long-term development around broad motor-skill and movement competency rather than early peak performance or maximal loading at a young age.",
        lessons: [
          {
            lessonNumber: 1,
            title: "Why Youth Training Is Not Mini-Adult Training",
            estMinutes: 5,
            content:
              "The single biggest mistake in youth strength and conditioning is scaling down an adult program rather than building a genuinely different one. Kids are not just smaller, weaker adults -- their bones, recovery capacity, and motor-learning systems work differently, and a program that ignores those differences either underdelivers or actively causes harm.\n\nGrowth plates are open until roughly the late teens and are structurally weaker than mature bone at the same location. This doesn't mean strength training is dangerous for youth -- well-supervised resistance training is well-supported as safe and beneficial at essentially any age -- but it does mean technique and appropriate loading matter more, not less.\n\nRecovery capacity also differs, generally in the athlete's favor: pre-pubertal athletes typically recover from a single training session faster than adults do, which is part of why frequent, shorter sessions with lots of varied movement tend to work better than the longer, more concentrated sessions that suit an adult. But this doesn't mean unlimited volume is fine -- overuse injuries are a real and growing problem in youth sports specifically because total volume across multiple teams/seasons goes unmanaged.\n\nFinally, motor learning in youth athletes is generally faster and more durable for genuinely new movement patterns than it is in adults -- which is the entire argument for prioritizing broad movement skill over narrow, sport-specific repetition at a young age.",
          },
          {
            lessonNumber: 2,
            title: "The Danger of Early Specialization",
            estMinutes: 6,
            content:
              "Early specialization -- a young athlete playing one sport nearly year-round, often starting before age 10-12 -- has become common in competitive youth sports. The evidence points toward real costs rather than the promised advantage.\n\nOn the injury side, early specialization is consistently associated with higher rates of overuse injury compared to multi-sport participation at the same age: the same joints and tissues are stressed in the same patterns in every practice, every season, with no genuine variation to distribute the load differently.\n\nOn the burnout side, athletes who specialize early report higher rates of dropping out of sport entirely by their late teens -- the same intensity meant to build a long-term athlete often produces the opposite.\n\nOn performance itself, the research on eventual elite athletes is notably one-sided: the large majority of athletes who reach the highest levels of their sport were multi-sport participants through at least early adolescence. Broad athleticism built across multiple sports tends to produce a more well-rounded, more resilient, and often ultimately more skilled athlete than the same total hours spent in one sport alone.\n\nNone of this means single-sport participation is never appropriate -- by mid-to-late adolescence, with the athlete's own genuine interest driving it, specializing makes sense. The concern is specifically early, externally-driven specialization.",
          },
          {
            lessonNumber: 3,
            title: "Windows of Trainability",
            estMinutes: 6,
            content:
              "Certain physical qualities appear to be more responsive to training at certain points in a young athlete's development -- often discussed as \"windows of trainability,\" most notably linked to Peak Height Velocity (PHV), the point of fastest growth during a growth spurt.\n\nBefore PHV, general coordination, balance, and basic speed/agility tend to be highly trainable -- this is the window where broad motor-skill work pays the largest long-term dividends, since the nervous system is laying down fundamental movement patterns that will be built on for the rest of the athlete's career.\n\nAround and shortly after PHV, athletes often go through a temporary period of reduced coordination -- limbs have grown but the nervous system hasn't fully re-calibrated to the new lever lengths yet. This is a normal, temporary phase, not a regression in ability. It's also a window where strength training tends to become highly responsive, as the athlete's hormonal environment shifts to support it.\n\nAfter PHV, once growth has largely leveled off, this is generally the window where strength and power training produce the most direct, adult-like adaptations.\n\nThe practical takeaway isn't to rigidly gate what an athlete is \"allowed\" to train based on a growth chart -- it's to recognize that a temporary dip in coordination around a growth spurt is normal, and that the years before a growth spurt are uniquely valuable for broad motor development.",
          },
          {
            lessonNumber: 4,
            title: "Structuring a Season for a 10-14 Year Old",
            estMinutes: 5,
            content:
              "Translating the previous lessons into an actual season plan for a 10-14 year old comes down to a few concrete guardrails.\n\nCap total organized volume across everything the athlete does, not just what you personally coach. A young athlete who plays on two teams, takes private lessons, and attends your strength sessions can easily be doing far more total volume than any single coach realizes. Ask directly about what else the athlete is doing.\n\nFavor 2-3 shorter, varied sessions per week over fewer, longer, more concentrated ones -- this matches the faster single-session recovery discussed earlier and keeps any one session from becoming a marathon that a young athlete's attention span and technique both degrade through.\n\nBuild in genuine unstructured time. A full calendar of organized practices, games, and lessons leaves no room for the free, unstructured play that's historically where a lot of natural athleticism and creativity actually develops.\n\nFinally, resist the urge to chase short-term competitive results at this age at the expense of the long-term plan. Coaching for who's best in two years, not who's best this Saturday, is the actual job at this age.",
          },
        ],
        quizQuestions: [
          {
            orderIndex: 0,
            questionText: "What is a key argument against early single-sport specialization before age 10-12?",
            answers: [
              {
                orderIndex: 0,
                answerText: "It's associated with higher overuse injury rates and higher long-term dropout, without a performance advantage",
                isCorrect: true,
                explanation: "Correct -- research consistently shows more overuse injury and burnout from early specialization, while most eventual elite athletes were actually multi-sport participants through adolescence.",
              },
              {
                orderIndex: 1,
                answerText: "It's technically prohibited by youth sports governing bodies",
                isCorrect: false,
                explanation: "There's no blanket prohibition -- the concern is evidence-based (injury and burnout data), not a rules violation.",
              },
              {
                orderIndex: 2,
                answerText: "It guarantees the athlete will lose interest in sports entirely",
                isCorrect: false,
                explanation: "It's associated with higher dropout rates, not a guarantee -- framing it as inevitable overstates the evidence.",
              },
              {
                orderIndex: 3,
                answerText: "Multi-sport athletes always outperform specialists at every age",
                isCorrect: false,
                explanation: "The advantage shows up in eventual elite outcomes, not necessarily at every single age group along the way -- early-specializing athletes can still win in younger age brackets before broader development catches up.",
              },
            ],
          },
          {
            orderIndex: 1,
            questionText: "What typically happens to an athlete's coordination around their growth spurt (Peak Height Velocity)?",
            answers: [
              {
                orderIndex: 0,
                answerText: "A temporary, normal dip, as the nervous system re-calibrates to new limb lengths",
                isCorrect: true,
                explanation: "Correct -- this is a well-documented, temporary phase, not a real regression in ability, and shouldn't be met with added volume or frustration.",
              },
              {
                orderIndex: 1,
                answerText: "A permanent decline that most athletes never recover from",
                isCorrect: false,
                explanation: "This dip is temporary, not permanent -- coordination typically returns and improves as the nervous system adapts to the new proportions.",
              },
              {
                orderIndex: 2,
                answerText: "No change at all -- growth spurts don't affect coordination",
                isCorrect: false,
                explanation: "Growth spurts are specifically linked to a temporary coordination dip in the research this track draws on -- it's a real, expected phenomenon.",
              },
              {
                orderIndex: 3,
                answerText: "An immediate improvement in coordination",
                isCorrect: false,
                explanation: "The opposite is typically true in the short term -- coordination often temporarily dips before improving.",
              },
            ],
          },
          {
            orderIndex: 2,
            questionText: "Before a growth spurt, what type of training tends to produce the largest long-term benefit?",
            answers: [
              {
                orderIndex: 0,
                answerText: "Broad motor-skill development -- running, jumping, throwing, catching, changing direction",
                isCorrect: true,
                explanation: "Correct -- this is the highest-value window for building a broad athletic base, since motor learning is fast and durable at this stage.",
              },
              {
                orderIndex: 1,
                answerText: "Heavy, maximal-load strength training",
                isCorrect: false,
                explanation: "Strength training tends to become highly responsive later, around and after the growth spurt, rather than being the priority beforehand.",
              },
              {
                orderIndex: 2,
                answerText: "Narrow, single-sport skill repetition",
                isCorrect: false,
                explanation: "This is exactly what the track argues against at this age -- narrowing too early costs the broad development window.",
              },
              {
                orderIndex: 3,
                answerText: "No structured training at all until after puberty",
                isCorrect: false,
                explanation: "The claim isn't \"wait until later\" -- it's that broad, varied motor development specifically (not narrow specialization) is valuable during this window.",
              },
            ],
          },
        ],
      },
      {
        title: "Sport-Specific Arm Care & Pitching Development",
        description:
          "Pitch count discipline, building a real arm-care routine, velocity development done responsibly, and recognizing the red flags that mean stop throwing now.",
        keyPrinciplesForAi:
          "For any pitching or throwing-volume question, defer to the athlete's own league's official pitch count and rest guidelines rather than stating a specific numeric limit yourself -- those vary by governing body and age group. Always recommend a proper arm-care warm-up/cooldown routine around throwing. Treat any reported arm pain as a hard stop: refer to a coach or medical professional, never suggest 'pitching through it' or continuing to throw.",
        lessons: [
          {
            lessonNumber: 1,
            title: "Pitch Count & Rest Guidelines",
            estMinutes: 5,
            content:
              "Pitch count and mandatory rest guidelines exist because youth arm injuries are strongly, repeatedly linked to overall throwing volume and insufficient rest between outings -- far more than to any single mechanical flaw. This is the single most well-documented injury-prevention issue in youth baseball and softball, and it is entirely preventable through discipline about volume.\n\nThe specific numeric limits vary by governing body -- Little League, high school federations, and travel organizations each publish their own official charts, and they are updated periodically. The right habit as a coach is to know which governing body's rules apply to your team, always follow their official published guidelines without exception, and count every pitch across every context -- practice bullpens, showcases, private lessons -- not just games, since a young arm doesn't distinguish between a game pitch and a bullpen pitch.\n\nA related, less-discussed part of the guidelines is pitch type restrictions by age -- most official guidance recommends significantly delaying the introduction of breaking balls until an athlete's growth plates are further along, since the specific stress these pitches place on the elbow is a documented additional risk factor in still-developing arms.\n\nThe uncomfortable part of this job is that following the rules sometimes means pulling your best pitcher in a big moment. That's not a close call -- \"but he feels fine\" is not a reliable signal for this kind of cumulative injury risk.",
          },
          {
            lessonNumber: 2,
            title: "Building an Arm Care Routine",
            estMinutes: 6,
            content:
              "A real arm-care routine isn't a few stretches before first pitch -- it's a structured warm-up and cooldown built around the shoulder and elbow's specific demands, done consistently, every single time an athlete throws, not just on game days.\n\nThe warm-up should progress in stages: general movement first, then shoulder-specific activation targeting the rotator cuff and scapular stabilizers -- band external rotations, scaption raises, and prone Y-T-W raises are staples for a reason, since these are exactly the muscles that decelerate the arm after release. Only after this activation work should an athlete begin an actual throwing progression -- short, easy toss building gradually to full-effort distance.\n\nThe cooldown matters just as much and is far more commonly skipped entirely. After throwing, light band work and gentle stretching help manage the acute inflammatory response and maintain range of motion that repetitive throwing naturally tightens over a season.\n\nBeyond single-session routines, a season-long arm-care program should include dedicated strength work for the posterior shoulder and scapular stabilizers year-round, not just during a throwing season -- these are small muscles relative to the prime movers, they fatigue and detrain faster, and they are disproportionately important for injury prevention relative to their size.",
          },
          {
            lessonNumber: 3,
            title: "Velocity Development Without Overuse",
            estMinutes: 6,
            content:
              "Velocity is the measurable outcome every throwing athlete wants more of, and there are legitimate, well-supported ways to build it -- but several popular methods carry real risk that deserves an honest conversation, not a blanket endorsement or a blanket ban.\n\nLong toss (gradually increasing throwing distance, then working back down with flatter, quicker throws) is one of the most well-established and lowest-risk velocity development tools available, when built into a structured, gradually progressing program rather than just \"throw it as far as you can.\"\n\nWeighted-ball programs have real research support for producing velocity gains, but also a documented increase in injury risk in some studies, particularly when followed without proper supervision or progressed too aggressively. The honest coaching position is that weighted-ball work genuinely benefits from a qualified velocity-development specialist's direct supervision -- skipping that supervision to save cost or time is where the injury risk concentrates.\n\nThe lower-risk, higher-priority path for most youth and developing athletes is simply building the fundamentals first: consistent arm care, appropriate strength training, and sound mechanics. Chasing velocity-specific specialty programs before that foundation is in place is a common way to add risk for a gain that a well-built general foundation would have produced anyway.",
          },
          {
            lessonNumber: 4,
            title: "Recognizing Red Flags",
            estMinutes: 5,
            content:
              "The single most important skill in arm care isn't a stretch or an exercise -- it's recognizing when to stop, and having the discipline to act on it immediately rather than \"seeing how the next inning goes.\"\n\nMechanical red flags show up before pain does, if you're watching for them: a drop in arm slot or release point late in an outing, reduced hip-shoulder separation, a pitcher who starts \"muscling\" the ball with the arm rather than using their whole body, or a visible change in follow-through.\n\nReported pain is a hard stop, full stop -- not a modification, not \"let's see how it feels after a few easy ones.\" This is true even for a pitcher who is pitching a great game, even in a playoff situation. Elbow or shoulder pain during or after throwing in a still-developing athlete is exactly the population where \"pitching through it\" turns a manageable issue into a season-ending or growth-plate injury.\n\nPersistent soreness that doesn't resolve with normal rest, a decline in velocity that doesn't track with normal season fatigue, or any report of numbness/tingling are all reasons to involve a medical professional. As a coach, your job in all of these situations is the same: stop the throwing, communicate clearly with the parent, and refer to a doctor or sports medicine professional -- never attempt to diagnose or clear an athlete to return yourself.",
          },
        ],
        quizQuestions: [
          {
            orderIndex: 0,
            questionText: "Where should a coach look for official pitch count and rest guidelines?",
            answers: [
              {
                orderIndex: 0,
                answerText: "Whichever governing body (Little League, high school federation, travel org) applies to the team, followed without exception",
                isCorrect: true,
                explanation: "Correct -- guidelines vary by governing body and are updated periodically, so the right habit is knowing which one applies and following it exactly, not applying a number from memory or a different context.",
              },
              {
                orderIndex: 1,
                answerText: "Whatever number feels reasonable based on how the pitcher looks that day",
                isCorrect: false,
                explanation: "This is exactly the reasoning the track warns against -- \"but he feels fine\" isn't a reliable signal for cumulative injury risk, which is why fixed, official guidelines exist in the first place.",
              },
              {
                orderIndex: 2,
                answerText: "Only game pitches count toward the limit, not bullpens or lessons",
                isCorrect: false,
                explanation: "A young arm doesn't distinguish between contexts -- practice bullpens, showcases, and lessons all count toward total throwing volume.",
              },
              {
                orderIndex: 3,
                answerText: "There's one universal number that applies to every league and age",
                isCorrect: false,
                explanation: "Numbers vary meaningfully by governing body and age group -- there's no single universal figure.",
              },
            ],
          },
          {
            orderIndex: 1,
            questionText: "What is the recommended approach to introducing breaking balls (like curveballs) to a young pitcher?",
            answers: [
              {
                orderIndex: 0,
                answerText: "Delay introduction until further along in growth-plate development, per official guidance",
                isCorrect: true,
                explanation: "Correct -- most official youth guidance recommends significantly delaying breaking-ball introduction because of the specific elbow stress involved, favoring fastballs and changeups for younger arms.",
              },
              {
                orderIndex: 1,
                answerText: "Introduce them as early as possible to build a full arsenal",
                isCorrect: false,
                explanation: "This runs directly against the documented additional injury risk breaking pitches carry for still-developing arms.",
              },
              {
                orderIndex: 2,
                answerText: "It doesn't matter what pitch type is thrown, only total pitch count matters",
                isCorrect: false,
                explanation: "Pitch type is a real, separate risk factor from raw volume -- breaking balls carry documented additional elbow stress.",
              },
              {
                orderIndex: 3,
                answerText: "Only allow breaking balls in practice, never in games",
                isCorrect: false,
                explanation: "The concern is the pitch's mechanical stress on the arm, which is present regardless of whether it's practice or a game.",
              },
            ],
          },
          {
            orderIndex: 2,
            questionText: "An athlete reports mild elbow tightness after throwing, but says they can keep going. What should a coach do?",
            answers: [
              {
                orderIndex: 0,
                answerText: "Stop the throwing immediately and refer to a medical professional",
                isCorrect: true,
                explanation: "Correct -- reported pain during or after throwing is a hard stop, not a judgment call, regardless of how minor it sounds or the game situation.",
              },
              {
                orderIndex: 1,
                answerText: "Have them throw a few easy ones to see if it works itself out",
                isCorrect: false,
                explanation: "This is precisely the \"pitching through it\" pattern that turns a manageable issue into a season-ending or growth-plate injury in a still-developing athlete.",
              },
              {
                orderIndex: 2,
                answerText: "Let them finish the inning since they say they're fine",
                isCorrect: false,
                explanation: "Self-report of being fine doesn't override the hard-stop rule for reported pain -- no game situation changes this.",
              },
              {
                orderIndex: 3,
                answerText: "Reduce their pitch count for next outing but let them continue this one",
                isCorrect: false,
                explanation: "Any reported pain calls for stopping now, not a plan for a future outing -- the current session is the one that needs to stop.",
              },
            ],
          },
        ],
      },
      {
        title: "Reading Forge's Own Analytics",
        description:
          "What ACWR, force-velocity profiling, asymmetry flags, and the readiness score actually mean, and how to turn each one into a real coaching decision.",
        keyPrinciplesForAi:
          "When an athlete's ACWR, force-velocity, asymmetry, or readiness data is available in context, use it to inform your explanation: a high ACWR or a low readiness score is a signal to deload or modify intensity that day, not something to override or ignore. An asymmetry flag is a screening signal, not a diagnosis -- frame it as something worth mentioning to a coach, never as a medical conclusion.",
        lessons: [
          {
            lessonNumber: 1,
            title: "Understanding Acute:Chronic Workload Ratio (ACWR)",
            estMinutes: 6,
            content:
              "ACWR compares an athlete's recent training load (the 'acute' load, typically the last 7 days) against their longer-term average load (the 'chronic' load, typically a rolling 28-day average). The ratio tells you how much that recent load has spiked relative to what their body has actually adapted to handle.\n\nThe commonly cited \"sweet spot\" for this ratio sits roughly between 0.8 and 1.3. Ratios meaningfully above that range are associated with elevated injury risk, because the body is being asked to absorb a jump in demand faster than its tissues have had time to adapt. Ratios well below that range aren't risk-free either -- they can indicate detraining, where an athlete has lost fitness relative to what they're about to be asked to do.\n\nThe practical use of this number is as an early-warning flag, not an automatic stop sign. A spiking ACWR after a genuinely planned hard week isn't necessarily a problem on its own -- but it's a reason to be more deliberate about the deload that follows, rather than immediately stacking another hard week on top of it. Where it becomes a real red flag is a spike that's unplanned or ongoing.\n\nWhen you see a flagged ACWR, the right response is almost never \"push through it\" -- it's to actually look at what changed in the last week and make a deliberate call about backing off volume or intensity for a few days.",
          },
          {
            lessonNumber: 2,
            title: "Force-Velocity Profiling, Explained",
            estMinutes: 6,
            content:
              "Every athlete's power output can be described along a spectrum from force-dominant to velocity-dominant, and understanding where an individual athlete sits on that spectrum changes what kind of training will actually move the needle for them.\n\nA force-velocity profile is built from testing an athlete's power output across a range of loads and looking at the resulting curve. A force-dominant athlete produces relatively more force at higher loads but doesn't express that force especially quickly; a velocity-dominant athlete moves fast and explosively but tops out at a lower peak force. Two athletes can have identical vertical jump heights and still sit at very different points on this spectrum.\n\nThe actionable insight is training prescription: a force-dominant athlete generally benefits more from adding velocity-biased work (jumps, throws, plyometrics) to round out their profile, while a velocity-dominant athlete typically benefits more from added heavy strength work. Programming more of what an athlete is already good at tends to produce diminishing returns compared to training the weaker side of their own profile.\n\nWhen reviewing a profile with an athlete or parent, frame it as descriptive, not as a verdict on overall talent -- it's information about which training emphasis is likely to help most right now, and profiles do shift over a training career.",
          },
          {
            lessonNumber: 3,
            title: "Interpreting Leg-Drive Asymmetry Flags",
            estMinutes: 5,
            content:
              "An asymmetry flag compares an athlete's left and right leg output and flags a meaningful, repeated imbalance between sides -- generally when one side is consistently contributing significantly more than the other across a real sample of reps, not just one noisy rep.\n\nThe most important thing to understand about this flag is what it is not: it is not a diagnosis, and it is not proof of an injury. Some degree of side-to-side asymmetry is completely normal, tied to dominant-side preference or sport-specific movement patterns. A flag means \"this is worth a closer look,\" not \"something is wrong.\"\n\nThat said, a real, consistent, and previously-absent asymmetry is worth taking seriously as a screening signal -- it can indicate a developing overuse pattern, a strength imbalance worth addressing directly, or discomfort the athlete hasn't consciously reported.\n\nThe correct response as a coach is a simple triage: ask the athlete directly whether anything feels different, sore, or off on either side. If pain or discomfort is present, this becomes a medical referral, not a training decision. If there's no pain and it's an underlying strength imbalance, appropriate unilateral training is a reasonable, proactive response.",
          },
          {
            lessonNumber: 4,
            title: "Using the Readiness Score to Adjust a Session",
            estMinutes: 5,
            content:
              "The readiness score combines an athlete's self-reported sleep, soreness, stress, and focus into a single daily signal -- and its entire value comes from actually letting it influence that day's session, rather than being logged and then ignored.\n\nA low readiness score is not a reason to cancel training outright in most cases -- it's a reason to adjust what that session emphasizes. Practical adjustments include: dropping planned top-end intensity while keeping movement quality work, swapping a heavy strength day for a technique-focused session, or simply reducing volume while watching how the athlete actually moves once warmed up.\n\nIt's worth distinguishing a single bad day from a real pattern. One low-readiness day after a late night is normal and doesn't require a program overhaul. A pattern of consistently low scores over multiple days or weeks deserves an actual conversation with the athlete about what's driving it.\n\nThe score is most useful when athletes trust that reporting honestly actually changes something about their day -- a coach who visibly adjusts sessions based on the score, even in small ways, is the single biggest driver of athletes continuing to fill it out honestly over a full season.",
          },
        ],
        quizQuestions: [
          {
            orderIndex: 0,
            questionText: "An athlete's ACWR spikes above the typical 0.8-1.3 range after a planned hard training week. What's the appropriate response?",
            answers: [
              {
                orderIndex: 0,
                answerText: "Be more deliberate about the deload/recovery period that follows, rather than stacking another hard week on top",
                isCorrect: true,
                explanation: "Correct -- a spike after a genuinely planned hard week isn't automatically a problem, but it's a cue to manage the recovery that follows carefully rather than compounding it.",
              },
              {
                orderIndex: 1,
                answerText: "Ignore it completely since the week was planned",
                isCorrect: false,
                explanation: "Even a planned spike is worth watching -- the real risk is stacking more hard training on top without adequate recovery.",
              },
              {
                orderIndex: 2,
                answerText: "Immediately stop all training for that athlete",
                isCorrect: false,
                explanation: "A single elevated reading after planned hard training isn't cause for a full stop -- it's a cue for a more careful recovery period, not a shutdown.",
              },
              {
                orderIndex: 3,
                answerText: "Increase volume further to \"push through\" the spike",
                isCorrect: false,
                explanation: "This is the exact opposite of the appropriate response -- adding more volume on top of an elevated ACWR is how spikes turn into injuries.",
              },
            ],
          },
          {
            orderIndex: 1,
            questionText: "What does a flagged leg-drive asymmetry most accurately represent?",
            answers: [
              {
                orderIndex: 0,
                answerText: "A screening signal worth a conversation, not a diagnosis",
                isCorrect: true,
                explanation: "Correct -- some asymmetry is normal for most athletes; a flag means it's worth asking the athlete directly whether something feels off, not concluding an injury exists.",
              },
              {
                orderIndex: 1,
                answerText: "Definitive proof of an existing injury",
                isCorrect: false,
                explanation: "The track is explicit that this is not a diagnosis -- it's a prompt for a conversation, since normal side-to-side variation exists in most athletes.",
              },
              {
                orderIndex: 2,
                answerText: "A sign the athlete should stop training that leg entirely",
                isCorrect: false,
                explanation: "That's a significant, specific intervention the flag alone doesn't justify -- the correct next step is asking questions, not prescribing a training change.",
              },
              {
                orderIndex: 3,
                answerText: "Something to note but never act on",
                isCorrect: false,
                explanation: "The flag should prompt at least a direct conversation with the athlete -- treating it as pure background noise defeats its purpose as an early-warning signal.",
              },
            ],
          },
          {
            orderIndex: 2,
            questionText: "How should a coach respond to an athlete's low readiness score on a given day?",
            answers: [
              {
                orderIndex: 0,
                answerText: "Adjust that day's session -- e.g., drop top-end intensity or swap to technique-focused work",
                isCorrect: true,
                explanation: "Correct -- the entire value of the readiness score comes from actually letting it change that day's plan, via concrete adjustments like reduced intensity or volume.",
              },
              {
                orderIndex: 1,
                answerText: "Ignore it since one bad day doesn't matter",
                isCorrect: false,
                explanation: "A single bad day is normal, but the score is only useful if it actually changes something about the session -- otherwise athletes stop trusting it's worth reporting honestly.",
              },
              {
                orderIndex: 2,
                answerText: "Automatically cancel the entire session",
                isCorrect: false,
                explanation: "Most low-readiness days call for an adjustment, not an outright cancellation -- reserve that for genuine patterns or more serious signals.",
              },
              {
                orderIndex: 3,
                answerText: "Add extra volume to compensate for the athlete being \"behind\"",
                isCorrect: false,
                explanation: "Adding volume on top of low readiness is exactly backwards -- it increases risk precisely when the athlete's capacity is reduced.",
              },
            ],
          },
        ],
      },
      {
        title: "Season & Practice Planning",
        description:
          "Macrocycle structure across a full year, tapering into competition, minimum-effective-dose in-season lifting, and how to sequence a single practice.",
        keyPrinciplesForAi:
          "Frame training recommendations by season phase (off-season, pre-season, in-season, post-season) whenever that context is available -- in-season strength work should generally be minimum-effective-dose to protect game-day freshness, and training volume should taper down, not spike, heading into a competition or tournament.",
        lessons: [
          {
            lessonNumber: 1,
            title: "Macrocycle Basics: Off-Season, Pre-Season, In-Season, Post-Season",
            estMinutes: 6,
            content:
              "A macrocycle is simply the full-year view of training, broken into phases that each serve a different purpose. Understanding what each phase is actually for keeps you from running the same style of training year-round regardless of what's happening in the competitive calendar.\n\nOff-season is the longest window with the fewest competitive demands, and it's where the heaviest lifting, the biggest structural changes to an athlete's strength, and the most aggressive addressing of weaknesses identified during the season should happen.\n\nPre-season is a transition phase: volume and general strength work start to taper as sport-specific conditioning, movement patterns, and intensity ramp up toward what competition will actually demand. A common mistake is either continuing off-season-style heavy volume too late, or cutting training too early.\n\nIn-season is about maintenance, not building -- the goal shifts from \"get stronger\" to \"don't lose what you built, and stay fresh enough to perform and avoid injury.\"\n\nPost-season is recovery, both physical and mental -- a deliberate window of reduced structured training that lets accumulated fatigue actually resolve before the next off-season build begins. Skipping this phase because an athlete \"wants to keep training\" is a common way off-seasons start from a fatigue deficit rather than a fresh slate.",
          },
          {
            lessonNumber: 2,
            title: "Tapering for Competition",
            estMinutes: 5,
            content:
              "A taper is a planned, temporary reduction in training volume in the days-to-weeks before an important competition, designed to let accumulated fatigue dissipate while preserving the fitness that training built.\n\nThe key principle that makes a taper work is reducing volume while maintaining intensity. Cutting volume removes accumulated fatigue quickly, since fatigue clears faster than fitness does. Intensity needs to stay relatively high, because dropping intensity too is what actually causes a loss of the specific fitness qualities the taper is supposed to be protecting. A taper that cuts both volume and intensity together isn't a taper, it's just detraining.\n\nHow long a taper should last depends on how much fatigue has actually accumulated and how big the competition is. A single important regular-season game might warrant only a lighter day or two beforehand; a season-defining tournament might warrant a more significant 1-2 week reduction.\n\nA common mistake is either not tapering at all, or overdoing the taper so much that the athlete arrives undertrained rather than fresh. Planning the taper in advance as part of the season's macrocycle, rather than improvising it the week of, is what keeps it in that effective middle ground.",
          },
          {
            lessonNumber: 3,
            title: "In-Season Maintenance Strength Work",
            estMinutes: 6,
            content:
              "The goal of in-season strength training is not to keep making an athlete stronger at the same rate as the off-season -- it's to preserve as much of the off-season's gains as possible while protecting the athlete's freshness for games and practices, which are now the primary training stimulus.\n\nThe research and practical coaching consensus on maintenance training is consistently encouraging on one point: maintaining strength and power built in the off-season requires meaningfully less volume than building it did in the first place -- often as little as one well-designed session per week, at a reasonably high intensity but low total volume, is enough to maintain most of what a full off-season block produced.\n\nPractically, this usually means: fewer total exercises per session, fewer sets per exercise, but keeping intensity reasonably high. Timing matters too -- placing the harder in-season lifting session further from the next competition reduces the chance that game-day freshness is compromised by lingering lifting-session fatigue.\n\nThe mindset shift for a coach moving from off-season to in-season programming is simply this: less is not laziness here, it's the correct, evidence-supported response to a fundamentally different set of competing demands on the athlete's recovery.",
          },
          {
            lessonNumber: 4,
            title: "Structuring a Single Practice",
            estMinutes: 6,
            content:
              "A well-structured practice follows a deliberate sequence for the same reason a well-structured training session does -- different types of work have different fatigue and skill-acquisition demands, and the order they happen in matters as much as what's included.\n\nStart with a genuine warm-up/movement-prep block -- dynamic movement that actually raises body temperature and rehearses movement patterns the practice will use, at progressively higher effort.\n\nPlace your highest-skill, highest-cognitive-demand work early, while athletes are freshest -- new technical instruction or anything requiring fine motor precision should never be introduced after athletes are already fatigued, since fatigue is exactly when technical learning and retention suffer most.\n\nCompetitive/scrimmage work generally fits in the middle-to-later portion of practice, once foundational skill work is done but before athletes are too depleted to compete at a meaningful intensity.\n\nSave dedicated conditioning for the end of practice. Conditioning athletes early leaves them fatigued for the technical work that follows, defeating the purpose of the ordering above.\n\nFinally, always end with a genuine cool-down and, where relevant, sport-specific arm-care or recovery work -- the last few minutes of practice are often the first thing cut when time runs short, but they're doing real, cumulative injury-prevention work over a season.",
          },
        ],
        quizQuestions: [
          {
            orderIndex: 0,
            questionText: "What is the main goal of in-season strength training, compared to off-season?",
            answers: [
              {
                orderIndex: 0,
                answerText: "Preserve off-season gains with minimum-effective-dose training, not continue building at the same rate",
                isCorrect: true,
                explanation: "Correct -- research consistently shows maintaining strength requires meaningfully less volume than building it, which is good news for fitting lifting around a busy game schedule.",
              },
              {
                orderIndex: 1,
                answerText: "Push for the same rate of strength gains as the off-season",
                isCorrect: false,
                explanation: "Trying to build at the off-season rate during a demanding game schedule risks adding fatigue the athlete can't afford -- the goal shifts to maintenance.",
              },
              {
                orderIndex: 2,
                answerText: "Stop all strength training once the season starts",
                isCorrect: false,
                explanation: "Stopping entirely tends to lose real strength over a season -- a well-designed low-volume maintenance approach preserves far more than doing nothing.",
              },
              {
                orderIndex: 3,
                answerText: "Increase training frequency to compensate for game fatigue",
                isCorrect: false,
                explanation: "This is backwards -- in-season programming typically reduces frequency/volume specifically because game fatigue is already a competing demand on recovery.",
              },
            ],
          },
          {
            orderIndex: 1,
            questionText: "What's the key principle behind an effective competition taper?",
            answers: [
              {
                orderIndex: 0,
                answerText: "Reduce volume while keeping intensity relatively high",
                isCorrect: true,
                explanation: "Correct -- cutting volume clears fatigue quickly, while maintaining intensity preserves the specific fitness qualities the taper is meant to protect; cutting both together is just detraining.",
              },
              {
                orderIndex: 1,
                answerText: "Reduce both volume and intensity together as much as possible",
                isCorrect: false,
                explanation: "This is explicitly called out as a mistake -- reducing both isn't a taper, it's detraining, and it costs the athlete real fitness right before competition.",
              },
              {
                orderIndex: 2,
                answerText: "Increase volume right before competition to \"peak\" fitness",
                isCorrect: false,
                explanation: "This is the opposite of tapering -- adding volume right before competition adds fatigue exactly when freshness matters most.",
              },
              {
                orderIndex: 3,
                answerText: "Tapering only matters for very long competitive seasons",
                isCorrect: false,
                explanation: "Tapering applies at any scale -- even a single important regular-season game can warrant a lighter day or two beforehand.",
              },
            ],
          },
          {
            orderIndex: 2,
            questionText: "In what order should a single practice generally be structured?",
            answers: [
              {
                orderIndex: 0,
                answerText: "Warm-up, high-skill/technical work, competitive/scrimmage work, conditioning, cooldown",
                isCorrect: true,
                explanation: "Correct -- this order matches fatigue and skill-acquisition demands: technical learning suffers most under fatigue, so it goes early, while conditioning (lower skill demand) tolerates fatigue best at the end.",
              },
              {
                orderIndex: 1,
                answerText: "Conditioning first to build a base of fatigue for the rest of practice",
                isCorrect: false,
                explanation: "Conditioning first leaves athletes fatigued for the technical work that follows, which is exactly backwards for skill retention.",
              },
              {
                orderIndex: 2,
                answerText: "Cooldown and arm care first, then everything else",
                isCorrect: false,
                explanation: "Cooldown/recovery work belongs at the end, addressing the fatigue and tightness practice itself creates -- doing it first doesn't serve that purpose.",
              },
              {
                orderIndex: 3,
                answerText: "Whatever order keeps the athletes most entertained",
                isCorrect: false,
                explanation: "Entertainment isn't the organizing principle -- the order is based on when the nervous system can best absorb technical learning versus tolerate fatigue.",
              },
            ],
          },
        ],
      },
      {
        title: "Coaching Communication & Culture",
        description:
          "Building genuine buy-in instead of just compliance, adapting to different personality types, handling a bad practice, and creating real accountability.",
        keyPrinciplesForAi:
          "When discussing motivation or communication approaches with an athlete, favor explaining the 'why' behind a task over a blunt directive, and encourage the athlete to bring concerns or questions to their real coach -- consistent with never positioning yourself as the final authority on their training or behavior.",
        lessons: [
          {
            lessonNumber: 1,
            title: "Building Buy-In, Not Just Compliance",
            estMinutes: 5,
            content:
              "There's a meaningful difference between an athlete who does a drill because you told them to and an athlete who does it because they understand why it matters -- and that difference shows up directly in effort, retention, and whether the behavior sticks once you're not standing right there watching.\n\nCompliance is what you get from authority alone: a directive, delivered with enough force or consequence attached, produces the behavior in the moment. It has its place, particularly around safety, but compliance-only coaching tends to produce athletes who perform exactly to the letter of the instruction and no further.\n\nBuy-in is what you get from understanding: an athlete who knows why a warm-up matters, or why a certain in-game decision is the right one, tends to actually apply that understanding even in moments you can't directly supervise.\n\nBuilding buy-in doesn't require a long lecture before every instruction -- most of the time it's a short, genuine \"why\" attached to the \"what.\" Over a season, an athlete who consistently hears the reasoning behind what they're asked to do develops actual understanding of their own training and sport -- a far more durable outcome than an athlete who's simply gotten good at doing what they're told.",
          },
          {
            lessonNumber: 2,
            title: "Motivating Different Personality Types",
            estMinutes: 5,
            content:
              "Not every athlete responds to the same motivational approach, and a coach who has exactly one style will connect well with some athletes and completely miss others -- often the ones who need the most help.\n\nSome athletes respond well to direct, even blunt, feedback -- they want to know exactly what's wrong and exactly how to fix it, without much cushioning. For these athletes, a direct correction delivered matter-of-factly is respectful of how they actually want to be coached, not harsh for its own sake.\n\nOther athletes need encouragement and psychological safety established first before a correction lands well -- delivering the same blunt correction to an athlete in this category, especially in front of teammates, can shut them down rather than motivate them. Leading with something genuine they did well, then framing the correction as the next step, tends to produce far better results from the same underlying feedback.\n\nThe practical skill here is paying attention to how a specific athlete actually responds over time and adjusting your delivery to that individual, while keeping the actual substance of your coaching consistent.",
          },
          {
            lessonNumber: 3,
            title: "Handling a Bad Practice or a Bad Attitude",
            estMinutes: 5,
            content:
              "Every coach eventually deals with a practice that's going poorly, or an individual athlete showing a bad attitude in the moment -- and how that's handled in real time says more about a program's culture than almost anything else a coach does.\n\nThe first, most consistently useful rule: address individual behavior privately, not in front of the team. Calling out one athlete's attitude in front of teammates tends to produce defensiveness rather than genuine correction.\n\nSeparate the behavior from the person when you address it. \"You're being lazy\" describes an identity; \"that rep didn't match the effort I know you're capable of\" describes a specific, correctable action, and gives the athlete somewhere to go.\n\nFor a genuinely bad team practice, resist the urge to escalate with more volume or punishment conditioning as the immediate response -- this often treats the symptom with more of exactly what's draining it. A short, direct conversation, followed by continuing the practice plan, usually addresses the issue more effectively than an emotional response.\n\nAlways follow up. A brief, genuine check-in at the next practice closes the loop and reinforces that the correction was about improvement, not punishment.",
          },
          {
            lessonNumber: 4,
            title: "Creating a Culture of Accountability",
            estMinutes: 5,
            content:
              "A team culture of genuine accountability isn't built from a single speech at the start of the season -- it's built from consistently applied standards that don't bend based on who the athlete is or how good they are, applied over the course of an entire season.\n\nThe single fastest way to destroy a culture of accountability is applying standards unevenly based on talent -- letting your best player skip standards everyone else is held to. Athletes notice this immediately, and the message it sends is that the standard is actually optional if you're good enough.\n\nPeer accountability, once established, is more powerful and more sustainable than a coach enforcing every single standard personally. A captain or respected veteran reinforcing a standard to a teammate carries different weight than the same reminder from a coach.\n\nConsistency over time matters more than intensity in any single moment. A standard that's strictly enforced during a good week and quietly ignored during a stressful or losing stretch teaches athletes that the standard was situational all along -- whereas a standard that holds steady specifically during the hard stretches is what actually builds trust that the standard is real.",
          },
        ],
        quizQuestions: [
          {
            orderIndex: 0,
            questionText: "What's the key difference between compliance and buy-in?",
            answers: [
              {
                orderIndex: 0,
                answerText: "Buy-in comes from understanding the \"why\" and persists even without direct supervision; compliance is authority-driven and often stops there",
                isCorrect: true,
                explanation: "Correct -- an athlete who understands why they're doing something tends to apply it even when the coach isn't watching, while pure compliance often doesn't generalize beyond the exact instruction given.",
              },
              {
                orderIndex: 1,
                answerText: "They produce identical long-term results",
                isCorrect: false,
                explanation: "The track specifically argues they produce different durability of behavior -- buy-in tends to generalize and persist, compliance often doesn't.",
              },
              {
                orderIndex: 2,
                answerText: "Compliance is always the better approach for safety-critical instructions",
                isCorrect: false,
                explanation: "Compliance does have its place for safety-critical moments, but that's a narrower claim than saying it's always superior overall -- buy-in is presented as generally the more durable approach.",
              },
              {
                orderIndex: 3,
                answerText: "Buy-in requires a long lecture before every single instruction",
                isCorrect: false,
                explanation: "The track explicitly says building buy-in doesn't require a lecture every time -- usually a short, genuine \"why\" attached to the \"what\" is enough.",
              },
            ],
          },
          {
            orderIndex: 1,
            questionText: "How should a coach generally handle correcting an individual athlete's poor effort or attitude?",
            answers: [
              {
                orderIndex: 0,
                answerText: "Address it privately, separating the behavior from the athlete's identity",
                isCorrect: true,
                explanation: "Correct -- private correction avoids the defensiveness public correction tends to produce, and describing a specific action (rather than labeling the person) gives the athlete something concrete to fix.",
              },
              {
                orderIndex: 1,
                answerText: "Call it out immediately in front of the team to set an example",
                isCorrect: false,
                explanation: "Public correction tends to produce defensiveness and can turn into a performance for teammates to react to, rather than genuine correction.",
              },
              {
                orderIndex: 2,
                answerText: "Say nothing and hope it improves on its own",
                isCorrect: false,
                explanation: "Unaddressed behavior doesn't reliably self-correct, and the track's whole framework is about active, deliberate correction -- just privately, not publicly.",
              },
              {
                orderIndex: 3,
                answerText: "Assign extra conditioning as the primary response",
                isCorrect: false,
                explanation: "Punishment conditioning is called out as a common but often counterproductive instinct -- it treats the symptom rather than addressing the actual behavior directly.",
              },
            ],
          },
          {
            orderIndex: 2,
            questionText: "What's the fastest way to undermine a team's culture of accountability?",
            answers: [
              {
                orderIndex: 0,
                answerText: "Applying standards unevenly based on an athlete's talent level",
                isCorrect: true,
                explanation: "Correct -- letting a star player skip a standard everyone else follows sends a clear signal that the standard is optional if you're good enough, which erodes trust in every other standard.",
              },
              {
                orderIndex: 1,
                answerText: "Empowering team captains to reinforce standards among teammates",
                isCorrect: false,
                explanation: "This is actually a positive, sustainable practice (peer accountability) -- it's presented as something that strengthens culture, not undermines it.",
              },
              {
                orderIndex: 2,
                answerText: "Holding the same standard steady during a difficult losing stretch",
                isCorrect: false,
                explanation: "Consistency specifically during hard stretches is what builds genuine trust that a standard is real -- this strengthens culture rather than undermining it.",
              },
              {
                orderIndex: 3,
                answerText: "Following up after a correction to reinforce the standard",
                isCorrect: false,
                explanation: "Following up closes the loop and reinforces that a correction was about improvement -- this supports accountability rather than undermining it.",
              },
            ],
          },
        ],
      },
    ];

    for (const track of seedAcademyTracks) {
      const existingId = existingTrackIdByTitle.get(track.title);
      if (existingId == null) {
        await storage.createAcademyTrackWithStructure({
          title: track.title,
          description: track.description,
          keyPrinciplesForAi: track.keyPrinciplesForAi,
          orderIndex: seedAcademyTracks.indexOf(track),
          lessons: track.lessons,
          quizQuestions: track.quizQuestions,
        });
      } else {
        // Track already exists from an earlier deploy (lessons already
        // seeded) -- just backfill its quiz if it doesn't have one yet,
        // without touching lessons (see addQuizQuestionsToTrackIfNone's
        // comment on why this can't reuse updateAcademyTrackStructure).
        await storage.addQuizQuestionsToTrackIfNone(existingId, track.quizQuestions);
      }
    }
  }

  // Looked up system-wide (not scoped to this coach), same reasoning as the
  // exercise idempotency check above: this program's owner/name can change
  // after seeding (e.g. handed to the admin and renamed Forge-official), so
  // a coach-scoped check would see it as "new" again and recreate a
  // duplicate on every deploy. Matches on either name so it recognizes the
  // program whether or not that rename has happened yet.
  const allPrograms = await storage.getAllPrograms();
  const demoProgramExists = allPrograms.some((p) =>
    ["Forge Strength Block", "Forge Workout Program"].includes(p.name),
  );
  let program;
  if (!demoProgramExists) {
    program = await storage.createProgramWithStructure(coach.id, {
      name: "Forge Strength Block",
      description: "4-day full body strength & conditioning program.",
      blocks: [],
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
      }, coach.id);
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
      }, coach.id);
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

  // One-time production fixup, same idempotent post-hoc pattern as the
  // exercise-library handoff above: settle on a single "Forge" identity
  // (scott's real account once it exists, else the local demo admin) and
  // make sure the flagship program and a full-coverage test program are
  // both owned by it under the right name. Runs on every deploy forever;
  // each half no-ops once it's already been applied.
  const forgeIdentity = scott ?? demoAdmin;
  if (forgeIdentity) {
    const strengthBlock = await db.query.programs.findFirst({
      where: eq(programs.name, "Forge Strength Block"),
    });
    if (strengthBlock) {
      await db
        .update(programs)
        .set({ coachId: forgeIdentity.id, name: "Forge Workout Program" })
        .where(eq(programs.id, strengthBlock.id));
      console.log('Renamed "Forge Strength Block" -> "Forge Workout Program" and flagged it Forge-official.');
    }

    if (!allPrograms.some((p) => p.name === "Test Program")) {
      function testExerciseId(name: string) {
        const found = exerciseMap[name];
        if (!found) throw new Error(`Exercise not found while seeding Test Program: "${name}"`);
        return found;
      }

      const testProgram = await storage.createProgramWithStructure(forgeIdentity.id, {
        name: "Test Program",
        description:
          "A deliberately exhaustive program covering every Forge feature in one block: plain strength logging, multi-group supersets, bar-path/full velocity tracking, video-check uploads, %1RM auto-resolution, manual corrective work, and a big multi-exercise day.",
        blocks: [],
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
                  { exerciseId: testExerciseId("Back Squat"), orderIndex: 0, sets: 4, reps: "5", weight: "225 lbs", restSeconds: 150 },
                  { exerciseId: testExerciseId("Bench Press"), orderIndex: 1, sets: 4, reps: "5", weight: "185 lbs", restSeconds: 150 },
                  { exerciseId: testExerciseId("Bent-Over Row"), orderIndex: 2, sets: 3, reps: "8", weight: "135 lbs", restSeconds: 90 },
                  { exerciseId: testExerciseId("Overhead Press"), orderIndex: 3, sets: 3, reps: "8", weight: "95 lbs", restSeconds: 90 },
                  { exerciseId: testExerciseId("Plank"), orderIndex: 4, sets: 3, reps: "60s hold", weight: "Bodyweight", restSeconds: 60 },
                ],
              },
              {
                dayNumber: 2,
                title: "Superset Circuit",
                isRestDay: false,
                exercises: [
                  { exerciseId: testExerciseId("Incline Dumbbell Press"), orderIndex: 0, sets: 3, reps: "10", weight: "60 lbs", restSeconds: 75, supersetGroup: "test-super-a" },
                  { exerciseId: testExerciseId("Chest-Supported Row"), orderIndex: 1, sets: 3, reps: "10", weight: "50 lbs", restSeconds: 75, supersetGroup: "test-super-a" },
                  { exerciseId: testExerciseId("Bulgarian Split Squat"), orderIndex: 2, sets: 3, reps: "8/side", weight: "30 lbs", restSeconds: 90, supersetGroup: "test-super-b" },
                  { exerciseId: testExerciseId("Nordic Hamstring Curl"), orderIndex: 3, sets: 3, reps: "6", weight: "Bodyweight", restSeconds: 90, supersetGroup: "test-super-b" },
                  { exerciseId: testExerciseId("Barbell Curl"), orderIndex: 4, sets: 3, reps: "10", weight: "60 lbs", restSeconds: 60, supersetGroup: "test-super-c" },
                  { exerciseId: testExerciseId("Hammer Curl"), orderIndex: 5, sets: 3, reps: "10", weight: "30 lbs", restSeconds: 60, supersetGroup: "test-super-c" },
                  { exerciseId: testExerciseId("Tricep Rope Pushdown"), orderIndex: 6, sets: 3, reps: "12", weight: "50 lbs", restSeconds: 60, supersetGroup: "test-super-c" },
                ],
              },
              {
                dayNumber: 3,
                title: "Bar Speed & Jump Lab",
                isRestDay: false,
                // videoCheckEnabled paired with every trackingLevel below --
                // written pre-unification (see video-tracking-toggle.tsx's
                // own comment), when "tracking on, video off" was still a
                // reachable state. Turning tracking on has meant capturing
                // video too ever since that toggle collapsed to one control,
                // so leaving these unpaired silently ran a real AR/MediaPipe
                // tracked set that never saved a clip -- same trap
                // (VideoTrackingToggle still *displays* "Video: On" for any
                // non-"none" trackingLevel, whatever videoCheckEnabled
                // actually holds) that toggle's comment already warns about
                // for legacy data, just reproduced here instead of pre-dating
                // the refactor by luck. Matches Week 2's "Kitchen Sink Day"
                // below, which already pairs the two correctly.
                exercises: [
                  { exerciseId: testExerciseId("Back Squat"), orderIndex: 0, sets: 5, reps: "3", weight: "245 lbs", restSeconds: 180, trackingLevel: "full", videoCheckEnabled: true },
                  { exerciseId: testExerciseId("Bench Press"), orderIndex: 1, sets: 5, reps: "3", weight: "205 lbs", restSeconds: 180, trackingLevel: "full", videoCheckEnabled: true },
                  { exerciseId: testExerciseId("Deadlift"), orderIndex: 2, sets: 3, reps: "5", weight: "315 lbs", restSeconds: 180, trackingLevel: "bar_path", videoCheckEnabled: true },
                  { exerciseId: testExerciseId("Box Jump"), orderIndex: 3, sets: 4, reps: "5", weight: "Bodyweight", restSeconds: 90, trackingLevel: "jump", videoCheckEnabled: true },
                  { exerciseId: testExerciseId("Broad Jump"), orderIndex: 4, sets: 3, reps: "3", weight: "Bodyweight", restSeconds: 90, trackingLevel: "jump", videoCheckEnabled: true },
                  { exerciseId: testExerciseId("Hex Bar Jump"), orderIndex: 5, sets: 4, reps: "5", weight: "Bodyweight", restSeconds: 90, trackingLevel: "jump", videoCheckEnabled: true },
                ],
              },
              { dayNumber: 4, title: "Rest Day", isRestDay: true, exercises: [] },
              {
                dayNumber: 5,
                title: "Video Check Day",
                isRestDay: false,
                exercises: [
                  { exerciseId: testExerciseId("Back Squat"), orderIndex: 0, sets: 3, reps: "5", weight: "205 lbs", restSeconds: 150, videoCheckEnabled: true },
                  { exerciseId: testExerciseId("Overhead Press"), orderIndex: 1, sets: 3, reps: "6", weight: "85 lbs", restSeconds: 90, videoCheckEnabled: true },
                  { exerciseId: testExerciseId("Bulgarian Split Squat"), orderIndex: 2, sets: 3, reps: "8/side", weight: "Bodyweight", restSeconds: 90, videoCheckEnabled: true },
                  { exerciseId: testExerciseId("Deadlift"), orderIndex: 3, sets: 3, reps: "5", weight: "275 lbs", restSeconds: 150, videoCheckEnabled: true },
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
                  { exerciseId: testExerciseId("Back Squat"), orderIndex: 0, sets: 4, reps: "3", weight: "80% 1RM", restSeconds: 180 },
                  { exerciseId: testExerciseId("Bench Press"), orderIndex: 1, sets: 4, reps: "5", weight: "75% 1RM", restSeconds: 150 },
                  { exerciseId: testExerciseId("Deadlift"), orderIndex: 2, sets: 3, reps: "3", weight: "85% 1RM", restSeconds: 180 },
                  { exerciseId: testExerciseId("Overhead Press"), orderIndex: 3, sets: 3, reps: "6", weight: "70% 1RM", restSeconds: 90 },
                ],
              },
              {
                dayNumber: 2,
                title: "Kitchen Sink Day",
                isRestDay: false,
                exercises: [
                  { exerciseId: testExerciseId("Back Squat"), orderIndex: 0, sets: 3, reps: "3", weight: "75% 1RM", restSeconds: 180, supersetGroup: "test-super-d", trackingLevel: "full", videoCheckEnabled: true },
                  { exerciseId: testExerciseId("Deadlift"), orderIndex: 1, sets: 3, reps: "3", weight: "70% 1RM", restSeconds: 180, supersetGroup: "test-super-d", trackingLevel: "bar_path", videoCheckEnabled: true },
                  { exerciseId: testExerciseId("Incline Dumbbell Press"), orderIndex: 2, sets: 3, reps: "10", weight: "65 lbs", restSeconds: 75, supersetGroup: "test-super-e" },
                  { exerciseId: testExerciseId("Chest-Supported Row"), orderIndex: 3, sets: 3, reps: "10", weight: "55 lbs", restSeconds: 75, supersetGroup: "test-super-e" },
                  { exerciseId: testExerciseId("Plank"), orderIndex: 4, sets: 3, reps: "60s hold", weight: "Bodyweight", restSeconds: 60 },
                ],
              },
              {
                dayNumber: 3,
                title: "Corrective Focus Day",
                isRestDay: false,
                exercises: [
                  { exerciseId: testExerciseId("Goblet Squat"), orderIndex: 0, sets: 3, reps: "10", weight: "53 lbs", restSeconds: 75 },
                  { exerciseId: testExerciseId("Farmer's Carry"), orderIndex: 1, sets: 3, reps: "40yd", weight: "70 lbs/hand", restSeconds: 90 },
                ],
              },
              { dayNumber: 4, title: "Rest Day", isRestDay: true, exercises: [] },
              {
                dayNumber: 5,
                title: "Final Gauntlet",
                isRestDay: false,
                exercises: [
                  { exerciseId: testExerciseId("Back Extension"), orderIndex: 0, sets: 3, reps: "12", weight: "Bodyweight", restSeconds: 60 },
                  { exerciseId: testExerciseId("Barbell Shrug"), orderIndex: 1, sets: 3, reps: "10", weight: "185 lbs", restSeconds: 60 },
                  { exerciseId: testExerciseId("Cable Crunch"), orderIndex: 2, sets: 3, reps: "15", weight: "60 lbs", restSeconds: 45 },
                  { exerciseId: testExerciseId("Close-Grip Bench Press"), orderIndex: 3, sets: 3, reps: "8", weight: "135 lbs", restSeconds: 90 },
                  { exerciseId: testExerciseId("Hip Thrust"), orderIndex: 4, sets: 3, reps: "10", weight: "185 lbs", restSeconds: 90 },
                  { exerciseId: testExerciseId("Lat Pulldown"), orderIndex: 5, sets: 3, reps: "10", weight: "120 lbs", restSeconds: 75 },
                  { exerciseId: testExerciseId("Pallof Press"), orderIndex: 6, sets: 3, reps: "10/side", weight: "30 lbs", restSeconds: 45 },
                  { exerciseId: testExerciseId("Russian Twist"), orderIndex: 7, sets: 3, reps: "20", weight: "20 lbs", restSeconds: 45 },
                  { exerciseId: testExerciseId("Standing Calf Raise"), orderIndex: 8, sets: 4, reps: "12", weight: "225 lbs", restSeconds: 60 },
                ],
              },
              { dayNumber: 6, title: "Rest Day", isRestDay: true, exercises: [] },
              { dayNumber: 7, title: "Rest Day", isRestDay: true, exercises: [] },
            ],
          },
        ],
      });

      const fullTestProgram = await storage.getProgramFull(testProgram.id);
      const correctiveDay = fullTestProgram?.weeks
        .flatMap((w) => w.days)
        .find((d) => d.title === "Corrective Focus Day");

      const testStartDate = new Date().toISOString().slice(0, 10);
      let testDateOverrides: Record<string, string> | undefined;
      if (correctiveDay) {
        const start = new Date(testStartDate + "T00:00:00Z");
        const offsetDays = (2 - 1) * 7 + (correctiveDay.dayNumber - 1);
        const defaultDate = new Date(start.getTime() + offsetDays * 86400000);
        const overriddenDate = new Date(defaultDate.getTime() + 7 * 86400000);
        testDateOverrides = { [String(correctiveDay.id)]: overriddenDate.toISOString().slice(0, 10) };
      }

      // Assigned by the demo coach (not the Forge identity, which has no
      // roster) so it shows up as a real assignment on the demo athlete,
      // exactly like a coach assigning a Forge-official program in practice.
      const { created: testCreated } = await storage.createAssignment(
        coach.id,
        testProgram.id,
        [{ athleteId: athlete.id, correctivesEnabled: true }],
        testStartDate,
        testDateOverrides,
      );

      if (correctiveDay) {
        await storage.updateCorrectivesForAssignmentDay(testCreated[0].id, correctiveDay.id, {
          correctives: [
            { exerciseId: testExerciseId("Ankle Dorsiflexion Mobilization"), orderIndex: 0, sets: 2, reps: "10/side", weight: null },
            { exerciseId: testExerciseId("World's Greatest Stretch"), orderIndex: 1, sets: 2, reps: "6/side", weight: null },
            { exerciseId: testExerciseId("Band External Rotation"), orderIndex: 2, sets: 2, reps: "15/side", weight: null },
          ],
        }, coach.id);
      }

      console.log(`Created "Test Program" (id ${testProgram.id}), owned by Forge identity ${forgeIdentity.id}.`);
    }
  }

  // One-time production fixup for "Bar Speed & Jump Lab" specifically: when
  // that day was first seeded (2026-08-05, commit a0381a4) its
  // trackingLevel-on exercises didn't set videoCheckEnabled -- still a valid
  // independent choice at the time, since the coach-facing camera control
  // didn't collapse the two into one toggle until later that same day (see
  // video-tracking-toggle.tsx's own comment on the refactor and the legacy
  // state it left reachable). Ever since, turning tracking on has always
  // meant capturing video too, so any environment whose "Test Program" got
  // created before the literal fix above landed is stuck with a day that
  // silently never saves a clip no matter how many sets get tracked on it --
  // the toggle still *displays* "Video: On" for it (isOn there reads
  // trackingLevel alone), so nothing about the coach UI reveals the gap.
  // This is the exact trap a coach hit testing the AR bar tracker on Jordan
  // Athlete's seeded Bench Press set (that assignment is created above,
  // straight onto the demo athlete's real roster -- see "Assigned by the
  // demo coach" comment there). Runs on every deploy forever, like the
  // fixups above; each no-ops once applied. Scoped to this one named day of
  // this one seeded program, never a real coach's own data -- and routed
  // through resolveVideoCheckEnabled so a since-restricted exercise still
  // can't be flipped on here either.
  {
    const testProgramRow = await db.query.programs.findFirst({ where: eq(programs.name, "Test Program") });
    if (testProgramRow) {
      const full = await storage.getProgramFull(testProgramRow.id);
      const staleDay = full?.weeks.flatMap((w) => w.days).find((d) => d.title === "Bar Speed & Jump Lab");
      const staleExercises = (staleDay?.exercises ?? []).filter(
        (ex) => ex.trackingLevel !== "none" && !ex.videoCheckEnabled,
      );
      if (staleExercises.length > 0) {
        const requests = staleExercises.map((ex) => ({ ref: ex, exerciseId: ex.exerciseId, videoCheckEnabled: true }));
        const videoCheckMap = await storage.resolveVideoCheckEnabled(requests);
        let fixed = 0;
        for (const req of requests) {
          if (!videoCheckMap.get(req)) continue;
          await db.update(programExercises).set({ videoCheckEnabled: true }).where(eq(programExercises.id, req.ref.id));
          fixed++;
        }
        if (fixed > 0) {
          console.log(
            `Backfilled videoCheckEnabled=true on ${fixed} stale "Bar Speed & Jump Lab" exercise(s) in "Test Program" (id ${testProgramRow.id}).`,
          );
        }
      }
    }
  }

  // One-time backfill (fully idempotent -- only ever touches rows where the
  // column is still NULL, never overwrites a coach's own choice): most of
  // the exercise library predates the bodyRegion/plane classification
  // fields, so without this the new filters/AI context would be empty for
  // almost everything already in the bank. Heuristic, not authoritative --
  // a coach can always correct an individual exercise afterward via the
  // edit form, same as any other tag.
  {
    const LOWER_BODY_MUSCLES = new Set([
      "Quads", "Hamstrings", "Glutes", "Calves", "Hip Flexors", "Adductors", "Ankle",
    ]);
    const UPPER_BODY_MUSCLES = new Set([
      "Chest", "Back", "Lats", "Traps", "Shoulders", "Biceps", "Triceps", "Forearms", "Neck",
    ]);
    const CORE_MUSCLES = new Set(["Core", "Abs", "Obliques", "Lower Back"]);

    function inferBodyRegion(muscleGroup: string): string | null {
      if (LOWER_BODY_MUSCLES.has(muscleGroup)) return "Lower Body";
      if (UPPER_BODY_MUSCLES.has(muscleGroup)) return "Upper Body";
      if (CORE_MUSCLES.has(muscleGroup)) return "Core";
      if (muscleGroup === "Full Body") return "Full Body";
      return null;
    }

    // Only Push/Press/Pull carries a meaningful horizontal/vertical split --
    // a chest- or back-tagged exercise in one of those movement types reads
    // as horizontal (bench press, rows), a shoulders- or lats-tagged one as
    // vertical (overhead press, pull-ups/lat pulldown).
    function inferPlane(movementType: string | null, muscleGroup: string): string | null {
      if (!movementType || !["Push", "Press", "Pull"].includes(movementType)) return null;
      if (muscleGroup === "Chest" || muscleGroup === "Back") return "Horizontal";
      if (muscleGroup === "Shoulders" || muscleGroup === "Lats") return "Vertical";
      return null;
    }

    const untagged = await db.query.exercises.findMany({
      where: and(isNull(exercises.bodyRegion), isNull(exercises.plane)),
    });
    let backfilled = 0;
    for (const ex of untagged) {
      const bodyRegion = inferBodyRegion(ex.muscleGroup);
      const plane = inferPlane(ex.movementType, ex.muscleGroup);
      if (bodyRegion || plane) {
        await db
          .update(exercises)
          .set({ bodyRegion, plane })
          .where(eq(exercises.id, ex.id));
        backfilled++;
      }
    }
    if (backfilled > 0) {
      console.log(`Backfilled bodyRegion/plane on ${backfilled} existing exercise(s).`);
    }
  }

  // One-time backfill (fully idempotent -- only ever touches rows where
  // signupSport is still NULL): existing accounts predate users.signupSport
  // (added for the Skill Bank sport-paywall), so without this every
  // pre-feature athlete would lose access to their own sport's drills the
  // moment the lock went live. Copies the current (mutable) sport into the
  // new immutable snapshot field exactly once -- afterward the two diverge
  // on purpose if the athlete edits their profile sport later.
  {
    const usersNeedingSignupSport = await db.query.users.findMany({
      where: isNull(users.signupSport),
    });
    let signupSportBackfilled = 0;
    for (const u of usersNeedingSignupSport) {
      if (!u.sport) continue;
      await db.update(users).set({ signupSport: u.sport }).where(eq(users.id, u.id));
      signupSportBackfilled++;
    }
    if (signupSportBackfilled > 0) {
      console.log(`Backfilled signupSport on ${signupSportBackfilled} existing account(s).`);
    }
  }

  // One-time backfill (fully idempotent -- only ever touches rows where the
  // column is still NULL, never overwrites a coach's own choice) of the
  // movementComplexity axis (Compound/Isolation/Combination) across the
  // ENTIRE existing exercise library, not just newly-seeded combination
  // exercises -- see movementComplexity's own comment in shared/schema.ts.
  // Heuristic, not authoritative, same posture as the bodyRegion/plane
  // backfill above: a coach can always correct an individual exercise
  // afterward via the edit form.
  //
  // The tricky part is that neither category nor movementType alone
  // reliably signals compound vs. isolation in this library -- e.g.
  // "Bulgarian Split Squat" is tagged category "accessory" (it's not a
  // day's MAIN lift) despite being a genuinely multi-joint, compound lunge
  // pattern, and "Barbell Curl" carries movementType "Pull" (the same tag
  // a compound row or pull-up gets) despite being single-joint isolation
  // work. So this leans on muscleGroup + a small set of well-known
  // single-joint name keywords for the ambiguous cases, and only trusts
  // movementType directly for the movement types that are unambiguously
  // multi-joint by definition (there's no isolated version of a squat, a
  // hinge, a lunge, a carry, or a rotational throw).
  {
    const movementComplexityToBackfill = await db.query.exercises.findMany({
      where: isNull(exercises.movementComplexity),
    });

    // Muscle groups essentially always trained single-joint by gym
    // convention, regardless of movementType or category tag.
    const ISOLATION_MUSCLES = new Set(["Biceps", "Triceps", "Forearms", "Calves"]);
    // Movement types that are inherently multi-joint -- no single-joint
    // version of a squat/hinge/lunge/carry/rotational-throw exists in
    // standard strength & conditioning vocabulary.
    const COMPOUND_MOVEMENT_TYPES = new Set(["Squat", "Hinge", "Lunge", "Carry", "Rotation"]);
    // Name keywords for the well-known single-joint exercises that live on
    // a larger muscle group's tag and would otherwise read as compound
    // (Leg Extension/Leg Curl on Quads/Hamstrings, Lateral/Front Raise and
    // Face Pull on Shoulders, a Chest/Rear-Delt Fly, a Shrug on Traps).
    const ISOLATION_NAME_HINTS = [
      "curl", "extension", "raise", "kickback", "pushdown", "fly", "flye",
      "pec deck", "face pull", "shrug", "wrist",
    ];

    function inferMovementComplexity(
      category: string,
      movementType: string | null,
      muscleGroup: string,
      name: string,
    ): string | null {
      if (movementType === "Combination") return "Combination";
      // Checked before the isolation-muscle-group shortcut below so it
      // always wins -- e.g. a Suitcase Carry is tagged muscleGroup
      // "Forearms" for its grip demand, but the carry itself loads the
      // whole body, so it must never fall through to "Isolation" just
      // because Forearms is usually a reliable isolation signal.
      if (movementType && COMPOUND_MOVEMENT_TYPES.has(movementType)) return "Compound";
      // Only trust the isolation-muscle-group/name-keyword signals for
      // actual resistance-training categories -- a conditioning-modality
      // exercise (Jump Rope, an assault bike) isn't a deliberate
      // single-joint accessory lift just because its tagged muscleGroup
      // happens to be a small one like Calves.
      if (category !== "conditioning") {
        if (ISOLATION_MUSCLES.has(muscleGroup)) return "Isolation";
        const nm = name.toLowerCase();
        if (
          muscleGroup !== "Full Body" &&
          ISOLATION_NAME_HINTS.some((hint) => nm.includes(hint))
        ) {
          return "Isolation";
        }
      }
      if (movementType === "Press" || movementType === "Push" || movementType === "Pull") {
        return "Compound";
      }
      return null;
    }

    let complexityBackfilled = 0;
    for (const ex of movementComplexityToBackfill) {
      const movementComplexity = inferMovementComplexity(
        ex.category,
        ex.movementType,
        ex.muscleGroup,
        ex.name,
      );
      if (!movementComplexity) continue;
      await db.update(exercises).set({ movementComplexity }).where(eq(exercises.id, ex.id));
      complexityBackfilled++;
    }
    if (complexityBackfilled > 0) {
      console.log(`Backfilled movementComplexity on ${complexityBackfilled} existing exercise(s).`);
    }
  }

  // Placeholder clickwrap agreement -- only seeded if the singleton row
  // doesn't already have real content, so an admin's own edit (via
  // PUT /api/admin/legal-agreement) is never clobbered by a later
  // redeploy re-running this script. Generic, honest starter language, not
  // a substitute for actual legal review -- flagged as such inline so
  // nobody mistakes it for a reviewed document.
  const existingAgreement = await storage.getLegalAgreement();
  if (existingAgreement === "No agreement has been configured yet.") {
    await storage.updateLegalAgreement(
      `PLACEHOLDER -- replace with your own reviewed terms before relying on this.

By creating an account, you agree to use Forge to support, not replace, sound judgment about your own or your athletes' training and health. Forge's tracking, analytics, and AI-generated suggestions are informational aids for coaches and athletes; they are never a substitute for professional medical, athletic training, or coaching judgment, and nothing in the app should be treated as medical advice.

You're responsible for the accuracy of what you or your athletes log, and for stopping any exercise that causes pain or feels unsafe. Coaches are responsible for appropriately supervising and modifying training for their own athletes.

Forge stores the training, health-status, and performance data you provide in order to run the features you use (programming, analytics, camera-based tracking, nutrition logging). Don't enter anyone else's personal information without their permission to do so.`,
    );
  }

  // Healthcare-provider HIPAA-transparency notice -- appended to whatever
  // legalAgreement content is currently live (the placeholder above, or an
  // admin's own edit) rather than only seeded on a fresh install, since
  // this needs to reach real users today, not just future signups. Marker
  // string makes this idempotent across every redeploy: runs once, then a
  // permanent no-op, and never touches anything else in the document. Full
  // and honest by design -- lists what Forge actually does to secure data
  // (real, checkable mechanisms, not marketing language) alongside what it
  // does not yet have, exactly as it would be described to a lawyer.
  const HEALTHCARE_NOTICE_MARKER = "A note for physical therapists, physicians, and other licensed clinicians";
  const currentAgreement = await storage.getLegalAgreement();
  if (!currentAgreement.includes(HEALTHCARE_NOTICE_MARKER)) {
    const healthcareNotice = `${HEALTHCARE_NOTICE_MARKER}:

Forge is built for athletic training and coaching, not clinical care -- it is not currently HIPAA compliant. If you're a physical therapist, physician, athletic trainer, or other licensed clinician considering using Forge with patients: please don't enter Protected Health Information (PHI) or treat Forge as your system of record for patient care. Forge has not signed a Business Associate Agreement (BAA) with any vendor, has not completed a formal HIPAA Security Risk Assessment, and has not been independently audited for HIPAA compliance.

Here's what Forge does do to protect the data it holds, in full:
- All traffic runs over HTTPS, and login sessions use signed, expiring cookies.
- Uploaded videos (form-check and skill clips) and coach-drawn annotations on them are protected by short-lived, cryptographically signed links, not public URLs -- a link expires within hours and only ever reaches someone the app already verified was allowed to see that specific person's video.
- For users under 18, raw video is automatically deleted after a set window (30 days under age 13, 90 days ages 13-17); performance numbers derived from that video are kept, but the footage itself is not retained indefinitely.
- Every terms-of-service acceptance is written to an immutable, insert-only audit log (timestamp, IP address, the exact document version shown).
- Any user can permanently delete their own account and every video tied to it themselves, at any time.
- Forge does not send user data to any third-party analytics or advertising tool -- there is no Google Analytics, Meta Pixel, Mixpanel, or similar tool anywhere in the app. The one exception is Sentry, used strictly for crash/error monitoring: it's configured to collect no cookies, headers, request/response bodies, database query data, or stack-frame variable values, and every error is passed through an additional filter that redacts anything email-shaped before it's sent.
- The only feature that reports on athletes in aggregate strips names, emails, and team affiliation, and refuses to display any group smaller than five people.

And what we don't have yet, stated plainly: no signed BAAs with our hosting or infrastructure vendors, no completed HIPAA Security Risk Assessment, no PHI-grade audit logging across the whole app (today that level of logging only covers video access), and no outside compliance certification. If your use case involves documenting patient assessments, diagnoses, or treatment plans, Forge is not yet the right tool for that -- we'd rather tell you now than have you find out later.`;
    await storage.updateLegalAgreement(
      currentAgreement === "No agreement has been configured yet."
        ? healthcareNotice
        : `${currentAgreement}\n\n${healthcareNotice}`,
    );
  }

  // One-time correction: the healthcare notice above originally claimed Sentry wasn't used at
  // all, which stopped being true once server/index.ts and client/src/main.tsx actually wired
  // error monitoring up for real. Same idempotent-patch shape as the two blocks above -- finds
  // the exact stale sentence in whatever's currently live and replaces it in place, a permanent
  // no-op on every redeploy after the first successful run, and leaves every other part of the
  // document (including any admin edits made since) untouched.
  const STALE_SENTRY_CLAIM =
    "Forge does not send user data to any third-party analytics or error-tracking service -- there is no Google Analytics, Meta Pixel, Sentry, Mixpanel, or similar tool anywhere in the app.";
  const CORRECTED_SENTRY_CLAIM =
    "Forge does not send user data to any third-party analytics or advertising tool -- there is no Google Analytics, Meta Pixel, Mixpanel, or similar tool anywhere in the app. The one exception is Sentry, used strictly for crash/error monitoring: it's configured to collect no cookies, headers, request/response bodies, database query data, or stack-frame variable values, and every error is passed through an additional filter that redacts anything email-shaped before it's sent.";
  const agreementForSentryFix = await storage.getLegalAgreement();
  if (agreementForSentryFix.includes(STALE_SENTRY_CLAIM)) {
    await storage.updateLegalAgreement(agreementForSentryFix.replace(STALE_SENTRY_CLAIM, CORRECTED_SENTRY_CLAIM));
  }

  // Draft Terms of Service / Privacy Policy / Biometric Waiver -- same
  // "only if not already there" guard as the legalAgreement placeholder
  // above, so a redeploy never overwrites an admin's edits to any of them.
  if (!(await storage.getLegalDocument("terms_of_service"))) {
    await storage.updateLegalDocument("terms_of_service", TERMS_OF_SERVICE_DRAFT);
  }
  if (!(await storage.getLegalDocument("privacy_policy"))) {
    await storage.updateLegalDocument("privacy_policy", PRIVACY_POLICY_DRAFT);
  }
  if (!(await storage.getLegalDocument("biometric_waiver"))) {
    await storage.updateLegalDocument("biometric_waiver", BIOMETRIC_WAIVER_DRAFT);
  }
  if (!(await storage.getLegalDocument("parental_notice"))) {
    await storage.updateLegalDocument("parental_notice", PARENTAL_NOTICE_DRAFT);
  }
  if (!(await storage.getLegalDocument("institutional_agreement"))) {
    await storage.updateLegalDocument("institutional_agreement", INSTITUTIONAL_AGREEMENT_DRAFT);
  }

  console.log("Seed complete.");
  // The published passwords below are only real in dev -- see demoPassword's own comment.
  // Printing them in a production log would be misleading (they're random there, not these
  // literals) without being useful (nobody's meant to actually use these accounts in prod).
  if (process.env.NODE_ENV !== "production") {
    console.log("Coach login: coach@forge.app / coach123");
    console.log("Athlete login: athlete@forge.app / athlete123");
    console.log("Free Agent login: freeagent@forge.app / freeagent123");
  }
  console.log(`Coach code: ${coach.coachCode}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
