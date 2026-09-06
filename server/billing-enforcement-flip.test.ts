import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Turning BILLING_ENFORCEMENT_ENABLED on is a single switch that arms
// paywalls AND video trimming across the whole platform at once. What keeps
// that from deleting real footage the moment it flips is one per-account
// boolean that defaults to on, and nothing pinned it. These do.
//
// The flag is read at module load, so each case imports a fresh copy.

async function billingWithEnforcement(enabled: boolean) {
  vi.resetModules();
  vi.stubEnv("BILLING_ENFORCEMENT_ENABLED", enabled ? "true" : "false");
  // billing.ts pulls in storage.ts, which builds a pool at import time. No
  // query is made here -- this just has to be a parseable URL so the module
  // graph loads in a suite that deliberately has no database.
  vi.stubEnv("DATABASE_URL", process.env.DATABASE_URL ?? "postgresql://unused@localhost:1/unused");
  return import("./billing");
}

const beta = { isBetaAccount: true, trialExpiresAt: null };
const paying = { isBetaAccount: false, trialExpiresAt: null };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("flipping enforcement on restricts nobody who is still a beta account", () => {
  it("leaves organisation entitlements unlimited", async () => {
    const { getEntitlements } = await billingWithEnforcement(true);
    expect(getEntitlements({ ...beta, billingTier: null, billingAddOns: [] } as any)).toMatchObject({
      athleteCap: null,
      hasCustomColors: true,
      hasMultiTeam: true,
    });
  });

  it("leaves the free agent AI coach unlimited", async () => {
    const { getFreeAgentEntitlements } = await billingWithEnforcement(true);
    expect(getFreeAgentEntitlements({ ...beta, freeAgentTier: null } as any)).toEqual({
      hasAiChat: true,
      hasVideoFormCheck: true,
    });
  });

  it("leaves video retention unlimited, so nothing starts being trimmed", async () => {
    // The one with irreversible consequences: a cap here makes the nightly
    // sweep start deleting an athlete's saved videos.
    const { getVideoRetentionLimits } = await billingWithEnforcement(true);
    const limits = getVideoRetentionLimits({ ...beta, hasVideoStorageAddOn: false });
    expect(limits).toEqual((await billingWithEnforcement(false)).getVideoRetentionLimits({
      ...paying,
      hasVideoStorageAddOn: false,
    }));
  });
});

describe("the flag is not inert -- a non-beta account really is restricted", () => {
  it("caps a paying account with no tier once enforcement is on", async () => {
    // Without this, the assertions above would pass even if the flag did
    // nothing at all.
    const { getEntitlements } = await billingWithEnforcement(true);
    expect(getEntitlements({ ...paying, billingTier: null, billingAddOns: [] } as any)).toMatchObject({
      athleteCap: 0,
      hasCustomColors: false,
    });
  });

  it("caps video retention for a non-beta account with no add-on", async () => {
    const { getVideoRetentionLimits } = await billingWithEnforcement(true);
    const limits = getVideoRetentionLimits({ ...paying, hasVideoStorageAddOn: false });
    expect(Number.isFinite(limits.totalCap)).toBe(true);
  });

  it("still exempts an active trial", async () => {
    const { getVideoRetentionLimits } = await billingWithEnforcement(true);
    const limits = getVideoRetentionLimits({
      isBetaAccount: false,
      trialExpiresAt: new Date(Date.now() + 60_000),
      hasVideoStorageAddOn: false,
    });
    // Unlimited is Infinity in this module, not null.
    expect(limits.totalCap).toBe(Infinity);
  });
});

describe("the default that makes the flip safe", () => {
  it("declares is_beta_account as NOT NULL DEFAULT true", () => {
    const schema = readFileSync(join(__dirname, "..", "shared", "schema.ts"), "utf8");
    expect(schema).toContain('isBetaAccount: boolean("is_beta_account").notNull().default(true)');
  });

  it("builds the column with that default in the migration too", () => {
    // A default declared only in the ORM is not what an existing database
    // gets -- see check-schema-drift.ts on why those two drift.
    const reconcile = readFileSync(join(__dirname, "reconcile-schema.ts"), "utf8");
    expect(reconcile).toMatch(/"is_beta_account" boolean NOT NULL DEFAULT true/);
  });
});
