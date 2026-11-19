import {
  APP_DARK_BACKGROUND_HEX,
  APP_LIGHT_BACKGROUND_HEX,
  contrastForegroundHsl,
  hexToHslTriplet,
  readableTextShade,
} from "@/lib/color";

/** A brand color as everything that draws with it needs it (2026-11-19): the fill, the text ON
 *  the fill (black or white, whichever reads -- this was never set, so a gold program's buttons
 *  had white text on gold), and the shade TEXT in that color takes on each theme's background
 *  (a navy program's links were navy on near-black). index.css reads the two text shades. */
function brandColorVars(hex: string, name: "primary" | "secondary"): Record<string, string> {
  const hsl = hexToHslTriplet(hex);
  if (!hsl) return {};
  const onDark = readableTextShade(hex, APP_DARK_BACKGROUND_HEX);
  const onLight = readableTextShade(hex, APP_LIGHT_BACKGROUND_HEX);
  return {
    [`--${name}`]: hsl,
    [`--${name}-foreground`]: contrastForegroundHsl(hex),
    ...(onDark ? { [`--${name}-text-dark`]: hexToHslTriplet(onDark) ?? hsl } : {}),
    ...(onLight ? { [`--${name}-text-light`]: hexToHslTriplet(onLight) ?? hsl } : {}),
  };
}
import { BRAND_HEADING_FONTS } from "@shared/branding-options";
import type { ExercisePageTheme } from "@shared/schema";
import { BRAND_BODY_FONTS, BRAND_CORNERS, type BrandExtras } from "@shared/brand-extras";
import { resolveApiUrl } from "@/lib/queryClient";

export type EffectiveBranding = {
  brandTeamName?: string | null;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
  brandMotto?: string | null;
  brandMission?: string | null;
  brandContactEmail?: string | null;
  brandWelcomeMessage?: string | null;
  // The rest of the look (2026-10-03): see users.brandBackgroundHue and friends in schema.ts.
  brandBackgroundHue?: number | null;
  brandBackgroundStrength?: number | null;
  brandHeadingFont?: string | null;
  brandSlug?: string | null;
  brandSenderName?: string | null;
  // Only ever populated for an athlete's own /api/branding/me response --
  // rides along so athlete-facing screens can read a primary-coach-set term
  // (e.g. DAILY_CHECKIN_TERM_KEY in shared/wellness.ts) through this same
  // GET. Read-only from here: nothing PATCHes navLabelOverrides through
  // this route, only /api/coach/nav-prefs (primary-coach-gated) can.
  navLabelOverrides?: Record<string, string>;
  // Personal Page (paid add-on, see shared/billing-tiers.ts) -- an athlete's
  // coach's exercise-page color overrides, or null if never set/not
  // entitled. Read-only from here, same as navLabelOverrides above; only
  // /api/coach/exercise-page-theme (primary-coach-gated) writes it.
  // client/src/pages/workout.tsx is the only consumer.
  exercisePageTheme?: ExercisePageTheme | null;
  /** The rest of the program's personalization (shared/brand-extras.ts), narrowed to its plan. */
  brandExtras?: BrandExtras | null;
};

// Mirrors users.personalAccentColor/personalSecondaryColor/
// personalBackgroundHue -- see that column's own comment in
// shared/schema.ts for what each one drives.
export type PersonalTheme = {
  accentColor?: string | null;
  secondaryColor?: string | null;
  backgroundHue?: number | null;
};

/** Converts an effective branding record (plus an optional personal theme
 * layered on top) into this app's CSS custom-property overrides (see
 * index.css's --primary etc, all raw "H S% L%" triplets, not literal
 * colors -- --neutral-hue and --glow-alpha are the two exceptions, which
 * are bare numbers). Shared between AppShell (a logged-in user's own
 * re-skin) and the signup page (a pre-login preview from a typed invite
 * code) so the two can't drift on which tokens get overridden or how.
 *
 * `personal` only ever applies to the viewer's own session (see the
 * PersonalTheme fields' own comments in shared/schema.ts) -- a coach's own
 * picks, set on their own account, applied on top of whatever the org's
 * branding already set. It's still purely local to that coach's own view --
 * nothing here touches what anyone else sees.
 *  - accentColor overrides --primary/--ring/--accent/--rim (buttons,
 *    "today" highlights, PR/streak numbers, and the frosted-card border) --
 *    plus lights up the ambient --glow layer those same surfaces already
 *    carry at zero opacity, so "the shadow" visibly picks up the color too.
 *  - secondaryColor overrides --secondary alone, same as brandSecondaryColor
 *    below -- a coach's own second color, independent of their accent.
 *  - backgroundHue overrides --neutral-hue, retinting the whole neutral
 *    surface ladder (background/card/surface/border/etc) while every
 *    token keeps its own already-tuned saturation/lightness. */
export function computeBrandingStyle(
  branding: EffectiveBranding | null | undefined,
  personal?: PersonalTheme | null,
): React.CSSProperties | undefined {
  const vars: Record<string, string> = {};
  if (branding?.brandPrimaryColor) {
    const hsl = hexToHslTriplet(branding.brandPrimaryColor);
    if (hsl) {
      Object.assign(vars, brandColorVars(branding.brandPrimaryColor, "primary"));
      vars["--ring"] = hsl;
      vars["--accent"] = hsl;
      // The ambient glow follows the program's color, the same way a coach's own accent
      // already lit it. Before 2026-10-03 a branded app glowed Forge orange under blue buttons.
      vars["--glow"] = hsl;
      vars["--glow-alpha"] = "0.18";
    }
  }
  if (branding?.brandSecondaryColor) {
    const hsl = hexToHslTriplet(branding.brandSecondaryColor);
    if (hsl) {
      Object.assign(vars, brandColorVars(branding.brandSecondaryColor, "secondary"));
      // The second series on every chart. Blue by default (index.css); the program's
      // second colour when it has one, so a Cal chart is blue and gold, not blue and blue.
      vars["--chart-2"] = hsl;
    }
  }
  if (typeof branding?.brandBackgroundHue === "number") {
    vars["--neutral-hue"] = String(branding.brandBackgroundHue);
  }
  if (typeof branding?.brandBackgroundStrength === "number" && branding.brandBackgroundStrength > 1) {
    vars["--neutral-sat"] = String(branding.brandBackgroundStrength);
  }
  if (branding?.brandHeadingFont) {
    const font = BRAND_HEADING_FONTS.find((f) => f.id === branding.brandHeadingFont);
    if (font) vars["--font-display"] = font.stack;
  }
  // THE REST OF THE LOOK (shared/brand-extras.ts, 2026-11-19): corners, pill buttons, the body
  // font and the login background photo. Variables like the colors, so every screen that wears
  // the brand -- the app, its pop-ups, the login and the public page -- takes them together.
  const extras = branding?.brandExtras;
  if (extras?.corners) vars["--radius"] = BRAND_CORNERS[extras.corners];
  if (extras?.pillButtons) vars["--button-radius"] = "9999px";
  const bodyFont = BRAND_BODY_FONTS.find((f) => f.id === extras?.bodyFont);
  if (bodyFont) vars["--font-sans"] = bodyFont.stack;
  if (extras?.backgroundImageUrl) {
    // Darkened so the cards and text on top of it keep their contrast.
    vars["--brand-photo"] =
      `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.8)), url("${resolveApiUrl(extras.backgroundImageUrl)}")`;
  }
  if (personal?.accentColor) {
    const hsl = hexToHslTriplet(personal.accentColor);
    if (hsl) {
      Object.assign(vars, brandColorVars(personal.accentColor, "primary"));
      vars["--ring"] = hsl;
      vars["--accent"] = hsl;
      vars["--rim"] = hsl;
      vars["--glow"] = hsl;
      vars["--glow-alpha"] = "0.22";
    }
  }
  if (personal?.secondaryColor) {
    const hsl = hexToHslTriplet(personal.secondaryColor);
    if (hsl) {
      Object.assign(vars, brandColorVars(personal.secondaryColor, "secondary"));
      vars["--chart-2"] = hsl;
    }
  }
  if (typeof personal?.backgroundHue === "number") {
    vars["--neutral-hue"] = String(personal.backgroundHue);
  }
  return Object.keys(vars).length > 0 ? (vars as React.CSSProperties) : undefined;
}

/** Loads the Google Fonts stylesheet a brand heading font needs, once, and only for a face the
 *  app does not already carry. Call it from wherever a branding record is applied. */
export function ensureBrandFontLoaded(fontId: string | null | undefined): void {
  if (!fontId || typeof document === "undefined") return;
  const font = [...BRAND_HEADING_FONTS, ...BRAND_BODY_FONTS].find((f) => f.id === fontId);
  if (!font?.googleFontsUrl) return;
  const id = `brand-font-${font.id}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = font.googleFontsUrl;
  document.head.appendChild(link);
}
