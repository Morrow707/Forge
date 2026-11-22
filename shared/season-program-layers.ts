/**
 * POSITION AND TEAM LAYERS ON A FORGE SEASON PROGRAM (2026-11-22).
 *
 * A season program (server/seed-season-programs.ts) is written once per sport and phase. What
 * differs by position (a pitcher presses with a landmine, a lineman drives a sled) and for a
 * girls' team (more landing and cutting in the warm-up) is a LAYER on top of it, stored on
 * `programs.layers`, never a second copy of the program.
 *
 * A layer is applied for ONE athlete when their workout day is read, from their assignment's
 * season setup (`assignment_season_setups.position` and `.team_gender`). The program rows are
 * never changed. A swap only ever replaces an exercise the day actually holds; a care drill or a
 * warm-up drill is appended. The coach's view of the assigned day reads the same answer.
 *
 * Pure: no database, so the rules are covered by `npm test`.
 */
import { normalizePosition } from "./exercise-tags";
import type { WarmupItem } from "./program-day-warmup";

/** One exercise the position does instead of another. */
export type LayerSwap = {
  replaceExerciseId: number;
  withExerciseId: number;
  reason: string | null;
};

/** One care drill a position adds at the end of the session. */
export type LayerCareItem = {
  exerciseId: number;
  sets: number | null;
  reps: string | null;
  load: string | null;
  restSeconds: number | null;
};

export type PositionLayer = {
  /** The position as the program wrote it ("pitcher", "100/200 m"), for the label. */
  label: string;
  swaps: LayerSwap[];
  addCare: LayerCareItem[];
  note: string | null;
};

export type GirlsTeamLayer = {
  addWarmup: WarmupItem[];
  note: string | null;
};

export type ProgramLayers = {
  /** Keyed by the normalized position (normalizePosition). */
  positions: Record<string, PositionLayer>;
  girlsTeam: GirlsTeamLayer | null;
};

/** The team gender (TEAM_GENDERS in shared/season-plan.ts) that turns the girls' layer on. */
export const GIRLS_TEAM = "girls";

/** The labels a screen shows for an applied layer. */
export const GIRLS_TEAM_LABEL = "Girls' team";
export const positionLabel = (label: string) => `Position: ${label}`;

/** The setup a layer is chosen from: the assignment's season setup row, or nothing. */
export type LayerSetup = { position: string | null; teamGender: string | null } | null | undefined;

export type AppliedLayers = {
  position: PositionLayer | null;
  girlsTeam: GirlsTeamLayer | null;
  labels: string[];
};

/** Which layers apply to one assignment. Nothing applies without a setup. */
export function layersForSetup(layers: ProgramLayers | null | undefined, setup: LayerSetup): AppliedLayers {
  if (!layers || !setup) return { position: null, girlsTeam: null, labels: [] };
  const key = setup.position ? normalizePosition(setup.position) : "";
  const position = key ? layers.positions?.[key] ?? null : null;
  const girlsTeam = setup.teamGender === GIRLS_TEAM ? layers.girlsTeam ?? null : null;
  const labels = [
    ...(position ? [positionLabel(position.label)] : []),
    ...(girlsTeam ? [GIRLS_TEAM_LABEL] : []),
  ];
  return { position, girlsTeam, labels };
}

/**
 * The swaps that apply to this day: replaced exercise id -> the swap, only for exercises the day
 * holds. A swap naming an exercise the day does not contain is never applied.
 */
export function swapsForDay(position: PositionLayer | null, dayExerciseIds: readonly number[]): Map<number, LayerSwap> {
  const onDay = new Set(dayExerciseIds);
  return new Map(
    (position?.swaps ?? [])
      .filter((s) => onDay.has(s.replaceExerciseId) && s.replaceExerciseId !== s.withExerciseId)
      .map((s) => [s.replaceExerciseId, s]),
  );
}

/** Every exercise id a layer set names, so a read fetches them in one query. */
export function layerExerciseIds(applied: AppliedLayers): number[] {
  const ids = [
    ...(applied.position?.swaps ?? []).flatMap((s) => [s.replaceExerciseId, s.withExerciseId]),
    ...(applied.position?.addCare ?? []).map((c) => c.exerciseId),
    ...(applied.girlsTeam?.addWarmup ?? []).map((w) => w.exerciseId),
  ];
  return [...new Set(ids)];
}
