import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cachedBuilderSystem, sharedGuidelinesText } from "./ai-cache-layout";

/* THE LARGE SHARED PARTS OF A PROMPT ARE IN THE CACHED PREFIX (2026-11-17, the cost audit at 10,000
 * athletes). A cache read costs a tenth of the input price, but only for what comes BEFORE the last
 * cache mark. The exercise and skill libraries and the Coaches Corner principles are the same for
 * every athlete and used to sit after the per-athlete text or in the user message. */

const storage = readFileSync(join(__dirname, "storage.ts"), "utf8");
const bodyOf = (name: string) => {
  const at = storage.indexOf(`async ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  const next = storage.indexOf("\n  async ", at + 10);
  return storage.slice(at, next);
};

describe("cachedBuilderSystem", () => {
  it("puts the rules, then the shared material, both cached, then only what is this request's", () => {
    const blocks = cachedBuilderSystem("RULES", { adminGuidelines: "G", coachesCornerPrinciples: "CC", catalog: "LIB", perRequest: "MINE" }) as { text: string; cache?: boolean }[];
    expect(blocks.map((b) => !!b.cache)).toEqual([true, true, false]);
    expect(blocks[0].text).toBe("RULES");
    expect(blocks[1].text).toContain("G");
    expect(blocks[1].text).toContain("CC");
    expect(blocks[1].text.indexOf("LIB")).toBeGreaterThan(blocks[1].text.indexOf("CC"));
    expect(blocks[2].text).toContain("MINE");
  });

  it("leaves out an empty shared block and an empty per-request block", () => {
    expect(cachedBuilderSystem("RULES", {})).toEqual([{ text: "RULES", cache: true }]);
    expect(sharedGuidelinesText({})).toBe("");
  });
});

describe("every builder sends its library and the shared principles in the cached part", () => {
  for (const fn of ["generateProgramDraft", "generateProgramFromChat", "generateSkillProgramDraft", "generateSkillProgramFromChat"]) {
    it(`${fn} builds its system with cachedBuilderSystem and keeps the library out of the user message`, () => {
      const body = bodyOf(fn);
      expect(body).toContain("cachedBuilderSystem(staticSystem, {");
      const user = body.slice(body.indexOf("const userPrompt = `"));
      expect(user.slice(0, user.indexOf("`;"))).not.toMatch(/\$\{catalog\}/);
    });
  }

  it("the coach chat and nutrition keep the Coaches Corner principles out of the per-athlete block", () => {
    for (const fn of ["sendAthleteChatMessage", "answerNutritionQuestion"]) {
      const body = bodyOf(fn);
      const dyn = body.slice(body.indexOf("const dynamicSystem = `"));
      expect(dyn.slice(0, dyn.indexOf("`;")), fn).not.toContain("coachesCornerPrinciples");
      expect(body, fn).toMatch(/\{ text: `\\n\\n\$\{shared\w+\}`, cache: true \}/);
    }
  });
});
