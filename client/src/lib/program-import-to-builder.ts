/**
 * From the reviewed import draft to the builder's own day and exercise rows.
 *
 * The review dialog keeps one DECISION per row: the library exercise it goes on (filled in for a
 * matched row, chosen by the coach for a flagged one) or an explicit "leave this row out". This
 * module is the only place a draft becomes builder rows, and it refuses -- returns the rows still
 * waiting -- while any row has no decision, so nothing can reach the builder on a guess and no
 * row can vanish without the coach having said so.
 *
 * The rows it makes carry every field the builder's Save Program sends (the program exercise
 * input schema), so a saved import is a normal saved program: tracking starts off, superset
 * tokens become the builder's linked-to-next chain, and a rest gap or a missing set count gets
 * the builder's own defaults.
 */
import type { ImportDraft, LibraryExercise } from "@shared/program-import";
import type { ResolvedWarmupBlock } from "@shared/program-day-warmup";
import { deriveLinkedToNext } from "@/lib/supersets";

export type RowDecision = { kind: "exercise"; exercise: LibraryExercise } | { kind: "skip" };

export const rowKey = (dayIndex: number, rowIndex: number) => `${dayIndex}:${rowIndex}`;

/** Matched rows start decided (on the exercise they matched); flagged rows start undecided. */
export function initialDecisions(draft: ImportDraft): Map<string, RowDecision> {
  const out = new Map<string, RowDecision>();
  draft.days.forEach((day, di) =>
    day.exercises.forEach((row, ri) => {
      if (row.match.status === "matched") out.set(rowKey(di, ri), { kind: "exercise", exercise: row.match.exercise });
    }),
  );
  return out;
}

export function undecidedRows(draft: ImportDraft, decisions: Map<string, RowDecision>): string[] {
  const out: string[] = [];
  draft.days.forEach((day, di) =>
    day.exercises.forEach((_row, ri) => {
      if (!decisions.has(rowKey(di, ri))) out.push(rowKey(di, ri));
    }),
  );
  return out;
}

/** The builder's own row shapes (structurally the same as LocalDay / LocalExercise). */
export type BuilderExercise = {
  key: string;
  exerciseId: number;
  exerciseName: string;
  sets: number;
  reps: string;
  weight: string;
  restSeconds: string;
  notes: string;
  linkedToNext: boolean;
  restAfterGroupOnly: boolean;
  trackingLevel: "none";
  videoCheckEnabled: boolean;
  category: string | null;
  videoEligible: boolean | null;
};

export type BuilderDay = {
  key: string;
  title: string;
  isRestDay: boolean;
  exercises: BuilderExercise[];
  /** The warm-up Forge drafted for an imported day, if any (2026-11-22). */
  warmup?: ResolvedWarmupBlock | null;
};

const DEFAULT_SETS = 3;
const DEFAULT_REPS = "10";

export function draftToBuilderDays(
  draft: ImportDraft,
  decisions: Map<string, RowDecision>,
  makeKey: () => string = () => crypto.randomUUID(),
): { ok: true; days: BuilderDay[] } | { ok: false; undecided: string[] } {
  const undecided = undecidedRows(draft, decisions);
  if (undecided.length > 0) return { ok: false, undecided };

  const days = draft.days.map((day, di) => {
    const kept = day.exercises.flatMap((row, ri) => {
      const decision = decisions.get(rowKey(di, ri))!;
      if (decision.kind === "skip") return [];
      // A row the coach put on a DIFFERENT exercise than the one written keeps what was written,
      // so the athlete still sees the coach's own words.
      const renamed = decision.exercise.name.toLowerCase() !== row.nameAsWritten.toLowerCase()
        && row.match.status === "flagged";
      const notes = [renamed ? `Written as "${row.nameAsWritten}"` : null, row.notes].filter(Boolean).join(". ");
      return [{
        key: makeKey(),
        exerciseId: decision.exercise.id,
        exerciseName: decision.exercise.name,
        sets: row.sets ?? DEFAULT_SETS,
        reps: row.reps ?? DEFAULT_REPS,
        weight: row.weight ?? "",
        restSeconds: row.restSeconds != null ? String(row.restSeconds) : "",
        notes,
        supersetGroup: row.supersetGroup,
        restAfterGroupOnly: false,
        trackingLevel: "none" as const,
        videoCheckEnabled: false,
        category: decision.exercise.category ?? null,
        videoEligible: decision.exercise.videoEligible ?? null,
      }];
    });
    const exercises: BuilderExercise[] = deriveLinkedToNext(kept).map(({ supersetGroup: _token, ...ex }) => ex);
    return {
      key: makeKey(),
      title: day.title,
      isRestDay: day.isRestDay && exercises.length === 0,
      exercises,
      warmup: day.warmup ?? null,
    };
  });
  return { ok: true, days };
}
