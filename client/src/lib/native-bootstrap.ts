import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";

/**
 * Native-only startup: matches the status bar to the app's own dark theme
 * (see vite.config.ts's manifest.theme_color/background_color -- same
 * brand colors, just applied to the native chrome instead of a web
 * manifest) and dismisses the launch splash once React has actually
 * mounted, rather than on Capacitor's own default timer, so a slow cold
 * start never flashes an empty dark screen before the app is ready. No-op
 * entirely on web, where none of these plugins exist.
 */
export async function bootstrapNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0B0B0F" });
  } catch {
    // Best-effort -- a status bar that stays whatever the OS default is
    // isn't worth blocking app startup over.
  }
  try {
    await SplashScreen.hide();
  } catch {
    // Same best-effort reasoning -- worst case the splash stays up until
    // its own configured autoHide timeout.
  }
}
