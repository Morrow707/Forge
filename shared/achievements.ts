export type TrophyTier = "bronze" | "silver" | "gold";
export type TrophyCategory = "workout_count" | "streak" | "pr_count" | "speed";

export type TrophyDefinition = {
  key: string;
  category: TrophyCategory;
  tier: TrophyTier;
  threshold: number;
  label: string;
};

export const WORKOUT_COUNT_TROPHIES: TrophyDefinition[] = [
  { key: "workout_count_1", category: "workout_count", tier: "bronze", threshold: 1, label: "First Workout" },
  { key: "workout_count_10", category: "workout_count", tier: "bronze", threshold: 10, label: "10 Workouts" },
  { key: "workout_count_25", category: "workout_count", tier: "silver", threshold: 25, label: "25 Workouts" },
  { key: "workout_count_50", category: "workout_count", tier: "silver", threshold: 50, label: "50 Workouts" },
  { key: "workout_count_100", category: "workout_count", tier: "gold", threshold: 100, label: "100 Workouts" },
  { key: "workout_count_250", category: "workout_count", tier: "gold", threshold: 250, label: "250 Workouts" },
  { key: "workout_count_500", category: "workout_count", tier: "gold", threshold: 500, label: "500 Workouts" },
];

// Based on longest streak ever reached, not the current one -- a streak
// trophy is a permanent record of having done it, so it shouldn't vanish
// the day a streak breaks.
export const STREAK_TROPHIES: TrophyDefinition[] = [
  { key: "streak_3", category: "streak", tier: "bronze", threshold: 3, label: "3-Day Streak" },
  { key: "streak_5", category: "streak", tier: "bronze", threshold: 5, label: "5-Day Streak" },
  { key: "streak_10", category: "streak", tier: "silver", threshold: 10, label: "10-Day Streak" },
  { key: "streak_20", category: "streak", tier: "silver", threshold: 20, label: "20-Day Streak" },
  { key: "streak_50", category: "streak", tier: "gold", threshold: 50, label: "50-Day Streak" },
  { key: "streak_100", category: "streak", tier: "gold", threshold: 100, label: "100-Day Streak" },
];

export const PR_COUNT_TROPHIES: TrophyDefinition[] = [
  { key: "pr_count_1", category: "pr_count", tier: "bronze", threshold: 1, label: "First PR" },
  { key: "pr_count_10", category: "pr_count", tier: "bronze", threshold: 10, label: "10 PRs" },
  { key: "pr_count_25", category: "pr_count", tier: "silver", threshold: 25, label: "25 PRs" },
  { key: "pr_count_50", category: "pr_count", tier: "silver", threshold: 50, label: "50 PRs" },
  { key: "pr_count_100", category: "pr_count", tier: "gold", threshold: 100, label: "100 PRs" },
];

// Counts sprint-timing captures (skillSessionLogs rows with tracking_level
// "sprint") -- entirely Skills-side, but awarded through the exact same
// checkAndAwardTrophies pass as every other category (see its comment in
// server/storage.ts). Deliberately count-based like workout_count rather
// than time-threshold-based, since a fast time is drill-specific and can't
// be compared across different sprints/distances the way "did a capture"
// can.
export const SPEED_TROPHIES: TrophyDefinition[] = [
  { key: "speed_1", category: "speed", tier: "bronze", threshold: 1, label: "First Sprint Timed" },
  { key: "speed_10", category: "speed", tier: "bronze", threshold: 10, label: "10 Sprints Timed" },
  { key: "speed_25", category: "speed", tier: "silver", threshold: 25, label: "25 Sprints Timed" },
  { key: "speed_50", category: "speed", tier: "silver", threshold: 50, label: "50 Sprints Timed" },
  { key: "speed_100", category: "speed", tier: "gold", threshold: 100, label: "100 Sprints Timed" },
];

export const ALL_TROPHY_DEFINITIONS: TrophyDefinition[] = [
  ...WORKOUT_COUNT_TROPHIES,
  ...STREAK_TROPHIES,
  ...PR_COUNT_TROPHIES,
  ...SPEED_TROPHIES,
];

export const TROPHY_DEFINITIONS_BY_KEY = new Map(
  ALL_TROPHY_DEFINITIONS.map((d) => [d.key, d]),
);

export const TROPHY_TIER_ORDER: Record<TrophyTier, number> = { gold: 0, silver: 1, bronze: 2 };

export const TROPHY_CATEGORY_LABEL: Record<TrophyCategory, string> = {
  workout_count: "Workouts Logged",
  streak: "Consistency Streaks",
  pr_count: "Personal Records",
  speed: "Speed & Agility",
};
