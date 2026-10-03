import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { getJson } from "@/lib/queryClient";
import type { EffectiveBranding } from "@/lib/branding-style";

/** THE LOGIN SCREEN WEARS THE LAST PROGRAM THIS DEVICE SIGNED INTO.
 *
 * Nobody is signed in on the login, forgot-password and holding screens, so the server cannot
 * say whose colors to draw. Two answers, in order: a team address in the URL (/login?team=cal,
 * the link a coach sends), else what this device remembered from its last signed-in session.
 * AppShell writes the memory whenever a signed-in user's branding carries a logo or a name,
 * and clears it when a signed-in user has none, so a Free Agent's phone goes back to Forge.
 *
 * Scott, 2026-10-03: the login screen, "the logo throughout the app", with "powered by forge
 * water marked everywhere". localStorage only; a private window simply shows Forge. */
const KEY = "forge:remembered-brand";

export type RememberedBrand = Pick<
  EffectiveBranding,
  | "brandTeamName"
  | "brandLogoUrl"
  | "brandPrimaryColor"
  | "brandSecondaryColor"
  | "brandBackgroundHue"
  | "brandBackgroundStrength"
  | "brandHeadingFont"
> & { slug?: string | null };

export function readRememberedBrand(): RememberedBrand | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RememberedBrand) : null;
  } catch {
    return null;
  }
}

export function rememberBrand(branding: EffectiveBranding | null | undefined): void {
  try {
    if (!branding || (!branding.brandLogoUrl && !branding.brandTeamName)) {
      localStorage.removeItem(KEY);
      return;
    }
    const snapshot: RememberedBrand = {
      brandTeamName: branding.brandTeamName ?? null,
      brandLogoUrl: branding.brandLogoUrl ?? null,
      brandPrimaryColor: branding.brandPrimaryColor ?? null,
      brandSecondaryColor: branding.brandSecondaryColor ?? null,
      brandBackgroundHue: branding.brandBackgroundHue ?? null,
      brandBackgroundStrength: branding.brandBackgroundStrength ?? null,
      brandHeadingFont: branding.brandHeadingFont ?? null,
      slug: branding.brandSlug ?? null,
    };
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Storage blocked or full: the screen draws Forge, which is always correct.
  }
}

/** The brand a pre-login screen should wear: the URL's team first, the device's memory second. */
export function useRememberedBrand(): RememberedBrand | null {
  const search = useSearch();
  const team = new URLSearchParams(search).get("team")?.trim() ?? "";
  const [brand, setBrand] = useState<RememberedBrand | null>(() => readRememberedBrand());
  useEffect(() => {
    if (!team) return;
    let cancelled = false;
    (getJson(`/api/public/branding?code=${encodeURIComponent(team)}`) as Promise<EffectiveBranding | null>)
      .then((b) => {
        if (cancelled || !b) return;
        rememberBrand(b);
        setBrand(readRememberedBrand());
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [team]);
  return brand;
}
