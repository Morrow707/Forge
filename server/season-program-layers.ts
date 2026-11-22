/**
 * THE SERVER HALF OF A PROGRAM'S POSITION AND TEAM LAYERS (2026-11-22). The rules are in
 * shared/season-program-layers.ts; this reads the database for them:
 *   - `layersForAssignment` finds the assignment's season setup and says which layers apply,
 *     with every exercise the layers name fetched in one read;
 *   - `describeLayersForDay` is the coach's view of one assigned day: the labels, the swaps that
 *     apply to the exercises that day really holds, the care drills and warm-up drills added.
 * Nothing here writes. The program is never changed by a layer.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { assignmentSeasonSetups, exercises } from "@shared/schema";
import { warmupItemPrescription } from "@shared/program-day-warmup";
import {
  layerExerciseIds,
  layersForSetup,
  swapsForDay,
  type AppliedLayers,
  type ProgramLayers,
} from "@shared/season-program-layers";

export type LayersForAssignment = AppliedLayers & { exerciseById: Map<number, typeof exercises.$inferSelect> };

const NONE: LayersForAssignment = { position: null, girlsTeam: null, labels: [], exerciseById: new Map() };

/** Which layers apply to one assignment, from its season setup. Empty when there is none. */
export async function layersForAssignment(
  layers: ProgramLayers | null | undefined,
  assignmentId: number,
): Promise<LayersForAssignment> {
  if (!layers) return NONE;
  const [setup] = await db
    .select({ position: assignmentSeasonSetups.position, teamGender: assignmentSeasonSetups.teamGender })
    .from(assignmentSeasonSetups)
    .where(eq(assignmentSeasonSetups.assignmentId, assignmentId));
  const applied = layersForSetup(layers, setup);
  if (applied.labels.length === 0) return NONE;
  const ids = layerExerciseIds(applied);
  const rows = ids.length ? await db.select().from(exercises).where(inArray(exercises.id, ids)) : [];
  return { ...applied, exerciseById: new Map(rows.map((r) => [r.id, r])) };
}

/** The care drills a position adds, each with its exercise, for a day screen. */
export function layerCareFor(applied: LayersForAssignment) {
  const label = applied.labels[0] ?? null;
  return (applied.position?.addCare ?? []).flatMap((c) => {
    const exercise = applied.exerciseById.get(c.exerciseId);
    return exercise ? [{ ...c, exercise, label }] : [];
  });
}

/** The girls'-team warm-up drills, resolved the way a day's own warm-up items are. */
export function layerWarmupItemsFor(applied: LayersForAssignment) {
  return (applied.girlsTeam?.addWarmup ?? []).flatMap((w) => {
    const row = applied.exerciseById.get(w.exerciseId);
    return row
      ? [{ ...w, exercise: { id: row.id, name: row.name, category: row.category, equipment: row.equipment, videoUrl: row.videoUrl } }]
      : [];
  });
}

/** The coach's view of the layers on one assigned day. */
export function describeLayersForDay(applied: LayersForAssignment, dayExerciseIds: readonly number[]) {
  const name = (id: number) => applied.exerciseById.get(id)?.name ?? null;
  const swaps = Array.from(swapsForDay(applied.position, dayExerciseIds).values()).flatMap((s) => {
    const from = name(s.replaceExerciseId);
    const to = name(s.withExerciseId);
    return from && to ? [{ from, to, reason: s.reason }] : [];
  });
  return {
    labels: applied.labels,
    positionNote: applied.position?.note ?? null,
    girlsTeamNote: applied.girlsTeam?.note ?? null,
    swaps,
    addCare: layerCareFor(applied).map((c) => ({
      name: c.exercise.name,
      prescription: [c.sets != null ? `${c.sets} × ${c.reps ?? ""}`.trim() : c.reps, c.load].filter(Boolean).join(", "),
    })),
    addWarmup: layerWarmupItemsFor(applied).map((w) => ({ name: w.exercise.name, prescription: warmupItemPrescription(w) })),
  };
}
