import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { HIGH_SCHOOLS_FAQ, highSchoolsFaqJsonLd } from "./high-schools-faq";
import { ORG_PER_ATHLETE_CENTS } from "./billing-tiers";
import { MOVEMENTS } from "./movement-library";

describe("the schools FAQ", () => {
  it("quotes the price and the validated movements from their constants", () => {
    const text = HIGH_SCHOOLS_FAQ.map((f) => f.answer).join(" ");
    expect(text).toContain(`$${(ORG_PER_ATHLETE_CENTS / 100).toFixed(0)} per athlete`);
    for (const m of MOVEMENTS) expect(text.toLowerCase()).toContain(m.name.toLowerCase());
  });

  it("makes no measurement claim and no legal conclusion", () => {
    for (const f of HIGH_SCHOOLS_FAQ) {
      expect(f.answer.toLowerCase(), f.question).not.toMatch(/accura|compliant|complian/);
      expect(f.question.toLowerCase(), f.question).not.toMatch(/accura|compliant/);
    }
    expect(JSON.stringify(highSchoolsFaqJsonLd()).toLowerCase()).not.toMatch(/accura/);
  });

  it("the page renders the same list the schema describes, and the schema is emitted only there", () => {
    const page = readFileSync("client/src/pages/for-high-schools.tsx", "utf8");
    expect(page).toMatch(/HIGH_SCHOOLS_FAQ\.map\(/);
    const sd = readFileSync("shared/structured-data.ts", "utf8");
    expect(sd).toMatch(/route\.path === "\/for-high-schools"[\s\S]{0,120}highSchoolsFaqJsonLd\(\)/);
    expect(highSchoolsFaqJsonLd().mainEntity.length).toBe(HIGH_SCHOOLS_FAQ.length);
    expect(HIGH_SCHOOLS_FAQ.length).toBeGreaterThanOrEqual(8);
  });
});
