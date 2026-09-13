import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { users, guardianLinks } from "@shared/schema";
import { makeAthlete, resetDatabase } from "./test-support/fixtures";

// A PARENT WITH TWO CHILDREN ON FORGE.
//
// getAthletesForGuardian's own comment says a guardian "can be linked to more than
// one athlete (siblings on Forge)", and the claim flow could not do it. The claim
// page's "link my existing account" branch was shown only for a role="guardian"
// account, and claimGuardianInvite rejected any existing account without an adult
// date of birth -- while the only place a guardian account is ever created collects
// no date of birth and no client surface offers one. The two sets were disjoint by
// construction: correct password in, "A guardian account must belong to an adult."
// out, with no workaround anywhere in the app.
//
// These run against a real database because the defect was the interaction between
// a preview query, a guard and an insert, not any one of them.

const TERMS = "test terms text";

async function inviteToken(athleteId: number, email: string) {
  const created = await storage.createGuardianInvite(athleteId, email);
  if ("error" in created) throw new Error(created.error);
  return created.token;
}

describe("a guardian can be linked to a second child", () => {
  beforeEach(resetDatabase);

  it("links both siblings to one guardian account", async () => {
    const email = `parent-${Math.random().toString(36).slice(2)}@example.test`;
    const first = await makeAthlete({ name: "First Child" });
    const second = await makeAthlete({ name: "Second Child" });

    const claim = await storage.claimGuardianInvite(
      await inviteToken(first.id, email),
      "correct-horse",
      TERMS,
    );
    expect("user" in claim, JSON.stringify(claim)).toBe(true);
    if (!("user" in claim)) return;
    const guardianId = claim.user.id;

    // The second invite's preview has to offer the "link my existing account"
    // branch, or the parent is told to set a password they already have.
    const token = await inviteToken(second.id, email);
    const preview = await storage.getGuardianInvitePreview(token);
    expect(preview?.accountExists).toBe(true);

    const linked = await storage.claimGuardianInvite(token, "correct-horse", TERMS);
    expect("user" in linked, JSON.stringify(linked)).toBe(true);
    if (!("user" in linked)) return;
    expect(linked.user.id).toBe(guardianId);

    const links = await db.query.guardianLinks.findMany({
      where: eq(guardianLinks.guardianId, guardianId),
    });
    expect(links.map((l) => l.athleteId).sort()).toEqual([first.id, second.id].sort());
  });

  it("still refuses the wrong password on the existing account", async () => {
    const email = `parent-${Math.random().toString(36).slice(2)}@example.test`;
    const first = await makeAthlete();
    const second = await makeAthlete();
    await storage.claimGuardianInvite(await inviteToken(first.id, email), "correct-horse", TERMS);

    const result = await storage.claimGuardianInvite(
      await inviteToken(second.id, email),
      "wrong-password",
      TERMS,
    );
    expect(result).toEqual({ error: "Incorrect password for the existing account." });
  });

  it("still refuses a minor's account as a guardian", async () => {
    const minorEmail = `minor-${Math.random().toString(36).slice(2)}@example.test`;
    const d = new Date();
    d.setFullYear(d.getFullYear() - 15);
    const minor = await makeAthlete({ email: minorEmail, dateOfBirth: d.toISOString().slice(0, 10) });
    const sibling = await makeAthlete();

    const result = await storage.claimGuardianInvite(
      await inviteToken(sibling.id, minorEmail),
      "whatever",
      TERMS,
    );
    expect(result).toEqual({ error: "A guardian account must belong to an adult." });
    expect(
      await db.query.users.findFirst({ where: eq(users.email, minorEmail.toLowerCase()) }),
    ).toBeTruthy();
  });
});
