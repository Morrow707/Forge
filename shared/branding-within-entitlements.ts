/** WHAT A PROGRAM'S SAVED LOOK MAY SHOW, GIVEN WHAT THE PROGRAM HAS RIGHT NOW.
 *
 * Added 2026-11-18. Full Personalization was enforced only when a coach SAVED: the branding
 * PATCH drops the gated fields for a program without it. Everything that READ the look served
 * whatever was stored -- the athletes' app, every branded email, a guardian's dashboard, the
 * signup screen reached by a coach's code -- so a program that had it once (a cancelled add-on,
 * a roster that moved down a band, a trial that ended) kept its motto, second color, font, nav
 * renames and exercise-screen colors forever. Only the public /team/<slug> page asked.
 *
 * Nothing stored is cleared: a program that gets it back sees its look come back unchanged.
 *
 * Free on every plan, never touched here: the team name, the logo and the primary color. */

import { brandExtrasWithinEntitlements, type BrandExtras } from "./brand-extras";

export type BrandingEntitlements = {
  hasCustomColors: boolean;
  hasTeamIdentity: boolean;
  hasWorkflowCustomization: boolean;
  hasPersonalPage: boolean;
};

/** Each gated field, by the entitlement that unlocks it. Read off the branding PATCH's own
 * drop list, so the write and the read agree. */
export const GATED_BRANDING_FIELDS = {
  hasCustomColors: ["brandSecondaryColor", "brandBackgroundHue", "brandBackgroundStrength", "brandHeadingFont"],
  hasTeamIdentity: [
    "brandMotto",
    "brandMission",
    "brandContactEmail",
    "brandWelcomeMessage",
    "brandSlug",
    "brandSenderName",
  ],
} as const;

export function brandingWithinEntitlements<T extends Record<string, unknown>>(
  branding: T,
  ent: BrandingEntitlements,
): T {
  const out: Record<string, unknown> = { ...branding };
  (Object.keys(GATED_BRANDING_FIELDS) as (keyof typeof GATED_BRANDING_FIELDS)[])
    .filter((key) => !ent[key])
    .flatMap((key) => [...GATED_BRANDING_FIELDS[key]])
    .filter((field) => field in out)
    .forEach((field) => {
      out[field] = null;
    });
  if (!ent.hasWorkflowCustomization && "navLabelOverrides" in out) out.navLabelOverrides = {};
  if (!ent.hasPersonalPage && "exercisePageTheme" in out) out.exercisePageTheme = null;
  // The newer options, each under the entitlement it belongs to (shared/brand-extras.ts).
  if ("brandExtras" in out) out.brandExtras = brandExtrasWithinEntitlements(out.brandExtras as BrandExtras | null, ent);
  return out as T;
}
