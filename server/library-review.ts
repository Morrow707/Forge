/* APPLYING THE 2026-11-22 LIBRARY REVIEW TO A DATABASE THAT ALREADY EXISTS.
 *
 * The seed creates a library row by NAME once and never re-syncs it, so a decision about rows
 * production already holds reaches production only through a step like this one -- the lesson
 * CORRECTED_EXERCISE_INSTRUCTIONS and the Coaches Corner lesson re-sync record. Every function here:
 *   - touches only rows the library owner owns, matched by EXACT name, so a coach's own exercise
 *     called "Pec Deck" is never hidden or renamed;
 *   - only ever SETS (hides, fills an empty tag, renames, rewrites a known-wrong text) and never
 *     undoes: a row with `restored_at` (an admin brought it back) is never hidden again, a filled
 *     tag is never overwritten, an edited instruction matches no `from` and is left alone;
 *   - reports what it CHANGED, never what it matched, so a deploy after the first logs nothing.
 *
 * Nothing is deleted. A hidden row keeps every program row, assignment and logged set pointing at
 * it; see shared/library-review-2026-11-22.ts.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { exercises, skillExercises } from "@shared/schema";
import { HIDDEN_EXERCISES, HIDDEN_SKILL_DRILLS, type HiddenLibraryRow } from "@shared/library-review-2026-11-22";
import { db } from "./db";
import {
  CONE_WEAVE_RENAMES,
  CORRECTED_SKILL_INSTRUCTIONS,
  EXISTING_EXERCISE_TAGS,
} from "./seed-data/library-review-2026-11-22";

export type LibraryReviewChanges = {
  exercisesHidden: number;
  drillsHidden: number;
  exercisesTagged: number;
  drillsRenamed: number;
  drillInstructionsCorrected: number;
};

const total = (counts: number[]) => counts.reduce((a, b) => a + b, 0);

/** Group hidden rows by their merge target so one UPDATE per target covers them. */
function byTarget(rows: readonly HiddenLibraryRow[]): [string | null, string[]][] {
  const grouped = rows.reduce((acc, r) => {
    acc.set(r.mergeInto, [...(acc.get(r.mergeInto) ?? []), r.name]);
    return acc;
  }, new Map<string | null, string[]>());
  return Array.from(grouped.entries());
}

/** Hide the review's merged and retired exercises on the library owner's rows. */
export async function hideReviewedExercises(ownerId: number, now = new Date()): Promise<number> {
  const counts = await Promise.all(
    byTarget(HIDDEN_EXERCISES).map(async ([mergeInto, names]) => {
      const rows = await db
        .update(exercises)
        .set({ retiredAt: now, mergedIntoName: mergeInto })
        .where(
          and(
            eq(exercises.coachId, ownerId),
            inArray(exercises.name, names),
            isNull(exercises.retiredAt),
            isNull(exercises.restoredAt),
          ),
        )
        .returning({ id: exercises.id });
      return rows.length;
    }),
  );
  return total(counts);
}

/** Hide the review's merged and retired skill drills on the library owner's rows. */
export async function hideReviewedSkillDrills(ownerId: number, now = new Date()): Promise<number> {
  const counts = await Promise.all(
    byTarget(HIDDEN_SKILL_DRILLS).map(async ([mergeInto, names]) => {
      const rows = await db
        .update(skillExercises)
        .set({ retiredAt: now, mergedIntoName: mergeInto })
        .where(
          and(
            eq(skillExercises.coachId, ownerId),
            inArray(skillExercises.name, names),
            isNull(skillExercises.retiredAt),
            isNull(skillExercises.restoredAt),
          ),
        )
        .returning({ id: skillExercises.id });
      return rows.length;
    }),
  );
  return total(counts);
}

/** The fields a review tag would fill on this row: only those still empty. */
function tagPatchFor(row: typeof exercises.$inferSelect): Partial<typeof exercises.$inferInsert> {
  const tags = EXISTING_EXERCISE_TAGS[row.name];
  if (!tags) return {};
  const emptyList = (v: string[] | null) => v == null || v.length === 0;
  return {
    ...(tags.joints?.length && emptyList(row.joints) ? { joints: tags.joints } : {}),
    ...(tags.purposes?.length && emptyList(row.purposes) ? { purposes: tags.purposes } : {}),
    ...(tags.cautionNote && !row.cautionNote ? { cautionNote: tags.cautionNote } : {}),
  };
}

/** Fill the review's tags into existing exercises, field by field, only where the field is empty. */
export async function tagReviewedExercises(ownerId: number): Promise<number> {
  const rows = await db.query.exercises.findMany({
    where: and(eq(exercises.coachId, ownerId), inArray(exercises.name, Object.keys(EXISTING_EXERCISE_TAGS))),
  });
  const patches = rows
    .map((row) => ({ id: row.id, patch: tagPatchFor(row) }))
    .filter((p) => Object.keys(p.patch).length > 0);
  await Promise.all(patches.map((p) => db.update(exercises).set(p.patch).where(eq(exercises.id, p.id))));
  return patches.length;
}

/**
 * Give the two "Cone Weave Dribbling" rows their sport in the name. MUST run before the seed's skill
 * insert loop: that loop creates by name, so a database still holding the old name would otherwise
 * be handed two new rows beside the two it has.
 */
export async function renameDuplicateSkillDrills(ownerId: number): Promise<number> {
  const counts = await Promise.all(
    CONE_WEAVE_RENAMES.map(async (r) => {
      const taken = await db.query.skillExercises.findFirst({
        where: and(eq(skillExercises.coachId, ownerId), eq(skillExercises.name, r.to)),
      });
      if (taken) return 0;
      const candidates = await db.query.skillExercises.findMany({
        where: and(eq(skillExercises.coachId, ownerId), eq(skillExercises.name, r.from)),
      });
      const row = candidates.find((c) => (c.sports ?? []).includes(r.sport));
      if (!row) return 0;
      await db.update(skillExercises).set({ name: r.to }).where(eq(skillExercises.id, row.id));
      return 1;
    }),
  );
  return total(counts);
}

/** Rewrite skill-drill instructions that still read exactly the text the review found wrong. */
export async function correctReviewedSkillInstructions(ownerId: number): Promise<number> {
  const counts = await Promise.all(
    CORRECTED_SKILL_INSTRUCTIONS.map(async (p) => {
      const rows = await db.query.skillExercises.findMany({
        where: and(eq(skillExercises.coachId, ownerId), eq(skillExercises.name, p.name)),
      });
      const stale = rows.filter((row) => (row.instructions ?? "").trim() === p.from.trim());
      await Promise.all(
        stale.map((row) => db.update(skillExercises).set({ instructions: p.to }).where(eq(skillExercises.id, row.id))),
      );
      return stale.length;
    }),
  );
  return total(counts);
}

/** One log line, and only for what changed. */
export function describeLibraryReviewChanges(c: LibraryReviewChanges): string | null {
  const parts = [
    c.exercisesHidden && `${c.exercisesHidden} exercise(s) hidden`,
    c.drillsHidden && `${c.drillsHidden} skill drill(s) hidden`,
    c.exercisesTagged && `${c.exercisesTagged} exercise(s) tagged`,
    c.drillsRenamed && `${c.drillsRenamed} skill drill(s) renamed`,
    c.drillInstructionsCorrected && `${c.drillInstructionsCorrected} skill drill instruction(s) corrected`,
  ].filter(Boolean);
  return parts.length ? `[seed] library review 2026-11-22: ${parts.join(", ")}` : null;
}
