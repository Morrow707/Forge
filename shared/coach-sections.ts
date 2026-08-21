// Mirrors coachSectionEnum in schema.ts -- kept as a separate, tiny module
// (rather than exported alongside the Drizzle table) so both server and
// client can import the labels without pulling in the whole schema file.
export const COACH_SECTIONS = [
  "calendar",
  "programs",
  "exercises",
  "skillPrograms",
  "skillBank",
  "classes",
  "roster",
  "movementScreens",
  "nutrition",
  "analytics",
  "leaderboard",
  "teamBoard",
] as const;

export type CoachSection = (typeof COACH_SECTIONS)[number];

export const COACH_SECTION_LABEL: Record<CoachSection, string> = {
  calendar: "Calendar",
  programs: "Workout Programs",
  exercises: "Exercise Bank",
  skillPrograms: "Skill Programs",
  skillBank: "Skill Bank",
  classes: "Classes",
  roster: "Roster & Teams",
  movementScreens: "Movement Screens",
  nutrition: "Nutrition",
  analytics: "Analytics",
  leaderboard: "Leaderboard",
  teamBoard: "Team Board",
};

// A handful of these (calendar, roster, movementScreens, nutrition,
// analytics, leaderboard, teamBoard) map 1:1 onto AppShell's own top-level
// nav item and get hidden the same way COACH_FEATURE_FIELDS' navHrefs
// already do. The Library sub-areas (programs, exercises, skillPrograms,
// skillBank, classes) share ONE top-level nav item ("Library") with routes
// that stay reachable even when one sub-area is hidden, so there's nothing
// meaningful to put here for them -- LibraryTabs and each page's own gate
// handle those instead.
export const COACH_SECTION_NAV_HREFS: Partial<Record<CoachSection, string[]>> = {
  calendar: ["/coach/calendar"],
  roster: ["/coach/roster"],
  movementScreens: ["/coach/movement-screens"],
  nutrition: ["/coach/nutrition"],
  analytics: ["/coach/analytics"],
  leaderboard: ["/coach/leaderboard"],
  teamBoard: ["/coach/team-board"],
};

// The five that live inside the shared "Library" nav item -- LibraryTabs
// reads this to decide which of its tabs to render for the current coach.
export const LIBRARY_COACH_SECTIONS: CoachSection[] = [
  "programs",
  "exercises",
  "skillPrograms",
  "skillBank",
  "classes",
];
