import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const nativeAuth = read("client/src/lib/native-auth.ts");
const plugin = read("ios/App/App/PasswordPickerPlugin.swift");

/** The save into iCloud Keychain has been failing on-device with nothing to go on. These pin the
 * two things that made it undiagnosable, so a future edit cannot quietly undo either. */
describe("saving a credential to Apple Passwords", () => {
  it("uses our own plugin, so a failure reports its error code", () => {
    // @capawesome/capacitor-password-autofill surfaced only localizedDescription, which for a
    // Security-framework OSStatus is "The operation couldn't be completed." -- the same string
    // for a declined prompt, a failed associated-domain check and nothing-saved-yet.
    expect(nativeAuth).not.toContain("@capawesome/capacitor-password-autofill");
    expect(nativeAuth).toMatch(/PasswordPicker\.savePassword/);
    expect(plugin).toMatch(/ns\.domain/);
    expect(plugin).toMatch(/ns\.code/);
  });

  it("saves and reads through the same API family", () => {
    // Both halves stay on SecAdd/SecRequestSharedWebCredential. The plugin's own comment records
    // why: ASAuthorizationPasswordProvider was tried and could not find credentials that
    // SecRequestSharedWebCredential finds.
    expect(plugin).toContain("SecAddSharedWebCredential");
    expect(plugin).toContain("SecRequestSharedWebCredential");
  });

  it("does not ask for the system prompt mid-navigation", () => {
    // SecAddSharedWebCredential presents a system alert. It was fired the instant login resolved,
    // while the login screen was being torn down -- which is when iOS declines to present one.
    expect(nativeAuth).toMatch(/requestAnimationFrame/);
    expect(plugin).toMatch(/UIApplication\.shared\.applicationState == \.active/);
  });

  it("distinguishes 'app wasn't active' from a keychain refusal", () => {
    // The two want opposite fixes and used to read identically.
    expect(plugin).toMatch(/App wasn't active/);
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
