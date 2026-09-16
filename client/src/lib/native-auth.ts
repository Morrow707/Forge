import { Capacitor, registerPlugin } from "@capacitor/core";

/** Outcome of the native login screen. Mirrors NativeLoginViewController.Outcome. */
export type NativeLoginOutcome =
  | { action: "signIn"; username: string; password: string }
  | { action: "navigate"; path: string }
  | { action: "dismissed" };

interface PasswordPickerPlugin {
  presentNativeLogin(options: { prefillUsername?: string }): Promise<NativeLoginOutcome>;
}

const PasswordPicker = registerPlugin<PasswordPickerPlugin>("PasswordPicker");

/** Whether the native login screen exists on this platform.
 *
 * iOS only, and deliberately not "native" in general: Android's autofill works against the
 * webview form already, so there is nothing for a second screen to fix there. Exported so the
 * login page can decide what to render BEFORE the plugin call resolves -- drawing the web form
 * first and then covering it is what made the last attempt look like a bug.
 */
export function isNativeLoginAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

/** Forge's login screen, drawn in native code, on iOS.
 *
 * WHY IT IS DRAWN TWICE, which is a real cost and worth being honest about. iOS decides which
 * saved password to offer by the PAGE ORIGIN. This bundle is served from capacitor://localhost
 * -- WKWebView reserves http and https, so a Capacitor app cannot serve its own files under
 * forge-ebhd.onrender.com, which is where Apple Passwords holds the credential. The two never
 * meet, so the web form is never filled and never offered a save, however it is marked up; its
 * autocomplete attributes were already correct.
 *
 * A native UITextField is matched differently: the Associated Domains entitlement ties the APP
 * to that domain, so textContentType .username/.password resolve to the right credential. Those
 * two lines are the entire reason the Swift screen exists; everything else in it is matching
 * client/src/pages/login.tsx token for token, from the same stylesheet values and the same
 * icon-192.png, so the athlete sees the login screen they already know.
 *
 * IT AUTHENTICATES NOTHING. It hands credentials back here and the caller runs the same
 * loginMutation the web form runs. One auth path, not two.
 *
 * Resolves null on web, on any other platform, and on any native failure -- all of which mean
 * the same thing to the caller: render the web form, which still logs in fine.
 */
export async function presentNativeLogin(
  prefillUsername?: string,
): Promise<NativeLoginOutcome | null> {
  if (!isNativeLoginAvailable()) return null;
  try {
    return await PasswordPicker.presentNativeLogin({ prefillUsername });
  } catch {
    return null;
  }
}
