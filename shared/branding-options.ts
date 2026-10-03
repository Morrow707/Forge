/** The choices a coach can make on the Branding page that are a pick-list rather than a free
 *  value. Shared so the page, the validator and the style computation agree on the ids.
 *
 *  Added 2026-10-03 when Scott asked for the app to be "fully customizable, for example if cal
 *  berkley used us, can they change everything to blue and gold? every single thing". */

export type BrandHeadingFontId = "forge" | "oswald" | "bebas" | "montserrat" | "inter";

export const BRAND_HEADING_FONTS: {
  id: BrandHeadingFontId;
  label: string;
  /** The CSS font-family stack set on --font-display. */
  stack: string;
  /** Google Fonts stylesheet to load, or null for a face the app already has. */
  googleFontsUrl: string | null;
}[] = [
  { id: "forge", label: "Forge (condensed)", stack: '"Barlow Condensed", "Inter", ui-sans-serif, system-ui, sans-serif', googleFontsUrl: null },
  { id: "oswald", label: "Oswald", stack: '"Oswald", "Barlow Condensed", ui-sans-serif, system-ui, sans-serif', googleFontsUrl: "https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap" },
  { id: "bebas", label: "Bebas Neue", stack: '"Bebas Neue", "Barlow Condensed", ui-sans-serif, system-ui, sans-serif', googleFontsUrl: "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" },
  { id: "montserrat", label: "Montserrat", stack: '"Montserrat", "Inter", ui-sans-serif, system-ui, sans-serif', googleFontsUrl: "https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&display=swap" },
  { id: "inter", label: "Inter (clean)", stack: '"Inter", ui-sans-serif, system-ui, sans-serif', googleFontsUrl: null },
];

export const BRAND_HEADING_FONT_IDS = BRAND_HEADING_FONTS.map((f) => f.id) as [BrandHeadingFontId, ...BrandHeadingFontId[]];

/** Background tint strength: 1 is the subtle tint Forge ships with, 3 is unmistakably the
 *  team's color. Multiplies the saturation of every neutral surface token; lightness never
 *  moves, which is what keeps the contrast the ladder was tuned for. */
export const BRAND_BACKGROUND_STRENGTHS = [1, 2, 3] as const;
export type BrandBackgroundStrength = (typeof BRAND_BACKGROUND_STRENGTHS)[number];

/** The public team address: forgeperformancesystems.com/team/<slug>. Lowercase letters, digits
 *  and hyphens, three to thirty characters, so it reads on a flyer. */
export const BRAND_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
