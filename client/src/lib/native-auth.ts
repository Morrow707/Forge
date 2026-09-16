import { Capacitor, registerPlugin } from "@capacitor/core";

interface PasswordPickerPlugin {
  requestSavedPassword(): Promise<{ username: string; password: string }>;
  savePassword(options: {
    domain: string;
    username: string;
    password: string;
  }): Promise<void>;
  presentNativeLogin(options: {
    prefillUsername?: string;
  }): Promise<{ username: string; password: string }>;
}

const PasswordPicker = registerPlugin<PasswordPickerPlugin>("PasswordPicker");

// The domain declared in ios/App/App/App.entitlements' webcredentials
// entry and served from /.well-known/apple-app-site-association (see
// routes.ts) -- savePassword's domain option must match that entry exactly.
const CREDENTIAL_DOMAIN = "forge-ebhd.onrender.com";

/** REMOVED, and deliberately left as a no-op rather than deleted outright.
 *
 * This used to call SecAddSharedWebCredential through a Capacitor plugin. Build 415 settled what
 * that actually does on current iOS: it resolves with no error and saves nothing. The on-device
 * log read `savePasswordToKeychain() resolved`, and twenty-one seconds later iOS's own picker
 * said "You don't have any passwords saved for this app". The API was deprecated in iOS 14 and
 * its behaviour has since been removed; it does not prompt, does not store, and does not fail.
 *
 * A function that always reports success while doing nothing is worse than no function: it is
 * what kept this looking like a configuration problem for weeks. Saving is now done the way iOS
 * actually supports -- native text fields, see presentNativeLogin below -- and this stays only so
 * that any caller still invoking it is harmless rather than broken.
 */
export async function savePasswordToKeychain(_username: string, _password: string): Promise<void> {
  return;
}

/** The native sign-in sheet, and the thing that actually makes Apple Passwords work.
 *
 * Two real UITextFields with textContentType .username and .password (see
 * NativeLoginViewController). AutoFill fills them from Apple Passwords on focus, and iOS offers
 * its own "Save Password?" prompt when the sheet is dismissed after signing in. Both halves are
 * the OS's; nothing writes to the keychain, because an app is not meant to.
 *
 * The web form cannot do this however it is marked up. AutoFill matches on page ORIGIN, and this
 * bundle is served from capacitor://localhost, which matches nothing saved for
 * forge-ebhd.onrender.com. The Associated Domains entitlement ties the APP to that domain, so a
 * native field inside it resolves to the right credential where a webview field cannot.
 *
 * Resolves null on cancel, on a swipe-away, on web, and on any native failure. All of those mean
 * the same thing to the login page -- fall back to the form, which still logs in perfectly well,
 * it just cannot offer to save.
 */
export async function presentNativeLogin(
  prefillUsername?: string,
): Promise<{ username: string; password: string } | null> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return null;
  try {
    return await PasswordPicker.presentNativeLogin({ prefillUsername });
  } catch {
    return null;
  }
}

export async function requestSavedPassword(): Promise<{ username: string; password: string } | null> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return null;
  try {
    return await PasswordPicker.requestSavedPassword();
  } catch {
    return null;
  }
}
