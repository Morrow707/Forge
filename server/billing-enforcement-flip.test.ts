import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FREE_AGENT_ADD_ON_ORDER } from "@shared/free-agent-tiers";

// Turning BILLING_ENFORCEMENT_ENABLED on is a single switch that arms
// paywalls AND video trimming across the whole platform at once. What keeps
// that from deleting real footage the moment it flips is one per-account
// boolean that defaults to on, and nothing pinned it. These do.
//
// The flag is read at module load, so each case imports a fresh copy.

// Mocked before billing.ts is ever imported -- the same pattern billing.test.ts
// uses and vitest.config.ts documents. It used to stub a parseable DATABASE_URL
// instead and let the real storage.ts load, which worked but cost 3.2 SECONDS on
// the first import: that module's graph is ~25k lines and it was being compiled
// inside a test with vitest's 5s default timeout. Idle, that passed; sharing four
// cores with 130-odd other test files, it did not, which is exactly the shape of
// the flake this file produced -- red under load, green when run alone.
//
// Nothing here touches storage. getEntitlements, getFreeAgentEntitlements and
// getVideoRetentionLimits are pure functions of the account row they are handed;
// the storage calls in billing.ts all live in the Stripe webhook paths, which are
// billing.test.ts's subject, not this file's. So the mock is empty on purpose: if
// one of these functions ever starts reading the database, this throws rather
// than quietly passing against a stub.
vi.mock("./storage", () => ({ storage: {} }));

async function billingWithEnforcement(enabled: boolean) {
  vi.resetModules();
  vi.stubEnv("BILLING_ENFORCEMENT_ENABLED", enabled ? "true" : "false");
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
    // Every flag AND every sport-coach add-on. The add-ons joined this object so
    // one function answers "what may this account do" for all of it -- the Sport
    // Coaches page used to answer the add-on half for itself off isBetaAccount
    // alone, which ignored a live trial and the enforcement flag entirely.
    expect(getFreeAgentEntitlements({ ...beta, freeAgentTier: null } as any)).toEqual({
      hasAiChat: true,
      hasVideoFormCheck: true,
      hasSkills: true,
      // Derived, not restated: beta unlocks EVERY add-on, and a list written out here would
      // have to be edited every time one is added -- which is how a new add-on quietly ships
      // locked. See FREE_AGENT_ADD_ON_ORDER.
      addOns: Object.fromEntries(FREE_AGENT_ADD_ON_ORDER.map((id) => [id, true])),
    });
  });

  it("leaves the Coaches Corner unlocked for a beta coach", async () => {
    // The bug this replaces: hasCoachesCornerAccess never asked isBetaAccount at
    // all, so every coach on Forge -- all of them beta -- was locked out of a
    // product that also had no checkout.
    const { getEntitlements } = await billingWithEnforcement(true);
    expect(
      getEntitlements({ ...beta, billingTier: null, billingAddOns: [] } as any).hasCoachesCorner,
    ).toBe(true);
  });

  it("gives a non-beta account with no add-ons nothing, on either side", async () => {
    const { getEntitlements, getFreeAgentEntitlements } = await billingWithEnforcement(true);
    expect(
      getEntitlements({ ...paying, billingTier: null, billingAddOns: [] } as any).hasCoachesCorner,
    ).toBe(false);
    expect(
      getFreeAgentEntitlements({ ...paying, freeAgentTier: null, freeAgentAddOns: [] } as any).addOns,
    ).toEqual(Object.fromEntries(FREE_AGENT_ADD_ON_ORDER.map((id) => [id, false])));
  });

  it("gives a non-beta account exactly the add-ons it bought", async () => {
    const { getFreeAgentEntitlements } = await billingWithEnforcement(true);
    expect(
      getFreeAgentEntitlements({
        ...paying,
        freeAgentTier: "basic",
        freeAgentAddOns: ["hitting"],
      } as any).addOns,
    ).toEqual(
      Object.fromEntries(FREE_AGENT_ADD_ON_ORDER.map((id) => [id, id === "hitting"])),
    );
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
