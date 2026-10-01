import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { under13SelfSignupClosed, UNDER_13_SIGNUP_CLOSED_MESSAGE } from "./age-policy";

describe("the under-13 self-signup switch", () => {
  it("is open unless the variable is exactly false", () => {
    expect(under13SelfSignupClosed({})).toBe(false);
    expect(under13SelfSignupClosed({ ACCEPT_UNDER_13_SIGNUPS: "true" })).toBe(false);
    expect(under13SelfSignupClosed({ ACCEPT_UNDER_13_SIGNUPS: "" })).toBe(false);
    expect(under13SelfSignupClosed({ ACCEPT_UNDER_13_SIGNUPS: "false" })).toBe(true);
    expect(under13SelfSignupClosed({ ACCEPT_UNDER_13_SIGNUPS: " FALSE " })).toBe(true);
  });

  it("the signup route reads it after the tier is derived and before the account is created", () => {
    const auth = readFileSync("server/auth.ts", "utf8");
    const tierAt = auth.indexOf("const tier = derivePrivacyTier(dateOfBirth);");
    const gateAt = auth.indexOf("under13SelfSignupClosed()");
    const createAt = auth.indexOf("storage.createUser(", tierAt);
    expect(tierAt).toBeGreaterThan(0);
    expect(gateAt).toBeGreaterThan(tierAt);
    expect(gateAt).toBeLessThan(createAt);
    expect(auth).toContain("UNDER_13_SIGNUP_CLOSED_MESSAGE");
  });

  it("the message never tells a child to go around the switch", () => {
    expect(UNDER_13_SIGNUP_CLOSED_MESSAGE).not.toMatch(/birth ?date|different (date|age)/i);
  });
});
