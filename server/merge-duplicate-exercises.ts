/* COLLAPSING TWO LIBRARY ROWS THAT ARE ONE MOVEMENT.
 *
 * Added 2026-10-07, after a scan of the whole library found four pairs that are the same exercise
 * written twice. Scott named the survivors: "Call it overload/underload, call it ankle cars, call
 * it pin squat" -- and, on the pair that is genuinely two lifts, "Cossack and lateral lunges are
 * different, keep them different."
 *
 * WHY THIS IS NOT A DELETE. Nearly every foreign key onto `exercises` and `skill_exercises` is
 * `onDelete: cascade` -- program rows, workout log entries, session logs, class drill trees. So
 * `DELETE FROM exercises WHERE name = 'Anderson Squat'` does not remove a duplicate, it removes
 * every set anybody ever logged against it. The only safe shape is REPOINT, then delete a row
 * that nothing references any more.
 *
 * WHY THE FOREIGN KEYS ARE DISCOVERED RATHER THAN LISTED. There are sixteen of them onto
 * `exercises` today and six onto `skill_exercises`, and the cost of forgetting one is not a
 * failed merge -- it is a cascade that silently deletes an athlete's history, found weeks later.
 * A hand-written list is a thing somebody falls off the day they add a table. The catalog always
 * knows, so the catalog is asked.
 *
 * IT IS ONE TRANSACTION AND IT IS IDEMPOTENT. A unique constraint on a child table (the same
 * exercise twice in one program day) can refuse an UPDATE; if anything refuses, the whole merge
 * rolls back and nothing is deleted, which is the correct failure -- the duplicate survives
 * another deploy and no history is lost. A merge whose `from` row is already gone is a no-op, so
 * it costs one query on every deploy after the first.
 *
 * IT NEVER DELETES WITHOUT A SURVIVOR. If the target name is missing -- a rename upstream, a
 * half-applied seed -- the merge stands down and says so rather than deleting the only remaining
 * copy of the movement.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";

export type MergeOutcome =
  | "merged"
  | "already_merged"
  | "no_survivor"
  | "same_row"
  | "refused";

type MergeableTable = "exercises" | "skill_exercises";

/** Every (table, column) in this database that points at `table`.id, from the catalog. */
async function referencingColumns(table: MergeableTable): Promise<{ table: string; column: string }[]> {
  const rows = await db.execute(sql`
    SELECT tc.table_name AS child_table, kcu.column_name AS child_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = ${table}
      AND ccu.column_name = 'id'
  `);
  const out = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]);
  return (out as { child_table: string; child_column: string }[]).map((r) => ({
    table: r.child_table,
    column: r.child_column,
  }));
}

async function idForName(table: MergeableTable, name: string): Promise<number | null> {
  const rows = await db.execute(
    sql`SELECT id FROM ${sql.identifier(table)} WHERE name = ${name} ORDER BY id LIMIT 1`,
  );
  const out = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]);
  const first = (out as { id: number }[])[0];
  return first ? Number(first.id) : null;
}

/** Repoint everything that references `fromName` at `intoName`, then delete `fromName`.
 *
 * Returns what happened rather than throwing, because a seed that cannot merge a duplicate must
 * still finish: the duplicate is a tidiness problem and a failed deploy is an outage. */
export async function mergeDuplicateExercise(
  table: MergeableTable,
  fromName: string,
  intoName: string,
): Promise<MergeOutcome> {
  const fromId = await idForName(table, fromName);
  if (fromId == null) return "already_merged";
  const intoId = await idForName(table, intoName);
  if (intoId == null) {
    console.warn(
      `[merge] ${table}: "${fromName}" has no survivor named "${intoName}" -- left alone rather than deleted.`,
    );
    return "no_survivor";
  }
  if (fromId === intoId) return "same_row";

  const children = await referencingColumns(table);
  try {
    await db.transaction(async (tx) => {
      for (const child of children) {
        await tx.execute(
          sql`UPDATE ${sql.identifier(child.table)}
              SET ${sql.identifier(child.column)} = ${intoId}
              WHERE ${sql.identifier(child.column)} = ${fromId}`,
        );
      }
      await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE id = ${fromId}`);
    });
  } catch (err) {
    // Rolled back whole. The duplicate is still there and so is everything pointing at it.
    console.warn(
      `[merge] ${table}: "${fromName}" -> "${intoName}" refused (${(err as Error).message}); nothing changed.`,
    );
    return "refused";
  }
  console.log(
    `[merge] ${table}: "${fromName}" merged into "${intoName}" across ${children.length} referencing column(s).`,
  );
  return "merged";
}

/** The pairs Scott named on 2026-10-07, survivor second.
 *
 * Cossack Squat and Lateral Lunge are NOT here and must not be added: he read both and said they
 * are different lifts. Diamond Push-Up and Close-Grip Push-Up are also not here -- the same
 * movement by their own instructions, but neither is filmable, so collapsing them buys nothing
 * and costs somebody's logged sets a migration. */
export const DUPLICATE_EXERCISE_MERGES: {
  table: MergeableTable;
  from: string;
  into: string;
  why: string;
}[] = [
  {
    table: "exercises",
    from: "Anderson Squat",
    into: "Pin Squat",
    why: "Scott: \"call it pin squat\". The seed described them as different (an eccentric down to the pins against a dead start with none); he overruled that on his own library and his call governs how his coaches name a lift.",
  },
  {
    table: "exercises",
    from: "Ankle Circles",
    into: "Ankle CARs",
    why: "Scott: \"call it ankle cars\". Controlled articular rotations ARE the circles; both rows said so in different words.",
  },
  {
    table: "skill_exercises",
    from: "Bat Speed Overload/Underload Rounds",
    into: "Overload/Underload Bat Drill",
    why: "Scott: \"Call it overload/underload\". BOTH were filmable (skillType Hitting is in MECHANICS_ELIGIBLE_SKILL_TYPES), so one drill held two of the 270 camera-tunable records -- calibrate one and the other silently keeps the old numbers, and an athlete's history splits across two identities for one movement.",
  },
];

/** Run every named merge. Idempotent; safe to call on every deploy. */
export async function mergeNamedDuplicateExercises(): Promise<void> {
  for (const m of DUPLICATE_EXERCISE_MERGES) {
    await mergeDuplicateExercise(m.table, m.from, m.into);
  }
}
