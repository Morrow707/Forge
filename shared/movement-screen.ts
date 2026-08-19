// Forge's own functional-movement screen -- the same kind of battery
// FMS(R)/Y-Balance popularized, built and named independently since those
// are trademarked, certification-gated systems. This file is the single
// source of truth for the seeded "Forge Standard Screen" battery (read by
// server/seed.ts and reconcile-schema.ts) and the flagging/formatting rules
// every consumer (coach UI, corrective suggestions, AI context, admin feed)
// shares, so they can never quietly disagree about what a score means.

export type MovementScreenCategory = "postural" | "balance" | "power" | "mobility" | "other";
export type MovementScreenScoreType = "grade_0_3" | "distance_in" | "time_sec" | "asymmetry_pct";
export type MovementScreenSide = "bilateral" | "unilateral";

export type MovementScreenTestDef = {
  testKey: string;
  label: string;
  category: MovementScreenCategory;
  scoreType: MovementScreenScoreType;
  side: MovementScreenSide;
  instructions: string;
  // Which FAULT_CORRECTIVE_KEYWORDS key (shared/fault-correctives.ts) to
  // suggest correctives from when this test comes back flagged.
  faultCode: string;
};

// The initial 10-test battery, covering all four categories. A coach who
// forks this can add, remove, or reword any of these freely -- nothing else
// in the app hardcodes this list, it's only ever read to seed the Forge-
// official battery once.
export const FORGE_STANDARD_SCREEN_TESTS: MovementScreenTestDef[] = [
  {
    testKey: "overhead_squat",
    label: "Overhead Squat",
    category: "postural",
    scoreType: "grade_0_3",
    side: "bilateral",
    instructions: "Feet shoulder-width, arms overhead, descend as far as comfortable. Watch for heel rise, knee valgus, excessive forward lean, or arms falling forward. 3 = clean depth with no compensation, 2 = one compensation, 1 = multiple compensations, 0 = pain.",
    faultCode: "hip_mobility_limited",
  },
  {
    testKey: "inline_lunge",
    label: "In-Line Lunge",
    category: "postural",
    scoreType: "grade_0_3",
    side: "unilateral",
    instructions: "Heel-to-toe stance on a line, back knee lowers to touch the floor. Watch for loss of balance, torso lean, or the front knee drifting off the line.",
    faultCode: "hip_mobility_limited",
  },
  {
    testKey: "single_leg_squat",
    label: "Single-Leg Squat",
    category: "postural",
    scoreType: "grade_0_3",
    side: "unilateral",
    instructions: "Single-leg stance, squat to ~60 degrees of knee flexion. Watch for hip drop, knee valgus, or excessive trunk lean.",
    faultCode: "hip_mobility_limited",
  },
  {
    testKey: "ankle_dorsiflexion",
    label: "Ankle Dorsiflexion (Weight-Bearing Lunge)",
    category: "mobility",
    scoreType: "distance_in",
    side: "unilateral",
    instructions: "Knee-to-wall lunge test -- record the farthest distance (inches) from the wall the big toe can be while the knee still touches the wall, heel flat.",
    faultCode: "ankle_mobility_limited",
  },
  {
    testKey: "shoulder_mobility_reach",
    label: "Shoulder Mobility Reach",
    category: "mobility",
    scoreType: "distance_in",
    side: "unilateral",
    instructions: "One hand reaches over the shoulder, the other up the back -- record the gap (inches) between fingertips. Smaller is better.",
    faultCode: "shoulder_mobility_limited",
  },
  {
    testKey: "trunk_stability_pushup",
    label: "Trunk Stability Push-Up",
    category: "power",
    scoreType: "grade_0_3",
    side: "bilateral",
    instructions: "From a push-up position, the whole body rises as one unit with no lag in the spine. Watch for hips sagging or hiking before the chest clears the floor.",
    faultCode: "core_stability_limited",
  },
  {
    testKey: "rotary_stability",
    label: "Rotary Stability",
    category: "power",
    scoreType: "grade_0_3",
    side: "unilateral",
    instructions: "Quadruped position, opposite hand/knee extend and touch together underneath. Watch for loss of balance or an inability to keep the spine neutral.",
    faultCode: "core_stability_limited",
  },
  {
    testKey: "y_balance_anterior",
    label: "Y-Balance -- Anterior Reach",
    category: "balance",
    scoreType: "distance_in",
    side: "unilateral",
    instructions: "Single-leg stance, reach the free foot as far forward as possible without losing balance or touching down. Record the reach distance in inches.",
    faultCode: "balance_asymmetry",
  },
  {
    testKey: "y_balance_posteromedial",
    label: "Y-Balance -- Posteromedial Reach",
    category: "balance",
    scoreType: "distance_in",
    side: "unilateral",
    instructions: "Same setup as the anterior reach, reaching diagonally back and toward the midline.",
    faultCode: "balance_asymmetry",
  },
  {
    testKey: "y_balance_posterolateral",
    label: "Y-Balance -- Posterolateral Reach",
    category: "balance",
    scoreType: "distance_in",
    side: "unilateral",
    instructions: "Same setup as the anterior reach, reaching diagonally back and away from the midline.",
    faultCode: "balance_asymmetry",
  },
];

export function movementScreenCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    postural: "Postural",
    balance: "Balance",
    power: "Power",
    mobility: "Mobility",
    other: "Other",
  };
  return labels[category] ?? category;
}

export function movementScreenScoreUnit(scoreType: string): string {
  const units: Record<string, string> = {
    grade_0_3: "/ 3",
    distance_in: "in",
    time_sec: "sec",
    asymmetry_pct: "%",
  };
  return units[scoreType] ?? "";
}

export function formatMovementScreenScore(scoreType: string, value: number): string {
  if (scoreType === "grade_0_3") return `${value}/3`;
  return `${value}${movementScreenScoreUnit(scoreType)}`;
}

// A grade of 1 or 0 (out of 3) is the same "clear compensation present"
// threshold the classic 0-3 movement-screen scale is built around -- not
// something to tune per test, it's what the scale itself means.
export const MOVEMENT_SCREEN_LOW_GRADE_THRESHOLD = 1;

// Limb symmetry index red-flag convention used broadly in return-to-play
// literature -- a starting default, not a clinical cutoff for any one
// athlete. Applied when a unilateral test has both a left and right result
// in the same session (see createMovementScreen in storage.ts).
export const MOVEMENT_SCREEN_ASYMMETRY_FLAG_PCT = 10;

export function testKeyFromForgeStandardScreen(testKey: string): MovementScreenTestDef | undefined {
  return FORGE_STANDARD_SCREEN_TESTS.find((t) => t.testKey === testKey);
}
