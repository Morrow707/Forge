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
