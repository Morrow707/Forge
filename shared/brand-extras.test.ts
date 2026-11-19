import { describe, expect, it } from "vitest";
import {
  applyBrandTerms,
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
  });
});
