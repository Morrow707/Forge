import { hexToHslTriplet } from "@/lib/color";

export type EffectiveBranding = {
  brandTeamName?: string | null;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
  brandMotto?: string | null;
  brandMission?: string | null;
  brandContactEmail?: string | null;
  brandWelcomeMessage?: string | null;
  // Only ever populated for an athlete's own /api/branding/me response --
  // rides along so athlete-facing screens can read a primary-coach-set term
  // (e.g. DAILY_CHECKIN_TERM_KEY in shared/wellness.ts) through this same
  // GET. Read-only from here: nothing PATCHes navLabelOverrides through
  // this route, only /api/coach/nav-prefs (primary-coach-gated) can.
  navLabelOverrides?: Record<string, string>;
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
      vars["--primary"] = hsl;
      vars["--ring"] = hsl;
      vars["--accent"] = hsl;
    }
  }
  if (branding?.brandSecondaryColor) {
    const hsl = hexToHslTriplet(branding.brandSecondaryColor);
    if (hsl) vars["--secondary"] = hsl;
  }
  if (personal?.accentColor) {
    const hsl = hexToHslTriplet(personal.accentColor);
    if (hsl) {
      vars["--primary"] = hsl;
      vars["--ring"] = hsl;
      vars["--accent"] = hsl;
      vars["--rim"] = hsl;
      vars["--glow"] = hsl;
      vars["--glow-alpha"] = "0.22";
    }
  }
  if (personal?.secondaryColor) {
    const hsl = hexToHslTriplet(personal.secondaryColor);
    if (hsl) vars["--secondary"] = hsl;
  }
  if (typeof personal?.backgroundHue === "number") {
    vars["--neutral-hue"] = String(personal.backgroundHue);
  }
  return Object.keys(vars).length > 0 ? (vars as React.CSSProperties) : undefined;
}
