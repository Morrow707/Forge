/** The choices a coach can make on the Branding page that are a pick-list rather than a free
 *  value. Shared so the page, the validator and the style computation agree on the ids.
 *
 *  Added 2026-10-03 when Scott asked for the app to be "fully customizable, for example if cal
 *  berkley used us, can they change everything to blue and gold? every single thing". */

import { HEADING_FONTS, type BrandFont } from "./brand-font-catalog";

/** A heading font's id, as stored on users.brandHeadingFont. The list is brand-font-catalog.ts. */
export type BrandHeadingFontId = string;

export const BRAND_HEADING_FONTS: BrandFont[] = HEADING_FONTS;

export const BRAND_HEADING_FONT_IDS = BRAND_HEADING_FONTS.map((f) => f.id) as [string, ...string[]];

/** Background tint strength: 1 is the subtle tint Forge ships with, 3 is unmistakably the
 *  team's color. Multiplies the saturation of every neutral surface token; lightness never
 *  moves, which is what keeps the contrast the ladder was tuned for. */
export const BRAND_BACKGROUND_STRENGTHS = [1, 2, 3] as const;
export type BrandBackgroundStrength = (typeof BRAND_BACKGROUND_STRENGTHS)[number];

/** The public team address: forgeperformancesystems.com/team/<slug>. Lowercase letters, digits
 *  and hyphens, three to thirty characters, so it reads on a flyer. */
export const BRAND_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
