import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { inviteCodeAccepted, publicSignupOpen, signupAllowed, SIGNUP_CLOSED_MESSAGE } from "./signup-availability";

// The site is visible and sign-up is closed to the public (Scott, 2026-10-01). The rule is
// asked by the client to draw "Coming soon" and by the signup route to refuse; the route is the
// gate, the button is presentation.
describe("public sign-up availability", () => {
  it("is open unless the variable is exactly false", () => {
    expect(publicSignupOpen({})).toBe(true);
    expect(publicSignupOpen({ PUBLIC_SIGNUPS_OPEN: "true" })).toBe(true);
    expect(publicSignupOpen({ PUBLIC_SIGNUPS_OPEN: "false" })).toBe(false);
    expect(publicSignupOpen({ PUBLIC_SIGNUPS_OPEN: " FALSE " })).toBe(false);
  });

  it("accepts the invite code case-insensitively and never with none configured", () => {
    const env = { SIGNUP_INVITE_CODE: "Forge-Pilot-2026" };
    expect(inviteCodeAccepted("forge-pilot-2026", env)).toBe(true);
    expect(inviteCodeAccepted("  FORGE-PILOT-2026 ", env)).toBe(true);
    expect(inviteCodeAccepted("forge-pilot", env)).toBe(false);
    expect(inviteCodeAccepted("", env)).toBe(false);
    expect(inviteCodeAccepted(undefined, env)).toBe(false);
    expect(inviteCodeAccepted("", { SIGNUP_INVITE_CODE: "" })).toBe(false);
    expect(inviteCodeAccepted("anything", {})).toBe(false);
  });

  it("closed plus a valid code is allowed; closed without one is not; open needs no code", () => {
    const closed = { PUBLIC_SIGNUPS_OPEN: "false", SIGNUP_INVITE_CODE: "abc" };
    expect(signupAllowed("ABC", closed)).toBe(true);
    expect(signupAllowed("nope", closed)).toBe(false);
    expect(signupAllowed(undefined, closed)).toBe(false);
    expect(signupAllowed(undefined, { PUBLIC_SIGNUPS_OPEN: "true" })).toBe(true);
  });

  it("the signup route refuses before any account is created, and the schema carries the code", () => {
    const auth = readFileSync("server/auth.ts", "utf8");
    const parseAt = auth.indexOf("signupSchema.safeParse(req.body)");
    const gateAt = auth.indexOf("signupAllowed(parsed.data.inviteCode)");
    const createAt = auth.indexOf("storage.createUser(", parseAt);
    expect(gateAt).toBeGreaterThan(parseAt);
    expect(gateAt).toBeLessThan(createAt);
    expect(auth).toContain("SIGNUP_CLOSED_MESSAGE");
    expect(readFileSync("shared/schema.ts", "utf8")).toMatch(/inviteCode: z\.string\(\)\.trim\(\)\.max\(64\)\.optional\(\)/);
    expect(readFileSync("server/routes.ts", "utf8")).toContain('"/api/public/signup-availability"');
    expect(SIGNUP_CLOSED_MESSAGE).toMatch(/invite code/);
  });
});
