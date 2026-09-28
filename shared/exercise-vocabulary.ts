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
  /** "hack squat" -> machine: a NAMED variation whose every library entry shares one piece of
   *  equipment. A head's default is learned over many names; a phrase's over the few that carry
   *  it, so it only speaks when they all agree. Keyed by the name's tokens minus equipment. */
  phraseEquipment: Record<string, string>;
};

/** Name-final in at least this share of the names it appears in. */
export const HEAD_SHARE = 0.8;
/** A token that ends this many names is a head regardless of where else it appears. */
export const HEAD_MIN_FINALS = 1;
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
  // Multi-word equipment ("Medicine Ball", "Battle Rope", "Assault Bike", "Ski Erg") folds to one
  // token, or its two halves read as two different pieces of equipment and every title carrying
  // the exercise's own name is refused as "names two pieces of equipment" (2026-09-28).
  const equipmentPhrases = lifts
    .map((e) => e.equipment?.trim().toLowerCase() ?? "")
    .filter((eq) => /^[a-z]+ [a-z]+$/.test(eq))
    .map((eq) => eq.replace(" ", "-"));
  const compounds = compoundsFromLibrary([...lifts.map((e) => e.name), ...equipmentPhrases]);

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
  for (const { exercise, tokens } of tokenised) {
    if (tokens.length === 0) continue;
    // The final word is read with any parenthetical removed: "Calf Stretch (Wall)" ends in
    // "stretch", and counting "wall" as a head made the name disagree with its own title,
    // which reads the parenthetical as a modifier (2026-09-28).
    const body = normalize(exercise.name.replace(/[(（][^)）]*[)）]/g, " "), { compounds, knownTokens });
    const last = (body.length > 0 ? body : tokens)[body.length > 0 ? body.length - 1 : tokens.length - 1];
    finalCount.set(last, (finalCount.get(last) ?? 0) + 1);
    for (const token of new Set(tokens)) anyCount.set(token, (anyCount.get(token) ?? 0) + 1);
  }
  // A word that ENDS at least two names is a movement word, whatever else it does elsewhere.
  // The share test alone excluded "squat", "deadlift", "clean" and "swing" -- the biggest lifts
  // in the library -- because each also sits inside other names ("Squat Jump", "Clean Pull"),
  // and 82 exercises then had no head at all (found 2026-09-28: Back Squat and Deadlift were
  // reported as "nothing in the pool mentions this movement" against a pool that held both by
  // name). The share test still admits a one-off head ("Cat-Cow" ends its only name). Which
  // head a TITLE has is positional (the last head-eligible token), so "jump" being a head does
  // not make "Squat Box Jump" a squat.
  const heads = new Set<string>();
  for (const [token, total] of anyCount) {
    const finals = finalCount.get(token) ?? 0;
    if (finals >= HEAD_MIN_FINALS || finals / total >= HEAD_SHARE) heads.add(token);
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
  // "Hack Squat" was refused for Machine Hack Squat because the head's default is barbell and
  // "not the usual one for a squat" is true of squats in general and false of hack squats in
  // particular (2026-09-28). A phrase with two or more words that the library only ever pairs
  // with one piece of equipment is that equipment when a title leaves it unsaid.
  const byPhrase = new Map<string, Set<string>>();
  for (const { exercise, tokens } of tokenised) {
    if (!exercise.equipment) continue;
    const canonical = normalize(exercise.equipment, { compounds, knownTokens })
      .map((t) => equipment[t])
      .find(Boolean);
    if (!canonical) continue;
    const phrase = tokens.filter((t) => !equipment[t]).join(" ");
    if (phrase.split(" ").length < 2) continue;
    const set = byPhrase.get(phrase) ?? new Set<string>();
    set.add(canonical);
    byPhrase.set(phrase, set);
  }
  const phraseEquipment: Vocabulary["phraseEquipment"] = {};
  for (const [phrase, set] of byPhrase) if (set.size === 1) phraseEquipment[phrase] = [...set][0];

  const defaultEquipment: Vocabulary["defaultEquipment"] = {};
  for (const [head, counts] of byHead) {
    const n = [...counts.values()].reduce((a, b) => a + b, 0);
    if (n < DEFAULT_EQUIPMENT_MIN_NAMES) continue;
    const [top, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = topCount / n;
    if (share >= DEFAULT_EQUIPMENT_SHARE) defaultEquipment[head] = { equipment: top, share, n };
  }

  return { heads, equipment, muscles, modifiers, compounds, knownTokens, defaultEquipment, phraseEquipment };
}
