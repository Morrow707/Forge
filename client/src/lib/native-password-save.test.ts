import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const nativeAuth = read("client/src/lib/native-auth.ts");
const plugin = read("ios/App/App/PasswordPickerPlugin.swift");

/** The save into iCloud Keychain has been failing on-device with nothing to go on. These pin the
 * two things that made it undiagnosable, so a future edit cannot quietly undo either. */
describe("saving a credential to Apple Passwords", () => {
  it("no longer relies on the API that silently does nothing", () => {
    // Build 415, on device: savePasswordToKeychain() resolved with no error, and iOS's own picker
    // said "You don't have any passwords saved for this app" moments later.
    // SecAddSharedWebCredential is a no-op on current iOS -- it does not prompt, store or fail.
    // The helper stays as a harmless no-op so any remaining caller is not broken, but nothing may
    // depend on it working.
    expect(nativeAuth).toMatch(/export async function savePasswordToKeychain[\s\S]{0,200}return;/);
    expect(nativeAuth).not.toMatch(/PasswordPicker\.savePassword\(/);
  });

  it("presents native text fields, which is what AutoFill actually keys off", () => {
    // .username and .password on real UITextFields are the requirement. Without them iOS does not
    // recognise a sign-in form, fills nothing, and never offers to save.
    expect(plugin).toMatch(/usernameField\.textContentType = \.username/);
    expect(plugin).toMatch(/passwordField\.textContentType = \.password/);
    expect(nativeAuth).toMatch(/PasswordPicker\.presentNativeLogin/);
  });

  it("dismisses the sheet after signing in, which is what triggers the save prompt", () => {
    // There is no API to request "Save Password?" -- iOS decides, and dismissal after credentials
    // were entered is the signal it looks for.
    expect(plugin).toMatch(/dismiss\(animated: true\) \{ \[onSubmit\]/);
  });

  it("resolves its plugin call exactly once", () => {
    // The sheet can end by button or by swipe-down, and both land in this controller. Resolving
    // or rejecting a CAPPluginCall twice is a crash.
    expect(plugin).toMatch(/private var finished = false/);
    expect(plugin).toMatch(/guard !finished else \{ return \}/);
  });

  it("collects credentials without authenticating", () => {
    // One auth path. The sheet replaces the keyboard, not the login endpoint.
    const login = read("client/src/pages/login.tsx");
    expect(login).toMatch(/loginMutation\.mutate\(\{ email: credential\.username/);
  });

  it("keeps the declared domain matching the entitlement", () => {
    // savePassword's domain must equal the webcredentials entry exactly, or the association check
    // fails and the save is rejected for a reason that looks like a keychain problem.
    const entitlements = read("ios/App/App/App.entitlements");
    const domain = nativeAuth.match(/CREDENTIAL_DOMAIN = "([^"]+)"/)?.[1];
    expect(domain).toBeTruthy();
    expect(entitlements).toContain(`webcredentials:${domain}`);
  });

  it("serves an AASA naming the same bundle id the app ships under", () => {
    const routes = read("server/routes.ts");
    const bundleId = read("capacitor.config.ts").match(/appId: "([^"]+)"/)?.[1];
    expect(bundleId).toBeTruthy();
    // The AASA entry is "<TEAMID>.<bundle id>"; the bundle half must match what ships.
    expect(routes).toContain(`.${bundleId}"`);
  });
});
