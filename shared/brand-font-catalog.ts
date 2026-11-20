/** EVERY FONT A PROGRAM CAN PICK (2026-11-20). Scott: "why are there only 6 fonts? ... we need
 *  8193487192374 fonts ... we need to do better". Each is a Google Font, loaded on demand, except
 *  the two the app already carries (Barlow Condensed, Inter). An id is what is stored on the
 *  program and is never renamed: forge, oswald, bebas, montserrat and inter for headings and
 *  inter, roboto, lato, open-sans, nunito and source-serif for body text existed first.
 *
 *  `brand-fonts-are-real.test.ts` checks every id is unique and every URL is well formed; adding a
 *  font is one line here. */

export type FontCategory = "athletic" | "varsity" | "bold" | "classic" | "script" | "clean";

export const FONT_CATEGORY_LABEL: Record<FontCategory, string> = {
  athletic: "Athletic",
  varsity: "Varsity & slab",
  bold: "Bold & modern",
  classic: "Classic",
  script: "Script & hand",
  clean: "Clean",
};

export type BrandFont = {
  id: string;
  label: string;
  category: FontCategory;
  /** The CSS font-family stack. */
  stack: string;
  /** Google Fonts stylesheet to load, or null for a face the app already has. */
  googleFontsUrl: string | null;
};

type Spec = readonly [id: string, family: string, category: FontCategory, weights: string | null, fallback: "sans" | "condensed" | "serif" | "script"];

const FALLBACK = {
  sans: '"Inter", ui-sans-serif, system-ui, sans-serif',
  condensed: '"Barlow Condensed", "Inter", ui-sans-serif, system-ui, sans-serif',
  serif: "Georgia, ui-serif, serif",
  script: '"Inter", cursive',
} as const;

// Google writes a family name's spaces as "+": "Bebas Neue" becomes "Bebas+Neue".
const googleUrl = (family: string, weights: string | null) =>
  `https://fonts.googleapis.com/css2?family=${family.split(" ").join("+")}${weights ? `:wght@${weights}` : ""}&display=swap`;

function build(specs: readonly Spec[], labels: Record<string, string> = {}): BrandFont[] {
  return specs.map(([id, family, category, weights, fallback]) => ({
    id,
    label: labels[id] ?? family,
    category,
    stack: `"${family}", ${FALLBACK[fallback]}`,
    googleFontsUrl: id === "forge" || id === "inter" ? null : googleUrl(family, weights),
  }));
}

// [id, Google family, category, weights to load (null for a one-weight font), fallback]
const HEADING_SPECS: readonly Spec[] = [
  ["forge", "Barlow Condensed", "athletic", null, "condensed"],
  ["bebas", "Bebas Neue", "athletic", null, "condensed"],
  ["oswald", "Oswald", "athletic", "500;700", "condensed"],
  ["anton", "Anton", "athletic", null, "condensed"],
  ["teko", "Teko", "athletic", "600;700", "condensed"],
  ["saira-condensed", "Saira Condensed", "athletic", "700;800", "condensed"],
  ["fjalla", "Fjalla One", "athletic", null, "condensed"],
  ["big-shoulders", "Big Shoulders Display", "athletic", "700;800", "condensed"],
  ["league-gothic", "League Gothic", "athletic", null, "condensed"],
  ["khand", "Khand", "athletic", "600;700", "condensed"],
  ["graduate", "Graduate", "varsity", null, "serif"],
  ["alfa-slab", "Alfa Slab One", "varsity", null, "serif"],
  ["bevan", "Bevan", "varsity", null, "serif"],
  ["roboto-slab", "Roboto Slab", "varsity", "700;800", "serif"],
  ["arvo", "Arvo", "varsity", "700", "serif"],
  ["zilla-slab", "Zilla Slab", "varsity", "700", "serif"],
  ["rokkitt", "Rokkitt", "varsity", "700;800", "serif"],
  ["staatliches", "Staatliches", "varsity", null, "condensed"],
  ["holtwood", "Holtwood One SC", "varsity", null, "serif"],
  ["montserrat", "Montserrat", "bold", "700;800", "sans"],
  ["poppins", "Poppins", "bold", "700;800", "sans"],
  ["archivo-black", "Archivo Black", "bold", null, "sans"],
  ["rubik", "Rubik", "bold", "700;800", "sans"],
  ["kanit", "Kanit", "bold", "700;800", "sans"],
  ["exo-2", "Exo 2", "bold", "700;800", "sans"],
  ["russo-one", "Russo One", "bold", null, "sans"],
  ["black-ops", "Black Ops One", "bold", null, "sans"],
  ["bungee", "Bungee", "bold", null, "sans"],
  ["orbitron", "Orbitron", "bold", "700;800", "sans"],
  ["audiowide", "Audiowide", "bold", null, "sans"],
  ["racing-sans", "Racing Sans One", "bold", null, "sans"],
  ["chakra-petch", "Chakra Petch", "bold", "700", "sans"],
  ["rajdhani", "Rajdhani", "bold", "700", "sans"],
  ["playfair", "Playfair Display", "classic", "700;800", "serif"],
  ["cinzel", "Cinzel", "classic", "700;800", "serif"],
  ["merriweather-display", "Merriweather", "classic", "700;900", "serif"],
  ["libre-baskerville-display", "Libre Baskerville", "classic", "700", "serif"],
  ["abril-fatface", "Abril Fatface", "classic", null, "serif"],
  ["bitter", "Bitter", "classic", "700;800", "serif"],
  ["dm-serif", "DM Serif Display", "classic", null, "serif"],
  ["lobster", "Lobster", "script", null, "script"],
  ["pacifico", "Pacifico", "script", null, "script"],
  ["permanent-marker", "Permanent Marker", "script", null, "script"],
  ["kaushan", "Kaushan Script", "script", null, "script"],
  ["yellowtail", "Yellowtail", "script", null, "script"],
  ["satisfy", "Satisfy", "script", null, "script"],
  ["bangers", "Bangers", "script", null, "script"],
  ["caveat-brush", "Caveat Brush", "script", null, "script"],
  ["inter", "Inter", "clean", null, "sans"],
  ["roboto-display", "Roboto", "clean", "700;900", "sans"],
  ["lato-display", "Lato", "clean", "700;900", "sans"],
  ["open-sans-display", "Open Sans", "clean", "700;800", "sans"],
  ["nunito-display", "Nunito", "clean", "700;800", "sans"],
  ["dm-sans-display", "DM Sans", "clean", "700", "sans"],
  ["manrope-display", "Manrope", "clean", "700;800", "sans"],
  ["work-sans-display", "Work Sans", "clean", "700;800", "sans"],
  ["source-sans-display", "Source Sans 3", "clean", "700;900", "sans"],
  ["ibm-plex-display", "IBM Plex Sans", "clean", "700", "sans"],
];

export const HEADING_FONTS: BrandFont[] = build(HEADING_SPECS, { forge: "Forge (condensed)", inter: "Inter (clean)" });

// Body text has to read well small, so it is sans and serif faces with a regular weight.
const BODY_SPECS: readonly Spec[] = [
  ["inter", "Inter", "clean", null, "sans"],
  ["roboto", "Roboto", "clean", "400;500;700", "sans"],
  ["lato", "Lato", "clean", "400;700", "sans"],
  ["open-sans", "Open Sans", "clean", "400;600;700", "sans"],
  ["nunito", "Nunito", "clean", "400;600;700", "sans"],
  ["source-serif", "Source Serif 4", "classic", "400;600;700", "serif"],
  ["poppins", "Poppins", "bold", "400;500;700", "sans"],
  ["montserrat", "Montserrat", "bold", "400;600;700", "sans"],
  ["raleway", "Raleway", "bold", "400;600;700", "sans"],
  ["work-sans", "Work Sans", "clean", "400;600;700", "sans"],
  ["dm-sans", "DM Sans", "clean", "400;500;700", "sans"],
  ["manrope", "Manrope", "clean", "400;600;700", "sans"],
  ["rubik", "Rubik", "bold", "400;500;700", "sans"],
  ["source-sans", "Source Sans 3", "clean", "400;600;700", "sans"],
  ["karla", "Karla", "clean", "400;600;700", "sans"],
  ["ibm-plex", "IBM Plex Sans", "clean", "400;600;700", "sans"],
  ["mulish", "Mulish", "clean", "400;600;700", "sans"],
  ["quicksand", "Quicksand", "clean", "400;600;700", "sans"],
  ["merriweather", "Merriweather", "classic", "400;700", "serif"],
  ["libre-baskerville", "Libre Baskerville", "classic", "400;700", "serif"],
  ["lora", "Lora", "classic", "400;600;700", "serif"],
];

export const BODY_FONTS: BrandFont[] = build(BODY_SPECS, {
  inter: "Inter (Forge)",
  nunito: "Nunito (rounded)",
  "source-serif": "Source Serif (classic)",
});
