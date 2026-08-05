import "dotenv/config";
import { db } from "./db";
import { storage } from "./storage";
import { hashPassword } from "./auth-utils";
import { users, programs } from "@shared/schema";
import { eq } from "drizzle-orm";

// We don't have live web access from this environment to verify specific
// YouTube video IDs are real and still online, so hand-picking exact links
// risks seeding dead or wrong embeds. A search link is always valid and
// always relevant; the athlete's video player auto-upgrades to a real
// embedded player the moment a coach edits the exercise with a direct link.
function videoSearchUrl(name: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise tutorial`)}`;
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
  // logins are -- Forge library curation, plus the same personal
  // calendar/training/AI-program-chat features every admin account gets
  // (no roster access, though -- that stays coach-only).
  let demoAdmin = await storage.getUserByEmail("admin@forge.app");
  if (!demoAdmin) {
    demoAdmin = await storage.createUser({
      email: "admin@forge.app",
      passwordHash: await hashPassword("admin123"),
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
      passwordHash: await hashPassword("freeagent123"),
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
        instructions: "Bar on back, hips and knees drive together, chest up.",
      },
      {
        name: "Bench Press",
        category: "strength" as const,
        muscleGroup: "Chest",
        secondaryMuscles: ["Shoulders", "Triceps", "Core"],
        equipment: "Barbell",
        movementType: "Push",
        laterality: "bilateral" as const,
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
        instructions: "Hold dumbbell at chest, squat between the knees, elbows brush inner thighs at the bottom.",
      },
      {
        name: "Bulgarian Split Squat",
        category: "accessory" as const,
        muscleGroup: "Quads",
        secondaryMuscles: ["Glutes", "Hamstrings", "Adductors", "Core"],
        equipment: "Dumbbell",
        movementType: "Lunge",
        laterality: "unilateral" as const,
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
        name: "Bent-Over Row",
        category: "strength" as const,
        muscleGroup: "Back",
        secondaryMuscles: ["Lats", "Biceps", "Traps", "Lower Back"],
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
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
        instructions: "Hands just inside shoulder width, elbows tucked, press to lockout.",
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
        instructions: "Wide grip, pull the bar from the floor to overhead in one continuous motion.",
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
        instructions: "Sit tall, row the handle to your torso, squeeze shoulder blades without leaning back.",
      },
      {
        name: "Face Pull",
        category: "accessory" as const,
        muscleGroup: "Shoulders",
        secondaryMuscles: ["Back", "Traps"],
        equipment: "Cable",
        movementType: "Pull",
        laterality: "bilateral" as const,
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
        instructions: "Soft knees, push hips back and lower the bar along your legs, drive hips forward to stand.",
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
        instructions: "Balance on one leg, reach the free foot out to tap the floor in front, to the side, and behind, resetting balance each time.",
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
        instructions: "Bar set just below the knee in a rack, hinge and pull to full lockout, control the return.",
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
        instructions: "Rotate away from a wall then explosively throw the ball into it, catch and repeat.",
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
        instructions: "Step off a box, land softly, and immediately explode upward with minimal ground contact time.",
      },
      {
        name: "Lateral Bound",
        category: "plyometric" as const,
        muscleGroup: "Glutes",
        secondaryMuscles: ["Quads", "Adductors", "Calves"],
        equipment: "Bodyweight",
        movementType: "Lunge",
        laterality: "unilateral" as const,
        instructions: "Push explosively sideways off one leg, stick the landing on the other before bounding back.",
      },
      {
        name: "Power Clean",
        category: "olympic" as const,
        muscleGroup: "Full Body",
        secondaryMuscles: ["Quads", "Glutes", "Traps", "Back", "Core"],
        equipment: "Barbell",
        movementType: "Pull",
        laterality: "bilateral" as const,
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
                exercises: [
                  { exerciseId: testExerciseId("Back Squat"), orderIndex: 0, sets: 5, reps: "3", weight: "245 lbs", restSeconds: 180, trackingLevel: "full" },
                  { exerciseId: testExerciseId("Bench Press"), orderIndex: 1, sets: 5, reps: "3", weight: "205 lbs", restSeconds: 180, trackingLevel: "full" },
                  { exerciseId: testExerciseId("Deadlift"), orderIndex: 2, sets: 3, reps: "5", weight: "315 lbs", restSeconds: 180, trackingLevel: "bar_path" },
                  { exerciseId: testExerciseId("Box Jump"), orderIndex: 3, sets: 4, reps: "5", weight: "Bodyweight", restSeconds: 90, trackingLevel: "jump" },
                  { exerciseId: testExerciseId("Broad Jump"), orderIndex: 4, sets: 3, reps: "3", weight: "Bodyweight", restSeconds: 90, trackingLevel: "jump" },
                  { exerciseId: testExerciseId("Hex Bar Jump"), orderIndex: 5, sets: 4, reps: "5", weight: "Bodyweight", restSeconds: 90, trackingLevel: "jump" },
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
        });
      }

      console.log(`Created "Test Program" (id ${testProgram.id}), owned by Forge identity ${forgeIdentity.id}.`);
    }
  }

  console.log("Seed complete.");
  console.log("Coach login: coach@forge.app / coach123");
  console.log("Athlete login: athlete@forge.app / athlete123");
  console.log("Free Agent login: freeagent@forge.app / freeagent123");
  console.log(`Coach code: ${coach.coachCode}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
