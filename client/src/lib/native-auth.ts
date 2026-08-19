import { Capacitor, registerPlugin } from "@capacitor/core";
import { PasswordAutofill } from "@capawesome/capacitor-password-autofill";

interface PasswordPickerPlugin {
  requestSavedPassword(): Promise<{ username: string; password: string }>;
}

const PasswordPicker = registerPlugin<PasswordPickerPlugin>("PasswordPicker");

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
 * caller that doesn't expect it).
 *
 * Rejects (rather than silently swallowing) a failure -- this has been
 * reported as still not saving on-device after the Associated Domains
 * entitlement/AASA setup that should make SecAddSharedWebCredential work,
 * and a bare .catch(() => {}) here was making that undiagnosable: iOS never
 * shows anything for this failing (there's no visible "couldn't save"
 * moment the way there is for a network error), so the caller surfacing
 * this (see use-auth.tsx) is the only way to actually see what
 * SecAddSharedWebCredential is rejecting with. Otherwise still best-effort:
 * never blocks or retries around the login flow that already succeeded
 * before this runs, just reports.
 */
export async function savePasswordToKeychain(username: string, password: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await PasswordAutofill.savePassword({ domain: CREDENTIAL_DOMAIN, username, password });
}

/**
 * Proactively surfaces the iOS "Choose a saved password to use" sheet on
 * login-page mount, reading from the same iCloud Keychain shared-web-
 * credentials store savePasswordToKeychain above already writes into.
 *
 * This exists because that store turned out to genuinely work (confirmed via
 * the debug console: savePasswordToKeychain() resolves, and the credentials
 * really do show up under iOS's "Passwords" source) -- the actual gap was
 * that nothing ever surfaces them without the athlete knowing to tap the key
 * icon above the keyboard first. WKWebView's implicit "just appears already
 * filled in" AutoFill matching keys off the page's real origin, which a
 * bundled capacitor://localhost page never has -- Shared Web Credentials
 * (ASAuthorizationPasswordProvider, see PasswordPickerPlugin.swift) is
 * Apple's own workaround for exactly that gap, meant to be triggered
 * explicitly by the app rather than relying on implicit field-focus autofill.
 *
 * Resolves null (never rejects) on cancel, no saved credential, or any other
 * native failure -- all three should look identical to the login page: just
 * fall back to the athlete typing their own credentials normally, with
 * nothing surfaced as an error for what's a completely ordinary outcome.
 */
export async function requestSavedPassword(): Promise<{ username: string; password: string } | null> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return null;
  try {
    return await PasswordPicker.requestSavedPassword();
  } catch {
    return null;
  }
}
