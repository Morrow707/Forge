/**
 * THE VOCABULARY IS DERIVED FROM THE LIBRARY, NOT WRITTEN DOWN.
 *
 * Which words are heads, which are equipment, which are modifiers -- all of it is already stated
 * by the ~800 exercise names and their metadata. Hand-typing the lists would mean maintaining a
 * second copy of the library that drifts from the first, and CLAUDE.md already has the rule for
 * this: a scan derives its list from the source rather than restating it. The one scan in this
 * repo that was written as a hand-list missed six of fourteen cases on its first rerun as a scan.
 *
 * So: heads, equipment and modifiers come from the library. Only the SYNONYMS are hand-typed,
 * because "kb" meaning kettlebell is a fact about YouTube titles, not about Forge's library.
 */
import { normalize, BASE_COMPOUNDS, FILLER } from "./exercise-name-grammar";

export type LibraryExercise = {
  id: number;
  name: string;
  /** Non-null in this schema, defaulting to "Barbell" -- see EQUIPMENT_IS_DEFAULTED. */
  equipment: string | null;
  muscleGroups: string[];
  movementPattern?: string | null;
  kind: "exercise" | "skill";
};

/** Title words meaning the same equipment. Hand-typed because it describes YouTube, not Forge. */
export const EQUIPMENT_SYNONYMS: Record<string, string> = {
  bar: "barbell",
  barbell: "barbell",
  dumbbell: "dumbbell",
  kettlebell: "kettlebell",
  cable: "cable",
  pulley: "cable",
  machine: "machine",
  smith: "smith",
  landmine: "landmine",
  band: "band",
  banded: "band",
  resistance: "band",
  trapbar: "trapbar",
  hexbar: "trapbar",
  bodyweight: "bodyweight",
  sled: "sled",
  rope: "rope",
  sandbag: "sandbag",
  plate: "plate",
  bench: "bench",
  ball: "ball",
  box: "box",
};

/** Muscle words a title may use, mapped to what the library calls them. */
export const MUSCLE_SYNONYMS: Record<string, string> = {
  triceps: "triceps",
  biceps: "biceps",
  chest: "chest",
  back: "back",
  shoulders: "shoulders",
  glutes: "glutes",
  hamstrings: "hamstrings",
  quads: "quads",
  calves: "calves",
  abs: "abs",
  core: "abs",
  forearms: "forearms",
  traps: "traps",
  trap: "traps",
  hips: "hips",
  hip: "hips",
  adductors: "adductors",
  abductors: "abductors",
  obliques: "obliques",
  legs: "legs",
  arms: "arms",
};

export type Vocabulary = {
  heads: Set<string>;
  equipment: Record<string, string>;
  muscles: Record<string, string>;
  modifiers: Set<string>;
  compounds: string[];
  knownTokens: Set<string>;
  /** head -> the equipment it means when a title leaves equipment unsaid. */
  defaultEquipment: Record<string, { equipment: string; share: number; n: number }>;
};

/** Name-final in at least this share of the names it appears in. */
export const HEAD_SHARE = 0.8;
/** One equipment value must cover this much of a head's names to be its default. */
export const DEFAULT_EQUIPMENT_SHARE = 0.7;
export const DEFAULT_EQUIPMENT_MIN_NAMES = 3;

/** Hyphenated pairs the library really uses, so "single leg" folds exactly as "single-leg" does. */
export function compoundsFromLibrary(names: string[]): string[] {
  const found = new Set(BASE_COMPOUNDS);
  for (const name of names) {
    for (const match of name.toLowerCase().matchAll(/([a-z]+)-([a-z]+)/g)) {
      found.add(`${match[1]}-${match[2]}`);
    }
  }
  // Longest first: "straight-legged" must fold before "legged" can be touched by anything else.
  return [...found].sort((a, b) => b.length - a.length);
}

export function buildVocabulary(library: LibraryExercise[]): Vocabulary {
  const lifts = library.filter((e) => e.kind === "exercise");
  const compounds = compoundsFromLibrary(lifts.map((e) => e.name));

  // First pass with no known-token set: singularisation cannot fold yet, which is fine because
  // this pass exists only to LEARN the token set.
  const firstPass = lifts.map((e) => normalize(e.name, { compounds }));
  const knownTokens = new Set(firstPass.flat());
  const tokenised = lifts.map((e) => ({
    exercise: e,
    tokens: normalize(e.name, { compounds, knownTokens }),
  }));
  for (const t of tokenised) for (const token of t.tokens) knownTokens.add(token);

  // A head is a word that ends the name nearly every time it appears. "Jump" ends "Box Jump" and
  // sits inside "Jump Squat", so the share test is what decides; a title's head is then taken
  // positionally, which is what makes "Squat Box Jump" fail against Box Squat.
  const finalCount = new Map<string, number>();
  const anyCount = new Map<string, number>();
  for (const { tokens } of tokenised) {
    if (tokens.length === 0) continue;
    const last = tokens[tokens.length - 1];
    finalCount.set(last, (finalCount.get(last) ?? 0) + 1);
    for (const token of new Set(tokens)) anyCount.set(token, (anyCount.get(token) ?? 0) + 1);
  }
  const heads = new Set<string>();
  for (const [token, total] of anyCount) {
    if ((finalCount.get(token) ?? 0) / total >= HEAD_SHARE) heads.add(token);
  }

  const equipment: Record<string, string> = { ...EQUIPMENT_SYNONYMS };
  for (const e of lifts) {
    if (!e.equipment) continue;
    for (const token of normalize(e.equipment, { compounds, knownTokens })) {
      if (!heads.has(token)) equipment[token] = equipment[token] ?? token;
    }
  }
  const muscles: Record<string, string> = { ...MUSCLE_SYNONYMS };
  for (const e of lifts) {
    for (const group of e.muscleGroups) {
      for (const token of normalize(group, { compounds, knownTokens })) {
        if (!heads.has(token)) muscles[token] = muscles[token] ?? token;
      }
    }
  }

  // Everything left over. A modifier is defined by exclusion on purpose: the interesting
  // property is "this word narrows the movement", and every library word that is not a head, a
  // piece of equipment or a muscle does exactly that.
  const modifiers = new Set<string>();
  for (const token of knownTokens) {
    if (heads.has(token) || equipment[token] || muscles[token] || FILLER.has(token)) continue;
    modifiers.add(token);
  }

  const byHead = new Map<string, Map<string, number>>();
  for (const { exercise, tokens } of tokenised) {
    const head = [...tokens].reverse().find((t) => heads.has(t));
    if (!head || !exercise.equipment) continue;
    const canonical = normalize(exercise.equipment, { compounds, knownTokens })
      .map((t) => equipment[t])
      .find(Boolean);
    if (!canonical) continue;
    const counts = byHead.get(head) ?? new Map<string, number>();
    counts.set(canonical, (counts.get(canonical) ?? 0) + 1);
    byHead.set(head, counts);
  }
  const defaultEquipment: Vocabulary["defaultEquipment"] = {};
  for (const [head, counts] of byHead) {
    const n = [...counts.values()].reduce((a, b) => a + b, 0);
    if (n < DEFAULT_EQUIPMENT_MIN_NAMES) continue;
    const [top, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = topCount / n;
    if (share >= DEFAULT_EQUIPMENT_SHARE) defaultEquipment[head] = { equipment: top, share, n };
  }

  return { heads, equipment, muscles, modifiers, compounds, knownTokens, defaultEquipment };
}
