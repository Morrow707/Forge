/**
 * THE WEIGHT-ROOM EQUIPMENT PROFILE (2026-11-21). Scott: "build that out site wide, or at least
 * give the ai knowledge to know ok they don't have a bench so every sort of seated press is out,
 * but we can still do floor press".
 *
 * A profile is a checklist of what a room HAS. Who holds one:
 *   - a coach PROGRAM, one per team plus a program-wide default (the primary coach edits, staff
 *     read), and
 *   - a Free Agent, a coach or an admin, for their OWN training.
 * A coached athlete trains in their program's room and does not set one.
 *
 * NO PROFILE MEANS EVERYTHING IS AVAILABLE (`null` everywhere below), so nothing changes for
 * anybody until they set one. An empty list is the opposite, a real answer: "none, bodyweight
 * only".
 *
 * What each exercise NEEDS is derived in shared/exercise-needs.ts.
 */

export const EQUIPMENT_ITEMS = [
  { id: "barbell", label: "Barbell", phrase: "a barbell" },
  { id: "plates", label: "Plates / bumpers", phrase: "plates" },
  { id: "squat_rack", label: "Squat rack", phrase: "a rack" },
  { id: "flat_bench", label: "Flat bench", phrase: "a flat bench" },
  { id: "adjustable_bench", label: "Adjustable bench", phrase: "an adjustable bench" },
  { id: "dumbbells", label: "Dumbbells", phrase: "dumbbells" },
  { id: "kettlebells", label: "Kettlebells", phrase: "kettlebells" },
  { id: "cable_stack", label: "Cable stack", phrase: "a cable stack" },
  { id: "pullup_bar", label: "Pull-up bar", phrase: "a pull-up bar" },
  { id: "dip_station", label: "Dip bars", phrase: "dip bars" },
  { id: "platform", label: "Lifting platform", phrase: "a platform" },
  { id: "plyo_box", label: "Plyo box", phrase: "a plyo box" },
  { id: "med_ball", label: "Medicine ball", phrase: "a med ball" },
  { id: "bands", label: "Bands", phrase: "bands" },
  { id: "sled", label: "Sled", phrase: "a sled" },
  { id: "machines", label: "Machines (leg press, leg curl, etc.)", phrase: "a machine" },
  { id: "sprint_space", label: "Turf or space to sprint", phrase: "space to sprint" },
  { id: "specialty_bars", label: "Specialty bars (trap, EZ, safety)", phrase: "a specialty bar" },
  { id: "landmine", label: "Landmine", phrase: "a landmine" },
  { id: "cardio_machines", label: "Bike, rower or ski erg", phrase: "a bike, rower or ski erg" },
  { id: "conditioning_tools", label: "Ropes, sandbags or tires", phrase: "ropes, sandbags or a tire" },
  { id: "foam_roller", label: "Foam roller", phrase: "a foam roller" },
  { id: "small_gear", label: "Jump rope, cones, ladder, ab wheel", phrase: "small gear (rope, cones, ladder)" },
] as const;

export type EquipmentId = (typeof EQUIPMENT_ITEMS)[number]["id"];
export const EQUIPMENT_IDS: readonly EquipmentId[] = EQUIPMENT_ITEMS.map((i) => i.id);
const ITEM_BY_ID = new Map<string, (typeof EQUIPMENT_ITEMS)[number]>(EQUIPMENT_ITEMS.map((i) => [i.id, i]));

export function isEquipmentId(value: string): value is EquipmentId {
  return ITEM_BY_ID.has(value);
}

export function equipmentLabel(id: EquipmentId): string {
  return ITEM_BY_ID.get(id)?.label ?? id;
}

export function equipmentPhrase(id: EquipmentId): string {
  return ITEM_BY_ID.get(id)?.phrase ?? id;
}

/** A room as every reader uses it. `null` = no profile = everything available. */
export type EquipmentRoom = {
  items: EquipmentId[];
  /** The heaviest dumbbell in the room, in pounds. Told to the AI; never filters. */
  dumbbellMaxLbs: number | null;
};

/** A stored list cleaned to known ids, de-duplicated, in the checklist's order. */
export function cleanEquipmentItems(items: readonly string[] | null | undefined): EquipmentId[] {
  const set = new Set((items ?? []).filter(isEquipmentId));
  return EQUIPMENT_IDS.filter((id) => set.has(id));
}

export const MAX_DUMBBELL_LBS = 300;

/** The sentence the AI is handed. Null with no profile, so a prompt is unchanged for anybody who
 * has not set one. */
export function equipmentPromptBlock(room: EquipmentRoom | null): string | null {
  if (!room) return null;
  const have = new Set(room.items);
  const missing = EQUIPMENT_IDS.filter((id) => !have.has(id) && id !== "platform");
  const haveText = room.items.length ? room.items.map(equipmentLabel).join(", ") : "nothing (bodyweight only)";
  const dumbbells = room.dumbbellMaxLbs && have.has("dumbbells") ? ` The heaviest dumbbell is ${room.dumbbellMaxLbs} lb.` : "";
  return `Weight-room equipment on hand: ${haveText}. Not available: ${missing.map(equipmentLabel).join(", ") || "nothing"}.${dumbbells} Only choose exercises this room can do -- for example, with no bench, no bench press, incline press or seated press (a floor press still works with a barbell or dumbbells). The exercise list you are given has already been narrowed to what this room can do.`;
}
