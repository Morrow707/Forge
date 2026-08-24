// Coach-adjustable nav visibility -- a baseball coach with no use for
// Nutrition tracking or the team Leaderboard can turn those tabs off so
// the app reads smaller for their own staff and their athletes, instead of
// everyone wading through sections they'll never touch. Deliberately
// scoped to top-level nav items only (not sub-features within a page) --
// see COACH_FEATURE_FIELDS below for exactly what each toggle hides.
// Missing/unset (see the users.enabledFeatures column) means "on," per
// feature independently, same "null means default" shape as
// skillFaultThresholds -- an existing coach who's never touched this page
// sees no change.
export const COACH_FEATURES = ["nutrition", "analytics", "leaderboard", "teamBoard", "movementScreen"] as const;
export type CoachFeature = (typeof COACH_FEATURES)[number];

export const DEFAULT_COACH_FEATURES: Record<CoachFeature, boolean> = {
  nutrition: true,
  analytics: true,
  leaderboard: true,
  teamBoard: true,
  movementScreen: true,
};

export function resolveCoachFeatures(
  overrides?: Partial<Record<CoachFeature, boolean>> | null,
): Record<CoachFeature, boolean> {
  return { ...DEFAULT_COACH_FEATURES, ...(overrides ?? {}) };
}

// Drives the settings form (one array walked with .map()) and AppShell's nav
// filter -- navHrefs is every route hidden when a feature is off, on both
// the coach and athlete side, so turning "Nutrition" off removes it from
// both without two separate lists to keep in sync.
export const COACH_FEATURE_FIELDS: {
  key: CoachFeature;
  label: string;
  description: string;
  navHrefs: string[];
}[] = [
  {
    key: "nutrition",
    label: "Nutrition",
    description: "Food logging, meal plans, and the Nutrition tab for you and your athletes.",
    navHrefs: ["/coach/nutrition", "/athlete/nutrition"],
  },
  {
    key: "analytics",
    label: "Analytics",
    description: "Team-wide load/trend analytics.",
    navHrefs: ["/coach/analytics"],
  },
  {
    key: "leaderboard",
    label: "Leaderboard",
    description: "The roster-wide strength leaderboard.",
    navHrefs: ["/coach/leaderboard"],
  },
  {
    key: "teamBoard",
    label: "Team Board",
    description: "The team announcement/chat board.",
    navHrefs: ["/coach/team-board", "/athlete/team-board"],
  },
  {
    key: "movementScreen",
    label: "Movement Screen",
    description: "Functional-movement screening batteries, and the Movement Screen tab on each athlete's profile.",
    navHrefs: ["/coach/movement-screens"],
  },
];
