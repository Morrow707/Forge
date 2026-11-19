import { describe, expect, it } from "vitest";
import {
  activeSeason,
  programAnswerFits,
  programTrophyKey,
  withActiveSeason,
  applyBrandTerms,
  applyBrandTermsToHtml,
  brandExtrasSchema,
  brandExtrasWithinEntitlements,
  brandTerm,
  publicBrandExtras,
  type BrandExtras,
} from "./brand-extras";
import { brandingWithinEntitlements } from "./branding-within-entitlements";

// A PROGRAM'S OWN WORDS, LOOK, DASHBOARD, NOTE, BANNER, CELEBRATION AND ICON (2026-11-19).

const FULL: BrandExtras = {
  terms: { program: { one: "Block", many: "Blocks" }, coach: { one: "Trainer", many: "Trainers" } },
  wording: { greeting: "Let's work, {name}", restDay: "Recover today", workoutDone: "Go Bears" },
  defaultTheme: "light",
  corners: "round",
  pillButtons: true,
  bodyFont: "lato",
  wordmarkUrl: "/uploads/team-logos/w.png",
  backgroundImageUrl: "/uploads/team-logos/b.jpg",
  athleteDashboard: { order: ["stat-tiles"], hidden: ["nutrition-summary"] },
  coachNote: "Film every top set",
  announcement: { text: "Lifting moves to 6am", until: "2099-01-01" },
  celebration: { message: "Bear down!", color: "#FDB515" },
  appIcon: "navy",
  checkinQuestions: [{ id: "breakfast", text: "Did you eat breakfast?", kind: "yesno" }],
  trophies: [{ id: "cub", label: "Bear Cub", category: "workout_count", threshold: 5, tier: "gold" }],
  seasons: [{ id: "rival", name: "Rivalry week", start: "2026-11-20", end: "2026-11-27", primaryColor: "#B91C1C", secondaryColor: null, banner: "Beat Central!" }],
  recap: { enabled: true, weekday: 1, includeTotals: true, includeTopPerformers: false, note: "Good week", sendToGuardians: false },
  welcomeScreens: [{ title: "Welcome", body: "Lift at 6" }],
};
const ALL = { hasCustomColors: true, hasTeamIdentity: true, hasWorkflowCustomization: true, hasPersonalPage: true };
const NONE = { hasCustomColors: false, hasTeamIdentity: false, hasWorkflowCustomization: false, hasPersonalPage: false };

describe("the program's words", () => {
  it("swap whole words only, plural before singular, keeping the first letter's case", () => {
    expect(applyBrandTerms("Programs", FULL)).toBe("Blocks");
    expect(applyBrandTerms("Ask your coach about this program", FULL)).toBe("Ask your trainer about this block");
    expect(applyBrandTerms("Programming", FULL)).toBe("Programming");
    expect(applyBrandTerms("Programs", null)).toBe("Programs");
    expect(brandTerm(FULL, "coach")).toBe("Trainer");
    expect(brandTerm(FULL, "athlete", true)).toBe("Athletes");
  });

  it("can rename one word without the rest", () => {
    expect(brandExtrasSchema.safeParse({ terms: { set: { one: "Round", many: "Rounds" } } }).success).toBe(true);
  });
});

describe("what the plan allows", () => {
  it("keeps everything with Full Personalization and nothing without it", () => {
    expect(brandExtrasWithinEntitlements(FULL, ALL)).toEqual(FULL);
    expect(brandExtrasWithinEntitlements(FULL, NONE)).toEqual({});
  });

  it("is applied wherever the older branding is narrowed", () => {
    const narrowed = brandingWithinEntitlements({ brandTeamName: "Cal", brandExtras: FULL }, NONE);
    expect(narrowed.brandTeamName).toBe("Cal");
    expect(narrowed.brandExtras).toEqual({});
  });
});

describe("pages anyone can open", () => {
  it("see the look and never the program's note, banner, layout, wording or celebration", () => {
    const shown = publicBrandExtras(FULL);
    expect(Object.keys(shown).sort()).toEqual(
      ["backgroundImageUrl", "bodyFont", "corners", "defaultTheme", "pillButtons", "wordmarkUrl"].sort(),
    );
    expect(JSON.stringify(shown)).not.toContain("Film every top set");
    expect(JSON.stringify(shown)).not.toContain("Lifting moves");
    ["Did you eat breakfast", "Bear Cub", "Rivalry week", "Good week", "Lift at 6"].forEach((secret) =>
      expect(JSON.stringify(shown)).not.toContain(secret),
    );
  });
});

describe("a season", () => {
  it("runs inclusive of both its dates and lays its colors over the program's", () => {
    expect(activeSeason(FULL, "2026-11-19")).toBeNull();
    expect(activeSeason(FULL, "2026-11-20")?.name).toBe("Rivalry week");
    expect(activeSeason(FULL, "2026-11-27")?.name).toBe("Rivalry week");
    expect(activeSeason(FULL, "2026-11-28")).toBeNull();
    const base = { brandPrimaryColor: "#003262", brandSecondaryColor: "#FDB515", brandExtras: FULL };
    const during = withActiveSeason(base, "2026-11-22");
    expect(during.brandPrimaryColor).toBe("#B91C1C");
    expect(during.brandSecondaryColor).toBe("#FDB515");
    expect(during.activeSeason).toEqual({ name: "Rivalry week", banner: "Beat Central!" });
    expect(withActiveSeason(base, "2026-12-01")).toEqual({ ...base, activeSeason: null });
  });
});

describe("a program's check-in answer", () => {
  it("fits its question's kind", () => {
    expect(programAnswerFits("scale", "3")).toBe(true);
    expect(programAnswerFits("scale", "6")).toBe(false);
    expect(programAnswerFits("yesno", "yes")).toBe(true);
    expect(programAnswerFits("yesno", "maybe")).toBe(false);
    expect(programAnswerFits("text", "Ate eggs")).toBe(true);
    expect(programAnswerFits("text", "   ")).toBe(false);
  });
});

describe("a program trophy", () => {
  it("is keyed to its program so two programs' trophies with one id are two trophies", () => {
    expect(programTrophyKey(7, "cub")).toBe("program:7:cub");
    expect(programTrophyKey(7, "cub")).not.toBe(programTrophyKey(8, "cub"));
  });

  it("refuses more than the limits", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, text: "Q?", kind: "yesno" as const }));
    expect(brandExtrasSchema.safeParse({ checkinQuestions: many }).success).toBe(false);
  });
});

describe("the program's words outside the app", () => {
  it("never rename a Forge product", () => {
    expect(applyBrandTerms("Open Coaches Corner, coach", FULL)).toBe("Open Coaches Corner, trainer");
  });

  it("swap the words in an email's text and never in a link or attribute", () => {
    const html = '<p>Your new program is ready.</p><a href="https://x.test/athlete/programs" title="Programs">Open programs</a>';
    expect(applyBrandTermsToHtml(html, FULL)).toBe(
      '<p>Your new block is ready.</p><a href="https://x.test/athlete/programs" title="Programs">Open blocks</a>',
    );
    expect(applyBrandTermsToHtml(html, null)).toBe(html);
  });
});
