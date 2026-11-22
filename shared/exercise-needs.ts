/**
 * WHAT AN EXERCISE NEEDS, DERIVED BY RULES (2026-11-21).
 *
 * `exercises.equipment` is one word ("Barbell", "Dumbbell", "Bodyweight"), and that word cannot
 * say a bench press also needs a bench and a rack, or that a Bulgarian split squat needs
 * something to put the back foot on. So the full requirement set is derived here from three
 * things the row already carries -- the equipment word, the name, and the category -- by RULES,
 * never a hand list of four hundred names (a coach's own exercise has to resolve too). A short
 * override table covers the real exceptions, each with its reason.
 *
 * A requirement set is a list of NEEDS; each need is a list of alternatives (any one will do).
 * "Floor Press" is [[barbell, dumbbells]]: either works. "Bench Press" is
 * [[barbell], [plates], [squat_rack], [flat_bench, adjustable_bench]].
 *
 * An equipment word this module does not know resolves to NO needs and `recognised: false`, so a
 * coach's "Rings" exercise is never filtered out by a rule that never heard of rings (the room
 * filter only ever removes what it is sure about). shared/exercise-needs.test.ts holds every
 * library exercise to `recognised: true`.
 *
 * Pure and client-safe: the picker, the builder's marker and the server's filter all read it.
 */
import { equipmentPhrase, type EquipmentId, type EquipmentRoom } from "./equipment-profile";

export type EquipmentNeed = readonly EquipmentId[];

export type ExerciseForNeeds = {
  name: string;
  equipment?: string | null;
  category?: string | null;
  movementType?: string | null;
};

const BENCH: EquipmentNeed = ["flat_bench", "adjustable_bench"];
const INCLINE: EquipmentNeed = ["adjustable_bench"];
const BENCH_OR_BOX: EquipmentNeed = ["flat_bench", "adjustable_bench", "plyo_box"];
const BOX_OR_BENCH: EquipmentNeed = ["plyo_box", "flat_bench", "adjustable_bench"];

/** The one word on the row, to what it needs on its own. */
const BY_EQUIPMENT: Record<string, EquipmentNeed[]> = {
  barbell: [["barbell"], ["plates"]],
  dumbbell: [["dumbbells"]],
  kettlebell: [["kettlebells"]],
  machine: [["machines"]],
  cable: [["cable_stack"]],
  "medicine ball": [["med_ball"]],
  "med ball": [["med_ball"]],
  band: [["bands"]],
  "trap bar": [["specialty_bars"], ["plates"]],
  "hex bar": [["specialty_bars"], ["plates"]],
  "ez-bar": [["specialty_bars", "barbell"], ["plates"]],
  "ez bar": [["specialty_bars", "barbell"], ["plates"]],
  sled: [["sled"], ["sprint_space"]],
  plate: [["plates"]],
  sandbag: [["conditioning_tools"]],
  tire: [["conditioning_tools"]],
  "battle rope": [["conditioning_tools"]],
  rope: [["conditioning_tools"]],
  landmine: [["landmine"], ["barbell"], ["plates"]],
  "foam roller": [["foam_roller"]],
  "jump rope": [["small_gear"]],
  cones: [["small_gear"]],
  "agility ladder": [["small_gear"]],
  "assault bike": [["cardio_machines"]],
  "ski erg": [["cardio_machines"]],
  rower: [["cardio_machines"]],
  bench: [BENCH],
  "pull-up bar": [["pullup_bar"]],
  box: [["plyo_box"]],
  bodyweight: [],
  none: [],
};

/** The real exceptions, by exact (lower-case) name, REPLACING every rule. Each says why. */
const OVERRIDES: Record<string, EquipmentNeed[]> = {
  // Scott's example: no bench, no rack -- a barbell or a pair of dumbbells on the floor.
  "floor press": [["barbell", "dumbbells"]],
  // Seated on the floor by design; that is the lift.
  "z press": [["barbell"], ["plates"]],
  "dip": [["dip_station"]],
  // Tagged "Machine" in the library and they are not: a sled, and a bike or rower.
  "sled push": [["sled"], ["sprint_space"]],
  "sled drag": [["sled"], ["sprint_space"]],
  "assault bike intervals": [["cardio_machines"]],
  "rowing machine intervals": [["cardio_machines"]],
  // A bar set low in a rack, or a low fixed bar.
  "inverted row": [["squat_rack", "pullup_bar"]],
  // A landmine or a T-bar row machine.
  "t-bar row": [["landmine", "machines"], ["plates"]],
  "meadows row": [["landmine"], ["barbell"], ["plates"]],
  // A landmine post or a Viking press machine.
  "viking press": [["machines", "landmine"]],
  // A plank with the feet on a bench (or a box).
  "copenhagen plank": [BENCH_OR_BOX],
  "bench dip": [BENCH_OR_BOX],
};

const FREE_WEIGHT = new Set(["barbell", "dumbbell", "kettlebell", "ez-bar", "ez bar", "plate", "bodyweight", "trap bar", "hex bar", "landmine", "medicine ball", "band"]);

function has(name: string, ...words: string[]): boolean {
  return words.some((w) => name.includes(w));
}

/** The barbell's flat-bench pressing family. */
function isFlatBenchPress(n: string): boolean {
  if (has(n, "incline", "decline", "floor press", "machine")) return false;
  return has(n, "bench press", "spoto press", "larsen press", "board press", "pin press", "jm press", "tate press", "skull crusher", "pullover", "dumbbell fly");
}

/** Barbell overhead work taken from a rack. */
function isRackedOverhead(n: string): boolean {
  return has(n, "shoulder press", "push press", "behind-the-neck", "seated barbell press", "jerk balance", "snatch balance", "split jerk", "push jerk");
}

export function exerciseNeeds(ex: ExerciseForNeeds): { needs: EquipmentNeed[]; recognised: boolean } {
  const n = ex.name.trim().toLowerCase();
  const eq = (ex.equipment ?? "").trim().toLowerCase();
  const override = OVERRIDES[n];
  if (override) return { needs: override.map((need) => [...need]), recognised: true };

  const base = eq === "" ? [] : BY_EQUIPMENT[eq];
  const recognised = base !== undefined;
  const needs: EquipmentNeed[] = (base ?? []).map((need) => [...need]);
  const add = (need: EquipmentNeed) => needs.push(need);
  const freeWeight = FREE_WEIGHT.has(eq);
  const isMobility = (ex.category ?? "").toLowerCase() === "mobility";

  // A goblet is a dumbbell or a kettlebell, whichever is in the room.
  if (eq === "dumbbell" && n.includes("goblet")) needs.splice(0, needs.length, ["dumbbells", "kettlebells"]);

  // BENCHES. An incline or decline needs a bench that sets one; a flat bench press needs either.
  if (has(n, "incline", "decline") && eq !== "machine") add(INCLINE);
  else if (has(n, "chest-supported", "seal row", "spider curl")) add(INCLINE);
  else if (n.includes("preacher curl")) add(["adjustable_bench", "machines"]);
  else if (freeWeight && !isMobility && n.includes("seated") && !n.includes("box jump")) add(BENCH);
  else if (freeWeight && isFlatBenchPress(n)) add(BENCH);
  if (n.includes("hip thrust")) add(BENCH_OR_BOX);
  if (n.includes("bulgarian split squat")) add(BENCH_OR_BOX);
  if (has(n, "step-up", "step up", "step-down", "step down", "box squat")) add(BOX_OR_BENCH);

  // BOXES TO JUMP ON OR OFF.
  if (has(n, "box jump", "depth jump", "drop jump")) add(["plyo_box"]);

  // A RACK, for a barbell taken off hooks: squats, bench presses, overhead work, lunges with the
  // bar on the back, good mornings and anything "rack"/"pin".
  if (eq === "barbell") {
    const backSquat = n.includes("squat") && !has(n, "thruster", "jump", " to ");
    const onTheBack = has(n, "lunge", "step-up", "good morning");
    if (backSquat || onTheBack || isFlatBenchPress(n) || has(n, "bench press") || isRackedOverhead(n) || has(n, "rack pull", "pin press", "pin squat")) {
      add(["squat_rack"]);
    }
  }

  // A BAR TO HANG FROM.
  if (eq === "bodyweight" && (has(n, "pull-up", "pull up", "chin-up", "chin up", "hanging", "toes-to-bar", "dead hang", "muscle-up"))) {
    add(["pullup_bar"]);
  }

  // SPECIALTY BARS AND THE LANDMINE, named in the lift.
  if (has(n, "swiss bar", "safety bar", "cambered", "trap bar", "hex bar") && eq !== "trap bar" && eq !== "hex bar") add(["specialty_bars"]);
  if (n.includes("landmine") && eq !== "landmine") add(["landmine"]);

  // ROOM TO RUN. Sprints, shuttles, bounds and agility work, done on the athlete's own legs.
  const words = new Set(n.split(" "));
  const running = ["sprint", "sprints", "shuttle", "bound", "bounds", "bounding", "agility", "cone", "shuffle"].some((w) => words.has(w)) || n.includes("ladder drill");
  if ((eq === "bodyweight" || eq === "cones" || eq === "agility ladder") && running) {
    add(["sprint_space"]);
  }

  // Small things that make a bodyweight move into an equipment one.
  if (eq === "bodyweight" && n.startsWith("weighted ")) add(["plates"]);
  if (eq === "bodyweight" && n.includes("ab wheel")) add(["small_gear"]);

  return { needs: dedupe(needs), recognised };
}

function dedupe(needs: EquipmentNeed[]): EquipmentNeed[] {
  const seen = new Set<string>();
  return needs.filter((need) => {
    const key = [...need].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The needs of this exercise the room does not meet. Empty when the room is null (no profile). */
export function unmetNeeds(ex: ExerciseForNeeds, room: EquipmentRoom | null): EquipmentNeed[] {
  if (!room) return [];
  const have = new Set(room.items);
  return exerciseNeeds(ex).needs.filter((need) => !need.some((id) => have.has(id)));
}

/** May this exercise be placed in this room. Always true with no profile. */
export function roomAllows(ex: ExerciseForNeeds, room: EquipmentRoom | null): boolean {
  return unmetNeeds(ex, room).length === 0;
}

/** "a flat bench or an adjustable bench" -- one unmet need in words. */
export function needPhrase(need: EquipmentNeed): string {
  const phrases = need.map(equipmentPhrase);
  if (phrases.length <= 1) return phrases[0] ?? "";
  return `${phrases.slice(0, -1).join(", ")} or ${phrases[phrases.length - 1]}`;
}

/** The marker the builder draws: "Needs a flat bench or an adjustable bench you haven't listed". */
export function missingEquipmentSentence(ex: ExerciseForNeeds, room: EquipmentRoom | null): string | null {
  const unmet = unmetNeeds(ex, room);
  if (unmet.length === 0) return null;
  return `Needs ${unmet.map(needPhrase).join(" and ")} you haven't listed`;
}

/** The exercises a room can do, or every one of them when that would leave nothing (a room
 * filter narrows a choice; it never leaves a feature with nothing to offer). */
export function keepForRoom<T extends ExerciseForNeeds>(list: readonly T[], room: EquipmentRoom | null): T[] {
  if (!room) return [...list];
  const kept = list.filter((ex) => roomAllows(ex, room));
  return kept.length > 0 ? kept : [...list];
}
