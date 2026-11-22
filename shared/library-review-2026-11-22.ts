/**
 * THE 2026-11-22 LIBRARY REVIEW: which Forge exercises and skill drills are HIDDEN, and where a
 * merged name now points.
 *
 * Scott approved the review in full ("a, apply all of them"). Every verdict, its reason and its
 * sources are in the review files the decision was made from; this module carries only what the
 * code needs: the hidden names and, for a merge, the kept name.
 *
 * HIDDEN IS NOT DELETED. Logged sets, assignments and program rows reference these rows by id and
 * keep showing their names. A hidden row is left out of the library, the picker, search and new AI
 * suggestions. The seed hides them by exact name on rows the library owner owns
 * (server/seed-data/library-review-2026-11-22.ts), so a coach's own exercise with the same name is
 * never touched, and an admin can bring one back from the Forge Library's Hidden filter.
 *
 * A MERGED NAME STILL FINDS SOMETHING. Typing "Prowler Push" or "Pec Deck" lands on the kept
 * exercise: shared/exercise-search.ts reads MERGED_EXERCISE_ALIASES as nicknames, derived from this
 * list so the two cannot drift.
 *
 * The review's "unsure" items are deliberately absent and left exactly as they are:
 *   exercises: Deficit Deadlift, Bench Dip, Neck Bridge, Zercher Squat, Z Press, Larsen Press, JM Press, Tire Flip
 *   skill drills: Resisted Rotation Drill, Reverse Throws (Arm Care), Pull-Down Throwing Drill, Curveball Spin Drill, Cut Block Technique, Gang Tackling Reps
 */

export type HiddenLibraryRow = {
  /** The library name, exactly as seeded. */
  name: string;
  /** The kept name a merge points at; null for a plain retirement. */
  mergeInto: string | null;
};

/** 94 merged and 40 retired exercises. */
export const HIDDEN_EXERCISES: readonly HiddenLibraryRow[] = [
  { name: "Machine Row", mergeInto: "Seated Cable Row" },
  { name: "EZ-Bar Curl", mergeInto: "Barbell Curl" },
  { name: "Fire Hydrant", mergeInto: "Clamshell" },
  { name: "Standing Hip Circle", mergeInto: "Hip CARs" },
  { name: "Suitcase Hold", mergeInto: "Suitcase Carry" },
  { name: "Decline Bench Press", mergeInto: null },
  { name: "Reverse-Grip Lat Pulldown", mergeInto: "Lat Pulldown" },
  { name: "Meadows Row", mergeInto: "Single-Arm Dumbbell Row" },
  { name: "Concentration Curl", mergeInto: "Dumbbell Curl" },
  { name: "Toes-to-Bar", mergeInto: "Hanging Leg Raise" },
  { name: "Weighted Plank", mergeInto: "Plank" },
  { name: "Goblet Squat to Overhead Press", mergeInto: "Dumbbell Thruster" },
  { name: "Squat to Bicep Curl", mergeInto: null },
  { name: "Squat to Upright Row", mergeInto: null },
  { name: "Sumo Squat to Overhead Press", mergeInto: "Dumbbell Thruster" },
  { name: "Squat to Front Raise", mergeInto: null },
  { name: "Goblet Squat to Hammer Curl", mergeInto: null },
  { name: "Reverse Lunge to Bicep Curl", mergeInto: null },
  { name: "Walking Lunge with Bicep Curl", mergeInto: null },
  { name: "Walking Lunge with Overhead Press", mergeInto: "Reverse Lunge to Overhead Press" },
  { name: "Curtsy Lunge with Lateral Raise", mergeInto: null },
  { name: "Lateral Lunge with Overhead Press", mergeInto: "Reverse Lunge to Overhead Press" },
  { name: "Reverse Lunge with Front Raise", mergeInto: null },
  { name: "Reverse Lunge with Tricep Kickback", mergeInto: null },
  { name: "Split Squat with Hammer Curl", mergeInto: null },
  { name: "Walking Lunge with Overhead Tricep Extension", mergeInto: null },
  { name: "Step-Up with Bicep Curl", mergeInto: null },
  { name: "Step-Up with Lateral Raise", mergeInto: null },
  { name: "Step-Up with Front Raise", mergeInto: null },
  { name: "Step-Up with Hammer Curl", mergeInto: null },
  { name: "Step-Up to Push Press", mergeInto: "Step-Up to Shoulder Press" },
  { name: "Deadlift to Upright Row", mergeInto: null },
  { name: "Romanian Deadlift to Bicep Curl", mergeInto: null },
  { name: "Kettlebell Swing to Goblet Squat", mergeInto: null },
  { name: "Push-Up to Renegade Row", mergeInto: "Renegade Row" },
  { name: "Bear Crawl to Push-Up", mergeInto: "Bear Crawl" },
  { name: "Burpee to Overhead Press", mergeInto: "Man Maker" },
  { name: "Lunge with Woodchopper", mergeInto: "Squat with Woodchopper" },
  { name: "Step-Up with Woodchopper", mergeInto: "Squat with Woodchopper" },
  { name: "Squat to Push Press", mergeInto: "Dumbbell Thruster" },
  { name: "Lateral Lunge with Bicep Curl", mergeInto: null },
  { name: "Curtsy Lunge with Bicep Curl", mergeInto: null },
  { name: "Deadlift to Hammer Curl", mergeInto: null },
  { name: "Suitcase Deadlift to Row", mergeInto: "Deadlift to Bent-Over Row" },
  { name: "Goblet Squat with Front Raise", mergeInto: null },
  { name: "Box Step-Up with Overhead Tricep Extension", mergeInto: null },
  { name: "Reverse Lunge to Bicep Curl to Press", mergeInto: null },
  { name: "Squat to Bicep Curl to Press", mergeInto: null },
  { name: "Pin Squat", mergeInto: "Pause Back Squat" },
  { name: "Pause Front Squat", mergeInto: "Front Squat" },
  { name: "Cambered Bar Squat", mergeInto: "Safety Bar Squat" },
  { name: "Stiff-Leg Deadlift", mergeInto: "Romanian Deadlift" },
  { name: "Block Pull", mergeInto: "Rack Pull" },
  { name: "Seated Good Morning", mergeInto: null },
  { name: "Dumbbell Sumo Deadlift", mergeInto: "Dumbbell Deadlift" },
  { name: "Behind-the-Neck Press", mergeInto: null },
  { name: "Seated Barbell Press", mergeInto: "Barbell Shoulder Press" },
  { name: "Viking Press", mergeInto: "Landmine Press" },
  { name: "Spoto Press", mergeInto: "Paused Bench Press" },
  { name: "Board Press", mergeInto: "Floor Press" },
  { name: "Swiss Bar Bench Press", mergeInto: "Dumbbell Bench Press" },
  { name: "Wide-Grip Bench Press", mergeInto: null },
  { name: "Reverse-Grip Bench Press", mergeInto: null },
  { name: "Pin Press", mergeInto: "Paused Bench Press" },
  { name: "Yates Row", mergeInto: "Bent-Over Row" },
  { name: "Seal Row", mergeInto: "Chest-Supported Row" },
  { name: "Kroc Row", mergeInto: "Single-Arm Dumbbell Row" },
  { name: "Chest-Supported Dumbbell Row", mergeInto: "Chest-Supported Row" },
  { name: "Trap Bar Carry", mergeInto: "Farmer's Carry" },
  { name: "Waiter's Carry", mergeInto: "Overhead Carry" },
  { name: "Zercher Carry", mergeInto: "Sandbag Carry" },
  { name: "Standing Long Jump", mergeInto: "Broad Jump" },
  { name: "Continuous Box Jump", mergeInto: "Box Jump" },
  { name: "Skater Bound", mergeInto: "Lateral Bound" },
  { name: "Drop Jump", mergeInto: "Depth Jump" },
  { name: "Reactive Broad Jump", mergeInto: "Repeated Broad Jump" },
  { name: "Cable Lateral Raise", mergeInto: "Lateral Raise" },
  { name: "Cable Rear Delt Fly", mergeInto: "Rear Delt Fly" },
  { name: "Machine Lateral Raise", mergeInto: "Lateral Raise" },
  { name: "Dumbbell Front Raise", mergeInto: null },
  { name: "Plate Front Raise", mergeInto: null },
  { name: "Egyptian Lateral Raise", mergeInto: "Lateral Raise" },
  { name: "Bent-Over Dumbbell Rear Delt Raise", mergeInto: "Rear Delt Fly" },
  { name: "Incline Cable Fly", mergeInto: "Cable Fly" },
  { name: "Low-to-High Cable Fly", mergeInto: "Cable Fly" },
  { name: "Pec Deck", mergeInto: "Machine Chest Fly" },
  { name: "Svend Press", mergeInto: null },
  { name: "Decline Dumbbell Fly", mergeInto: null },
  { name: "Single-Arm Lat Pulldown", mergeInto: "Lat Pulldown" },
  { name: "Kneeling Lat Pulldown", mergeInto: "Lat Pulldown" },
  { name: "Straight-Arm Pushdown", mergeInto: "Straight-Arm Pulldown" },
  { name: "Cable Pullover", mergeInto: "Straight-Arm Pulldown" },
  { name: "Cable Hammer Curl", mergeInto: "Cable Curl" },
  { name: "Spider Curl", mergeInto: "Preacher Curl" },
  { name: "Drag Curl", mergeInto: "Barbell Curl" },
  { name: "Cross-Body Hammer Curl", mergeInto: "Hammer Curl" },
  { name: "Cable Rope Curl", mergeInto: "Cable Curl" },
  { name: "Bayesian Cable Curl", mergeInto: "Cable Curl" },
  { name: "Cable Overhead Tricep Extension", mergeInto: "Overhead Tricep Extension" },
  { name: "Tate Press", mergeInto: null },
  { name: "Close-Grip Push-Up", mergeInto: "Diamond Push-Up" },
  { name: "Sissy Squat", mergeInto: null },
  { name: "Standing Leg Curl", mergeInto: "Lying Leg Curl" },
  { name: "Frog Pump", mergeInto: "Glute Bridge" },
  { name: "B-Stance Hip Thrust", mergeInto: "Hip Thrust" },
  { name: "Banded Glute Bridge", mergeInto: "Glute Bridge" },
  { name: "Deficit Reverse Lunge", mergeInto: "Reverse Lunge" },
  { name: "Step-Up", mergeInto: "Dumbbell Box Step-Up" },
  { name: "Donkey Calf Raise", mergeInto: "Standing Calf Raise" },
  { name: "Leg Press Calf Raise", mergeInto: "Standing Calf Raise" },
  { name: "Seated Dumbbell Calf Raise", mergeInto: "Seated Calf Raise" },
  { name: "Decline Sit-Up", mergeInto: "Weighted Sit-Up" },
  { name: "Landmine 180", mergeInto: "Landmine Rotation" },
  { name: "Farmer's Hold", mergeInto: "Farmer's Carry" },
  { name: "Sled Backward Drag", mergeInto: "Sled Drag" },
  { name: "Sandbag Get-Up", mergeInto: "Turkish Get-Up" },
  { name: "Battle Rope Alternating Waves", mergeInto: "Battle Ropes" },
  { name: "Battle Rope Slams", mergeInto: "Battle Ropes" },
  { name: "Battle Rope Circles", mergeInto: "Battle Ropes" },
  { name: "Wall Ball to Squat Jump", mergeInto: "Wall Ball" },
  { name: "Renegade Row to Burpee", mergeInto: null },
  { name: "Bear Crawl to Broad Jump", mergeInto: null },
  { name: "Kettlebell Around-the-World", mergeInto: null },
  { name: "Farmer's Carry Shuttle", mergeInto: "Farmer's Carry" },
  { name: "Assault Bike Sprint", mergeInto: "Assault Bike Intervals" },
  { name: "Prowler Push", mergeInto: "Sled Push" },
  { name: "Suicide Sprints", mergeInto: "Shuttle Run" },
  { name: "Thoracic Extension over Foam Roller", mergeInto: "Foam Roll Thoracic Spine" },
  { name: "90/90 Stretch", mergeInto: "90/90 Hip Switch" },
  { name: "Jefferson Curl", mergeInto: null },
  { name: "Spiderman Stretch", mergeInto: "World's Greatest Stretch" },
  { name: "Lizard Stretch", mergeInto: "World's Greatest Stretch" },
  { name: "Thread the Needle", mergeInto: "Quadruped Thoracic Rotation" },
  { name: "Hip Flexor Rock", mergeInto: "Kneeling Hip Flexor Stretch" },
];

/** 37 merged and 2 retired skill drills. */
export const HIDDEN_SKILL_DRILLS: readonly HiddenLibraryRow[] = [
  { name: "Stance-to-Load Walkthrough", mergeInto: "Load and Stride Drill" },
  { name: "Posture Line Drill", mergeInto: "Athletic Stance Hold" },
  { name: "Ball/Strike Recognition Drill", mergeInto: "Take/Swing Decision Drill" },
  { name: "Rhythm-to-Launch Drill", mergeInto: "Load and Stride Drill" },
  { name: "Variable-Speed Batting Practice", mergeInto: "Velocity Variation Round" },
  { name: "Two-Speed Front Toss Drill", mergeInto: "Velocity Variation Round" },
  { name: "Standing Rotational Med Ball Throw", mergeInto: "Rotational Med Ball Scoop Throw" },
  { name: "Random Pitch Sequence Drill", mergeInto: "Competitive At-Bat Simulation" },
  { name: "Barehand Charge Drill", mergeInto: "Slow Roller Drill" },
  { name: "Rapid Fire Throws", mergeInto: "Quick Release Drill" },
  { name: "Blocking Drill - Two Knee", mergeInto: "Blocking Balls in the Dirt" },
  { name: "Framing Low Strikes Drill", mergeInto: "Receiving Drill - Framing" },
  { name: "Throw-Down to Second Drill", mergeInto: "Pop-Time Transfer Drill" },
  { name: "Catcher Footwork Reset Drill", mergeInto: "Pop-Time Transfer Drill" },
  { name: "Ladder Drill - Infield Feet", mergeInto: "Ladder Drill - Icky Shuffle" },
  { name: "First-Step Quickness Drill", mergeInto: "Reactive Start Drill" },
  { name: "Crossover Step Drill", mergeInto: "Crossover Step Acceleration" },
  { name: "Shuffle Step Fielding Drill", mergeInto: "Lateral Shuffle Footwork" },
  { name: "Pivot Footwork Drill (Middle Infield)", mergeInto: "Double Play Turn Drill" },
  { name: "Split-Step Timing Drill", mergeInto: "Split Step Timing" },
  { name: "Long Toss for Pitchers", mergeInto: "Long Toss Progression" },
  { name: "Glove-Side Command Drill", mergeInto: "Bullpen Session - Fastball Command" },
  { name: "Spot-Up Shooting Circuit", mergeInto: "Catch-and-Shoot Reps" },
  { name: "Corner Three Reps", mergeInto: "Catch-and-Shoot Reps" },
  { name: "Two-Ball Alternating Dribble", mergeInto: "Stationary Two-Ball Dribbling" },
  { name: "Between-the-Legs Combo", mergeInto: "Crossover Series" },
  { name: "No-Look Pass Reps", mergeInto: null },
  { name: "Baby Hook Reps", mergeInto: "Jump Hook Reps" },
  { name: "Lateral Mirror Drill", mergeInto: "Mirror Drill - Reactive Footwork" },
  { name: "Chest Control to Volley", mergeInto: "First Touch - Aerial Ball" },
  { name: "Nutmeg Attempt Drill", mergeInto: null },
  { name: "Long Diagonal Passing", mergeInto: "Switching the Field" },
  { name: "Jockeying and Delay", mergeInto: "1v1 Defending Stance" },
  { name: "Serve Receive Pressure Drill", mergeInto: "Serve Receive Reps" },
  { name: "Reading Hitter Approach for Block", mergeInto: "Timing the Block Jump" },
  { name: "Face-Off Explosiveness Reps", mergeInto: "Face-Off Clamp Technique" },
  { name: "Net Approach Footwork", mergeInto: "Approach Shot and Net Transition" },
  { name: "Deceleration Mechanics", mergeInto: "Deceleration and Stick Landing" },
  { name: "Reactive Cone Touch Drill", mergeInto: "Multi-Directional Sprint Cone Drill" },
];

/** Lowercase, punctuation to spaces: the same normalisation exercise-search.ts applies to a query.
 *  Repeated here (four lines) rather than imported, because exercise-search.ts imports this module. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** A merged exercise's name (normalised) -> the kept exercise's name (normalised). */
export const MERGED_EXERCISE_ALIASES: Readonly<Record<string, string>> = Object.fromEntries(
  HIDDEN_EXERCISES.filter((r) => r.mergeInto != null).map((r) => [normalize(r.name), normalize(r.mergeInto!)]),
);

/** Every hidden exercise name, as seeded. */
export const HIDDEN_EXERCISE_NAMES: ReadonlySet<string> = new Set(HIDDEN_EXERCISES.map((r) => r.name));
/** Every hidden skill drill name, as seeded. */
export const HIDDEN_SKILL_DRILL_NAMES: ReadonlySet<string> = new Set(HIDDEN_SKILL_DRILLS.map((r) => r.name));
