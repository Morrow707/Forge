// Groups every notifyUser() `type` string (server/notify.ts) into a small
// set of categories a coach/athlete can actually reason about in a settings
// UI -- nobody wants to individually toggle "skill_fault" vs "leg_asymmetry"
// vs "form_fault", but "Training Flags" as one switch makes sense. Shared
// between client and server: the server maps a notification's `type` to a
// category to decide whether to push (see categoryForNotificationType), and
// the client renders one row per category, filtered to the viewer's role.
export type NotificationCategoryKey =
  | "comments_video"
  | "training_flags"
  | "team_coach"
  | "classes"
  | "summaries";

export type NotificationCategory = {
  key: NotificationCategoryKey;
  label: string;
  description: string;
  roles: ("coach" | "athlete")[];
  types: string[];
};

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  {
    key: "comments_video",
    label: "Comments & Video",
    description: "A reply, a video upload, or feedback on a set.",
    roles: ["coach", "athlete"],
    types: ["comment", "video"],
  },
  {
    key: "training_flags",
    label: "Training Flags",
    description: "Form faults, leg-drive imbalance, and high training-load alerts.",
    roles: ["coach"],
    types: ["skill_fault", "leg_asymmetry", "form_fault", "acwr_risk"],
  },
  {
    key: "team_coach",
    label: "Team & Coach",
    description: "Team board posts and coach announcements.",
    roles: ["athlete"],
    types: ["announcement", "team_board"],
  },
  {
    key: "classes",
    label: "Classes",
    description: "New lessons, completions, and athletes stuck on a quiz.",
    roles: ["coach", "athlete"],
    types: ["class_lesson_unlocked", "class_progress_reset", "class_completed", "class_quiz_stuck"],
  },
  {
    key: "summaries",
    label: "Summaries",
    description: "Your weekly digest, re-engagement nudges, and wellness check-in reminders.",
    roles: ["coach", "athlete"],
    types: ["digest", "reengagement", "wellness_nudge"],
  },
];

const CATEGORY_BY_TYPE = new Map(
  NOTIFICATION_CATEGORIES.flatMap((c) => c.types.map((t) => [t, c.key] as const)),
);

// Null for a type with no category mapping -- treated as "always push,"
// same as an unmapped type falling outside this taxonomy entirely rather
// than being silently muted by a category it was never assigned to.
export function categoryForNotificationType(type: string): NotificationCategoryKey | null {
  return CATEGORY_BY_TYPE.get(type) ?? null;
}

export function notificationCategoriesForRole(role: "coach" | "athlete"): NotificationCategory[] {
  return NOTIFICATION_CATEGORIES.filter((c) => c.roles.includes(role));
}
