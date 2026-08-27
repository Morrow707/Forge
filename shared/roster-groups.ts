import { z } from "zod";

// A coach-named subdivision of their own roster -- position groups,
// training pods, grade levels, whatever fits the program. Deliberately
// free-text and coach-defined: nothing sport-specific (no "The Trenches",
// no "Skill") is ever hardcoded here, the coach types whatever they want.
// This is NOT the same concept as either of the two things it might look
// like at a glance:
//   - users.position (shared/schema.ts) is a finer-grained, per-athlete
//     free-text field ("Quarterback") completely independent of this.
//   - The teams table (shared/schema.ts) is a much heavier concept with its
//     own join code and branding override -- athletes join a team with a
//     code. A roster group has none of that; it's just a label an existing
//     roster athlete is filed under, for filtering the same roster.
//
// `id` is a short, stable, client-generated token (never shown to the
// coach) that coachAthletes.groupId points at -- see that column's own
// comment for why the reference is soft (not a DB foreign key). Keeping
// `id` stable across a rename means renaming a group's `label` never
// requires touching any athlete's groupId.
export type RosterGroup = { id: string; label: string };

// Ships as the default roster grouping until a coach customizes it -- see
// users.rosterGroups' own comment in shared/schema.ts for the "null means
// default, only write on actual customization" convention this follows
// (same as personalAccentColor/hiddenNavSections elsewhere). Exactly three,
// neutrally labeled -- a coach renames/adds/removes from here via the
// Roster page's "Manage groups" dialog.
export const DEFAULT_ROSTER_GROUPS: RosterGroup[] = [
  { id: "a", label: "Group A" },
  { id: "b", label: "Group B" },
  { id: "c", label: "Group C" },
];

// The one place both client and server turn a stored users.rosterGroups
// value (null/unset for "never customized", or an empty array -- e.g. a
// coach removed every group) into what should actually render/filter/
// assign against, instead of ever writing the default into the row.
export function resolveRosterGroups(groups: RosterGroup[] | null | undefined): RosterGroup[] {
  return groups && groups.length > 0 ? groups : DEFAULT_ROSTER_GROUPS;
}

export const rosterGroupSchema = z.object({
  id: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(40),
});

// Whole-array replace -- rename an entry, add one, remove one -- same "one
// PATCH takes the whole list" shape as updateNavPrefsSchema's
// navLabelOverrides, since the Manage Groups dialog edits the whole list on
// one surface. Capped well above what any coach would realistically want,
// just to keep the filter-chip row and the per-athlete group <select> from
// growing unbounded. Ids must be unique within the list -- coachAthletes.
// groupId only means anything if it resolves to exactly one group.
export const updateRosterGroupsSchema = z.object({
  rosterGroups: z.array(rosterGroupSchema).max(20),
}).refine(
  (data) => new Set(data.rosterGroups.map((g) => g.id)).size === data.rosterGroups.length,
  { message: "Group ids must be unique" },
);

// A soft reference to one of the coach's own (resolved) rosterGroups[].id --
// null unassigns the athlete back to "Unassigned" rather than requiring
// every athlete to belong to a group.
export const setAthleteGroupSchema = z.object({
  groupId: z.string().trim().min(1).max(40).nullable(),
});
