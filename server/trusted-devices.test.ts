import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  normalizeDeviceId,
  approvalState,
  isDeviceVerificationExempt,
  isDeviceVerificationDisabled,
  hashDeviceId,
  TRUSTED_DEVICE_TTL_MS,
  DEMO_ACCOUNT_EMAILS,
} from "./device-trust-policy";
import { NOINDEX_PREFIXES } from "@shared/public-routes";

/** The parts of new-device approval that need no database, plus three source scans for the
 * ordering and the email shape that the integration test cannot see. */
describe("device ids", () => {
  it("accepts a plausible id and rejects nothing, junk, and the oversized", () => {
    expect(normalizeDeviceId("abcdef12-3456")).toBe("abcdef12-3456");
    expect(normalizeDeviceId("  padded-id-here  ")).toBe("padded-id-here");
    expect(normalizeDeviceId(undefined)).toBeNull();
    expect(normalizeDeviceId(42)).toBeNull();
    expect(normalizeDeviceId("short")).toBeNull();
    expect(normalizeDeviceId("x".repeat(129))).toBeNull();
  });

  it("hashes are stable, distinct, and never the id itself", () => {
    const h = hashDeviceId("device-one-1234");
    expect(h).toBe(hashDeviceId("device-one-1234"));
    expect(h).not.toBe(hashDeviceId("device-two-1234"));
    expect(h).not.toContain("device-one");
  });

  it("trust lasts thirty days from the last sign-in", () => {
    expect(TRUSTED_DEVICE_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("approval state", () => {
  const base = { status: "pending", expiresAt: new Date(Date.now() + 60_000) } as any;
  it("is what the row says, except that a passed expiry makes a pending row expired", () => {
    expect(approvalState(base)).toBe("pending");
    expect(approvalState({ ...base, status: "approved" })).toBe("approved");
    expect(approvalState({ ...base, status: "denied" })).toBe("denied");
    expect(approvalState({ ...base, expiresAt: new Date(Date.now() - 1) })).toBe("expired");
    // A decision made in time stays made after the deadline.
    expect(approvalState({ ...base, status: "approved", expiresAt: new Date(Date.now() - 1) })).toBe("approved");
  });
});

describe("standing down", () => {
  const saved = { exempt: process.env.DEVICE_VERIFICATION_EXEMPT_EMAILS, off: process.env.DEVICE_VERIFICATION_DISABLED };
  afterEach(() => {
    process.env.DEVICE_VERIFICATION_EXEMPT_EMAILS = saved.exempt;
    process.env.DEVICE_VERIFICATION_DISABLED = saved.off;
    if (saved.exempt === undefined) delete process.env.DEVICE_VERIFICATION_EXEMPT_EMAILS;
    if (saved.off === undefined) delete process.env.DEVICE_VERIFICATION_DISABLED;
  });

  it("exemption is by exact address, case-insensitive, comma-separated", () => {
    process.env.DEVICE_VERIFICATION_EXEMPT_EMAILS = "Review@Forge.app , demo@forge.app";
    expect(isDeviceVerificationExempt("review@forge.app")).toBe(true);
    expect(isDeviceVerificationExempt("demo@forge.app")).toBe(true);
    // A seeded demo account is exempt with or without the variable, so it is no longer the
    // example of "not on the list" -- see the demo-account block at the end of this file.
    expect(isDeviceVerificationExempt("someone@else.test")).toBe(false);
    delete process.env.DEVICE_VERIFICATION_EXEMPT_EMAILS;
    expect(isDeviceVerificationExempt("review@forge.app")).toBe(false);
  });

  it("the kill switch is the literal string true and nothing else", () => {
    process.env.DEVICE_VERIFICATION_DISABLED = "true";
    expect(isDeviceVerificationDisabled()).toBe(true);
    process.env.DEVICE_VERIFICATION_DISABLED = "1";
    expect(isDeviceVerificationDisabled()).toBe(false);
  });
});

describe("the shape the code has to keep", () => {
  const auth = readFileSync(new URL("./auth.ts", import.meta.url), "utf8");

  it("the login route asks about the device BEFORE it asks for the authenticator code", () => {
    const login = auth.slice(auth.indexOf('app.post("/api/auth/login"'));
    const gate = login.indexOf("await deviceGate(req, user)");
    const mfa = login.indexOf("signMfaPendingToken(user.id)");
    expect(gate).toBeGreaterThan(-1);
    expect(mfa).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(mfa);
  });

  it("the approval email carries one review link and no approve-or-deny links", () => {
    const email = readFileSync(new URL("./device-approval-email.ts", import.meta.url), "utf8");
    // A mail scanner fetches every link. A link that decided would let it decide.
    expect(email).not.toMatch(/decision=|\/approve\b|\/deny\b/);
    expect((email.match(/href=/g) ?? []).length).toBe(1);
  });

  it("the review page is never indexed", () => {
    expect(NOINDEX_PREFIXES).toContain("/device-approval");
  });

  it("only a POST decides -- the GET review route reads and the decide route is a POST", () => {
    expect(auth).toMatch(/app\.get\("\/api\/auth\/device-approval\/review"/);
    expect(auth).toMatch(/app\.post\("\/api\/auth\/device-approval\/decide"/);
    expect(auth).not.toMatch(/app\.get\("\/api\/auth\/device-approval\/decide"/);
  });
});

/**
 * The three seeded demo accounts have addresses nothing delivers to, so the new-device email is
 * a door with no key for them. This was an env var and one unset variable locked out App Review.
 */
describe("the demo accounts never meet the new-device email", () => {
  const saved = process.env.DEVICE_VERIFICATION_EXEMPT_EMAILS;
  afterEach(() => {
    if (saved === undefined) delete process.env.DEVICE_VERIFICATION_EXEMPT_EMAILS;
    else process.env.DEVICE_VERIFICATION_EXEMPT_EMAILS = saved;
  });

  it("exempts all three with no environment variable set at all", () => {
    delete process.env.DEVICE_VERIFICATION_EXEMPT_EMAILS;
    for (const email of ["coach@forge.app", "athlete@forge.app", "freeagent@forge.app"]) {
      expect(isDeviceVerificationExempt(email)).toBe(true);
    }
  });

  it("matches the addresses the seed actually creates", () => {
    // If the seed renames an account, the exemption has to move with it -- a stale literal here
    // would read as covered while locking the real account out.
    const seed = readFileSync(resolve(__dirname, "seed.ts"), "utf-8");
    for (const email of DEMO_ACCOUNT_EMAILS) {
      expect(seed).toContain(`"${email}"`);
    }
  });

  it("is exact-match, so no real account falls into it", () => {
    expect(isDeviceVerificationExempt("coach@forge.app.attacker.test")).toBe(false);
    expect(isDeviceVerificationExempt("notcoach@forge.app")).toBe(false);
    expect(isDeviceVerificationExempt("scott.morrow@live.com")).toBe(false);
  });

  it("still adds whatever the environment variable lists", () => {
    process.env.DEVICE_VERIFICATION_EXEMPT_EMAILS = "review@apple.test";
    expect(isDeviceVerificationExempt("review@apple.test")).toBe(true);
    expect(isDeviceVerificationExempt("coach@forge.app")).toBe(true);
  });
});
