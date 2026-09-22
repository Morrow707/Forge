import { describe, expect, it, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isMfaEnforcementDisabled } from "./device-trust-policy";

const auth = readFileSync(join(__dirname, "auth.ts"), "utf8");

/**
 * An operator kill switch for the authenticator step, the same shape as
 * DEVICE_VERIFICATION_DISABLED. Added 2026-09-22 for beta, where a TestFlight account is
 * reinstalled several times a day and meets the code on every one.
 */
describe("the MFA enforcement kill switch", () => {
  const original = process.env.MFA_ENFORCEMENT_DISABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.MFA_ENFORCEMENT_DISABLED;
    else process.env.MFA_ENFORCEMENT_DISABLED = original;
  });

  it("is off unless explicitly set", () => {
    delete process.env.MFA_ENFORCEMENT_DISABLED;
    expect(isMfaEnforcementDisabled()).toBe(false);
  });

  it("takes only the exact string true", () => {
    for (const value of ["", "false", "1", "yes", "TRUE"]) {
      process.env.MFA_ENFORCEMENT_DISABLED = value;
      expect(isMfaEnforcementDisabled()).toBe(false);
    }
    process.env.MFA_ENFORCEMENT_DISABLED = "true";
    expect(isMfaEnforcementDisabled()).toBe(true);
  });

  // Two places demand the code -- straight from the password, and after a device approval.
  // A switch wired to one of them is a switch that does not work, and the account it fails
  // on is whichever path that login happened to take.
  it("covers EVERY place the code is demanded", () => {
    const demands = auth.split("\n").filter((l) => l.includes("mfaRequired: true"));
    expect(demands).toHaveLength(2);
    const guarded = auth
      .split("\n")
      .filter((l) => l.includes("user.mfaEnabled") && l.includes("isMfaEnforcementDisabled()"));
    expect(guarded).toHaveLength(2);
  });

  // Turning the demand off must not clear anybody's secret: the switch has to be reversible
  // with the authenticator that is already paired, or "back on after beta" means re-enrolling
  // every account, which nobody will do.
  it("changes no data -- the enrolment routes are untouched", () => {
    expect(auth).toContain('app.post("/api/auth/mfa/setup"');
    expect(auth).toContain('app.post("/api/auth/mfa/confirm"');
    const setupBlock = auth.slice(auth.indexOf('app.post("/api/auth/mfa/setup"'));
    expect(setupBlock.slice(0, 600)).not.toContain("isMfaEnforcementDisabled");
  });
});
