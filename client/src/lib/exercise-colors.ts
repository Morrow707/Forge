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
export const BODY_REGION_FILTER_ACTIVE_CLASS = "border-sky-500 bg-sky-500/15 text-sky-400";
export const PLANE_FILTER_ACTIVE_CLASS = "border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-400";
export const MOVEMENT_COMPLEXITY_FILTER_ACTIVE_CLASS = "border-orange-500 bg-orange-500/15 text-orange-400";

// Skills is a wholly separate system from Exercises (see shared/schema.ts's
// skillExercises comment) and gets its own single hue -- teal -- not reused
// by anything above, so a coach can tell "this is skills" at a glance
// anywhere the two systems' UI might otherwise sit near each other.
export const SKILL_BADGE_CLASS = "bg-teal-500/15 text-teal-400";
export const SKILL_FILTER_ACTIVE_CLASS = "border-teal-500 bg-teal-500/15 text-teal-400";

// One color per exercise-family accordion button (see shared/exercise-
// family.ts) -- unlike the flat single-hue dimensions above, each family
// gets its own color so the row of 9 buttons in the picker doesn't read as
// one indistinct block, and Combination specifically gets a color that
// pops (fuchsia) since it's the one family that didn't exist as a
// filterable concept at all before this accordion. Mobility & Activation
// intentionally reuses the "mobility" category's cyan -- the two concepts
// already overlap in a coach's head, so matching color reinforces that
// instead of fighting it.
export const FAMILY_FILTER_ACTIVE_CLASS: Record<string, string> = {
  "Upper Push": "border-blue-500 bg-blue-500/15 text-blue-400",
  "Upper Pull": "border-indigo-500 bg-indigo-500/15 text-indigo-400",
  "Lower Push": "border-lime-500 bg-lime-500/15 text-lime-400",
  "Lower Pull": "border-green-500 bg-green-500/15 text-green-400",
  Legs: "border-amber-500 bg-amber-500/15 text-amber-400",
  Core: "border-pink-500 bg-pink-500/15 text-pink-400",
  Combination: "border-fuchsia-500 bg-fuchsia-500/15 text-fuchsia-400",
  "Mobility & Activation": "border-cyan-500 bg-cyan-500/15 text-cyan-400",
  Conditioning: "border-red-500 bg-red-500/15 text-red-400",
};

// The equipment sub-filter grid's own single hue -- previously reused cyan,
// which collides with both the "mobility" category badge and the
// Correctives-only toggle it can appear alongside in the same "More
// filters" disclosure. Yellow isn't claimed by anything else above.
export const EQUIPMENT_FILTER_ACTIVE_CLASS = "border-yellow-500 bg-yellow-500/15 text-yellow-400";
