import { hexToHslTriplet } from "@/lib/color";

export type EffectiveBranding = {
  brandTeamName?: string | null;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
};

/** Converts an effective branding record into this app's CSS custom-
 * property overrides (see index.css's --primary etc, all raw "H S% L%"
 * triplets, not literal colors). Shared between AppShell (a logged-in
 * user's own re-skin) and the signup page (a pre-login preview from a
 * typed invite code) so the two can't drift on which tokens get
 * overridden or how. Returns undefined when there's nothing to override,
 * so callers can spread it straight into a style prop. */
export function computeBrandingStyle(
  branding: EffectiveBranding | null | undefined,
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
  return Object.keys(vars).length > 0 ? (vars as React.CSSProperties) : undefined;
}
