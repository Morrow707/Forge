import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { users } from "@shared/schema";
import { resetDatabase } from "./test-support/fixtures";
import { derivePrivacyTier } from "@shared/privacy-tiers";

// The end-to-end version of the bug: what the coaching AI is actually told
// about a real athlete row shaped the way signup shapes it.
function isoYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

async function athlete(overrides: Partial<typeof users.$inferInsert>) {
  const [row] = await db
    .insert(users)
    .values({
      email: `a-${Math.random().toString(36).slice(2)}@example.test`,
      passwordHash: "x",
      name: "Test Athlete",
      role: "athlete",
      ...overrides,
    })
    .returning();
  return row;
}

describe("what the coaching AI is told about an athlete's age", () => {
  beforeEach(resetDatabase);

  it("names a minor as a minor, from a row shaped the way signup shapes it", async () => {
    // Signup requires a date of birth and never writes users.age. That is the
    // whole bug: the platform tiered this athlete as a minor and told the
    // programming AI "Age: not set".
    const kid = await athlete({ dateOfBirth: isoYearsAgo(14) });
    expect(kid.age).toBeNull();
    expect(derivePrivacyTier(kid.dateOfBirth!)).toBe("tier2_teen_13_17");

    const context = await storage.getAthleteAiContext(kid.id);
    expect(context).toContain("- Age: 14");
    expect(context).toContain("MINOR");
    expect(context).not.toContain("Age: not set");
  });

  it("says nothing extra for an adult", async () => {
    const grown = await athlete({ dateOfBirth: isoYearsAgo(28) });
    const context = await storage.getAthleteAiContext(grown.id);
    expect(context).toContain("- Age: 28");
    expect(context).not.toContain("MINOR");
  });

  it("ignores a stale self-reported age in favour of the birthdate", async () => {
    // A profile edit can set users.age to anything, and it does not age.
    const kid = await athlete({ dateOfBirth: isoYearsAgo(15), age: 30 });
    const context = await storage.getAthleteAiContext(kid.id);
    expect(context).toContain("- Age: 15");
    expect(context).toContain("MINOR");
  });

  it("still uses the snapshot for an account with no birthdate", async () => {
    // Accounts predating the column. Better than nothing, and labelled.
    const legacy = await athlete({ dateOfBirth: null, age: 17 });
    const context = await storage.getAthleteAiContext(legacy.id);
    expect(context).toContain("17");
    expect(context).toContain("self-reported");
  });

  it("admits it does not know rather than implying an adult", async () => {
    const unknown = await athlete({ dateOfBirth: null });
    expect(await storage.getAthleteAiContext(unknown.id)).toContain("- Age: not set");
  });
});
