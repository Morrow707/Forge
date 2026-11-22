/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/require-regex-example -- test fixtures; the comment strip below removes block and line comments ("// x" and "/* x *\/" go, code stays) */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EQUIPMENT_IDS, equipmentPromptBlock } from "@shared/equipment-profile";

const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const read = (rel: string) => stripComments(readFileSync(join(__dirname, "..", rel), "utf8"));

describe("the room the AI is told about", () => {
  it("says nothing at all with no profile, so nobody's prompt changes until they set one", () => {
    expect(equipmentPromptBlock(null)).toBeNull();
  });

  it("names what is on hand, what is not, and Scott's floor-press example", () => {
    const block = equipmentPromptBlock({ items: EQUIPMENT_IDS.filter((id) => id !== "flat_bench" && id !== "adjustable_bench"), dumbbellMaxLbs: 50 })!;
    expect(block).toContain("Weight-room equipment on hand:");
    expect(block).toMatch(/Not available: Flat bench, Adjustable bench\./);
    expect(block).toContain("floor press");
    expect(block).toContain("50 lb");
  });

  it("an empty list is bodyweight only, not 'everything'", () => {
    expect(equipmentPromptBlock({ items: [], dumbbellMaxLbs: null })).toContain("nothing (bodyweight only)");
  });

});

describe("every AI path that places an exercise reads the room", () => {
  const storage = read("server/storage.ts");
  const body = (name: string) => {
    const at = storage.indexOf(`async ${name}(`);
    expect(at, name).toBeGreaterThan(-1);
    const next = storage.indexOf("\n  async ", at + 10);
    return storage.slice(at, next);
  };

  it.each(["generateProgramDraft", "generateProgramFromChat", "substituteExercise", "regressExerciseForAthlete"])("%s asks for the room and tells the model", (name) => {
    const fn = body(name);
    expect(fn).toContain("roomForActor(");
  });

  it("the draft's catalog AND its id enum come from the room-narrowed list", () => {
    const fn = body("generateProgramDraft");
    expect(fn).toContain("const validIds = roomExercises.map((e) => e.id);");
    expect(fn).toContain("const catalog = roomExercises");
    expect(fn).toContain("draftRoomBlock");
  });

  it("the chat never drops an exercise already in the program", () => {
    const fn = body("generateProgramFromChat");
    expect(fn).toContain("alreadyPlaced.has(e.id) || roomAllows(e, chatRoom)");
  });

  it("the training chat and the pain swap know the room too", () => {
    expect(storage).toContain("const chatRoomLine = equipmentPromptBlock(await roomForActor(athleteId));");
    expect(storage).toContain("const candidates = keepForRoom(safeCandidates, await roomForActor(athleteId));");
  });

  it("the program import offers the room's exercises first and keeps the coach's own rows", () => {
    const routes = read("server/program-import-routes.ts");
    expect(routes).toContain("suggestionsRoomFirst(result.draft, room)");
  });
});

describe("the picker and the library", () => {
  it.each(["client/src/components/exercise-picker-dialog.tsx", "client/src/pages/exercise-bank.tsx"])("%s has 'Only what my room has', on by default once a room is set", (rel) => {
    const src = read(rel);
    expect(src).toContain("Only what my room has");
    expect(src).toContain("const roomOnly = roomOnlyChoice ?? hasProfile;");
    expect(src).toContain("!roomOnly || !room || roomAllows(ex, room)");
    // Never stored: the toggle narrows one list and hides nothing for good.
    expect(src).not.toMatch(/localStorage[^\n]*roomOnly/);
  });

  it("the builder marks a hand-placed exercise rather than removing it", () => {
    const src = read("client/src/pages/program-builder.tsx");
    expect(src).toContain("missingEquipmentSentence(");
    expect(src).toContain("room-marker-");
  });
});
