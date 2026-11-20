import { describe, expect, it } from "vitest";
import { BODY_FONTS, HEADING_FONTS } from "./brand-font-catalog";
import { updateBrandingSchema } from "./schema";
import { brandExtrasSchema } from "./brand-extras-schema";

// THE FONT LISTS GREW FROM 5 AND 6 TO 58 AND 21 (2026-11-20). Every id is what a program has
// stored, so the ones that existed before must stay, every id must be unique, and the server
// must accept every font the page offers. Each URL was fetched from Google when this was written
// (79 of 79 returned a real @font-face); this checks the shape so a typo cannot ship.

const BEFORE_HEADING = ["forge", "oswald", "bebas", "montserrat", "inter"];
const BEFORE_BODY = ["inter", "roboto", "lato", "open-sans", "nunito", "source-serif"];

describe("the font catalog", () => {
  it("keeps every font id a program may already have saved", () => {
    expect(HEADING_FONTS.map((f) => f.id)).toEqual(expect.arrayContaining(BEFORE_HEADING));
    expect(BODY_FONTS.map((f) => f.id)).toEqual(expect.arrayContaining(BEFORE_BODY));
  });

  it("offers many fonts, with no id used twice in a list", () => {
    expect(HEADING_FONTS.length).toBeGreaterThanOrEqual(50);
    expect(BODY_FONTS.length).toBeGreaterThanOrEqual(20);
    [HEADING_FONTS, BODY_FONTS].forEach((list) => expect(new Set(list.map((f) => f.id)).size).toBe(list.length));
  });

  it("loads every font from Google except the two the app carries", () => {
    const local = [...HEADING_FONTS, ...BODY_FONTS].filter((f) => f.googleFontsUrl === null).map((f) => f.id);
    expect(new Set(local)).toEqual(new Set(["forge", "inter"]));
    [...HEADING_FONTS, ...BODY_FONTS].forEach((f) => {
      if (!f.googleFontsUrl) return;
      // A css2 URL: one family with "+" for spaces, an optional weight list, display=swap.
      // "family=Bebas+Neue&display=swap" passes; a space or a missing display does not.
      // https://regex101.com/?regex=%5Ehttps%3A%5C%2F%5C%2Ffonts%5C.googleapis%5C.com%5C%2Fcss2%5C%3Ffamily%3D%5BA-Za-z0-9%2B%5D%2B(%3Awght%40%5B0-9%3B%5D%2B)%3F%26display%3Dswap%24
      expect(f.googleFontsUrl).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=[A-Za-z0-9+]+(:wght@[0-9;]+)?&display=swap$/);
      expect(f.stack.startsWith('"')).toBe(true);
    });
  });

  it("the server accepts every heading and body font the page offers", () => {
    HEADING_FONTS.forEach((f) => expect(updateBrandingSchema.safeParse({ headingFont: f.id }).success, f.id).toBe(true));
    BODY_FONTS.forEach((f) => expect(brandExtrasSchema.safeParse({ bodyFont: f.id }).success, f.id).toBe(true));
    expect(updateBrandingSchema.safeParse({ headingFont: "comic-sans" }).success).toBe(false);
  });
});
