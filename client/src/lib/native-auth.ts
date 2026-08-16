import { Capacitor } from "@capacitor/core";
import { PasswordAutofill } from "@capawesome/capacitor-password-autofill";

// The domain declared in ios/App/App/App.entitlements' webcredentials
// entry and served from /.well-known/apple-app-site-association (see
// routes.ts) -- savePassword's domain option must match that entry exactly.
const CREDENTIAL_DOMAIN = "forge-ebhd.onrender.com";

/**
 * Explicitly saves a just-used credential to the platform keychain after a
 * successful login/signup. WKWebView-based apps never trigger iOS's native
 * "Save password?" prompt on their own the way Safari does -- not a bug in
 * this app, a documented WebKit limitation that applies to every
 * Capacitor/Cordova-style app -- so this deterministic call is what stands
 * in for that prompt. No-op on web (the plugin rejects there as
 * unimplemented; native-only gate here avoids that reject reaching a
 * caller that doesn't expect it). Best-effort: the user canceling the OS
 * save-password sheet isn't an error worth surfacing, and neither is a
 * failure here worth blocking or retrying around the login flow that
 * already succeeded before this runs.
 */
export function savePasswordToKeychain(username: string, password: string) {
  if (!Capacitor.isNativePlatform()) return;
  PasswordAutofill.savePassword({ domain: CREDENTIAL_DOMAIN, username, password }).catch(() => {});
}
