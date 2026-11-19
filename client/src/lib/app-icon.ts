import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BrandAppIconId } from "@shared/brand-extras";

/** The native switch for a program's app icon color (ios/App/App/AppIconPlugin.swift). */
type AppIconPluginApi = {
  getIcon(): Promise<{ supported: boolean; name: string | null }>;
  setIcon(options: { name: string | null }): Promise<{ name: string | null }>;
};
const AppIcon = registerPlugin<AppIconPluginApi>("AppIcon");

/** The asset set an icon id lives in: Forge's own is the primary icon (null). */
export function appIconAssetName(id: BrandAppIconId | null | undefined): string | null {
  return id && id !== "forge" ? `AppIcon-${id}` : null;
}

/** Puts the program's icon on the home screen (2026-11-19). iPhone only, and only when it differs
 *  from the icon in use, because iOS shows its own "You have changed the icon" alert every time.
 *  Never throws: an icon that could not change leaves the app exactly as it was. */
export async function applyProgramAppIcon(id: BrandAppIconId | null | undefined): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;
  try {
    const current = await AppIcon.getIcon();
    if (!current.supported) return;
    const wanted = appIconAssetName(id);
    if ((current.name ?? null) === wanted) return;
    await AppIcon.setIcon({ name: wanted });
  } catch {
    // An older iPhone or an interrupted alert: the icon simply stays as it was.
  }
}
