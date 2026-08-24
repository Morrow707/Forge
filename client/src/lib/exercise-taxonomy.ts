export const MOVEMENT_TYPES = [
  "Squat",
  "Hinge",
  "Lunge",
  "Push",
  "Press",
  "Pull",
  "Carry",
  "Rotation",
  "Isometric",
  "Mobility",
  "Activation",
  "Combination",
];

// A third classification axis alongside MOVEMENT_TYPES/BODY_REGIONS/PLANES
// below -- how many joints/patterns a rep actually involves, not which
// pattern it is. "Compound" (multi-joint: a squat, a bench press, a row),
// "Isolation" (single-joint, one target muscle: a curl, a leg extension),
// or "Combination" (two or more different patterns chained into one
// continuous rep: a step-up into a shoulder press) -- see
// COMBINATION_EXERCISE_TRAINING_PRINCIPLES in storage.ts for why
// combination exercises are their own bucket rather than just "compound."
export const MOVEMENT_COMPLEXITIES = ["Compound", "Isolation", "Combination"];

// Two more classification axes layered on top of MOVEMENT_TYPES -- neither
// replaces it, both narrow it further, so a training split like "upper
// push, horizontal only" or "lower body day" can be queried directly by a
// coach or the AI program builder instead of eyeballing muscleGroup.
// BODY_REGIONS applies to any exercise; PLANES is only meaningful
// alongside a Push/Press/Pull movementType (a squat or hinge has no
// horizontal/vertical distinction worth tagging).
export const BODY_REGIONS = ["Upper Body", "Lower Body", "Full Body", "Core"];

export const PLANES = ["Horizontal", "Vertical"];

export const SPORTS = [
  "Football",
  "Basketball",
  "Baseball",
  "Softball",
  "Soccer",
  "Volleyball",
  "Wrestling",
  "Boxing",
  "MMA",
  "Martial Arts",
  "Track & Field",
  "Swimming",
  "Diving",
  "Lacrosse",
  "Ice Hockey",
  "Field Hockey",
  "Tennis",
  "Badminton",
  "Golf",
  "Cross Country",
  "Gymnastics",
  "Cheerleading",
  "Rugby",
  "Water Polo",
  "Rowing",
  "Skiing",
  "Snowboarding",
  "Cycling",
  "Fencing",
  "Powerlifting",
  "Olympic Weightlifting",
];

export const MUSCLE_GROUPS = [
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Hip Flexors",
  "Adductors",
  "Chest",
  "Back",
  "Lats",
  "Traps",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Forearms",
  "Core",
  "Abs",
  "Obliques",
  "Lower Back",
  "Neck",
  "Ankle",
  "Full Body",
];
