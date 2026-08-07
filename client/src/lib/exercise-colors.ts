// Shared color scheme for an exercise's category/movement/laterality/muscle/
// sport/owner -- used both for the static badge shown on an exercise card or
// detail page and for that same value's filter-chip active state, so a coach
// scanning a wall of filter buttons can match "this orange chip" to "this
// orange badge" instead of the two using unrelated colors. "Correctives
// only" already established cyan as its color before this scheme existed,
// so nothing else below reuses cyan.
export const CATEGORY_BADGE_CLASS: Record<string, string> = {
  strength: "bg-primary/15 text-primary",
  conditioning: "bg-success/15 text-success",
  olympic: "bg-blue-500/15 text-blue-400",
  accessory: "bg-purple-500/15 text-purple-400",
  mobility: "bg-cyan-500/15 text-cyan-400",
  plyometric: "bg-amber-500/15 text-amber-400",
};

export const CATEGORY_FILTER_ACTIVE_CLASS: Record<string, string> = {
  strength: "border-primary bg-primary/15 text-primary",
  conditioning: "border-success bg-success/15 text-success",
  olympic: "border-blue-500 bg-blue-500/15 text-blue-400",
  accessory: "border-purple-500 bg-purple-500/15 text-purple-400",
  mobility: "border-cyan-500 bg-cyan-500/15 text-cyan-400",
  plyometric: "border-amber-500 bg-amber-500/15 text-amber-400",
};

// Every value within one of these dimensions shares a single color -- unlike
// category (one color per value), there's no pre-existing per-value color
// convention for movement/laterality/muscle/sport/owner to match, so each
// dimension just gets its own distinct color instead.
export const MOVEMENT_FILTER_ACTIVE_CLASS = "border-indigo-500 bg-indigo-500/15 text-indigo-400";
export const LATERALITY_FILTER_ACTIVE_CLASS = "border-violet-500 bg-violet-500/15 text-violet-400";
export const MUSCLE_FILTER_ACTIVE_CLASS = "border-emerald-500 bg-emerald-500/15 text-emerald-400";
export const SPORT_FILTER_ACTIVE_CLASS = "border-rose-500 bg-rose-500/15 text-rose-400";
export const OWNER_FILTER_ACTIVE_CLASS = "border-slate-400 bg-slate-400/15 text-slate-300";

// Skills is a wholly separate system from Exercises (see shared/schema.ts's
// skillExercises comment) and gets its own single hue -- teal -- not reused
// by anything above, so a coach can tell "this is skills" at a glance
// anywhere the two systems' UI might otherwise sit near each other.
export const SKILL_BADGE_CLASS = "bg-teal-500/15 text-teal-400";
export const SKILL_FILTER_ACTIVE_CLASS = "border-teal-500 bg-teal-500/15 text-teal-400";
