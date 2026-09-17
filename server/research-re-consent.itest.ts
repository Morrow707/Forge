import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { db } from "./db";
import { consentRecords, guardianLinks, researchSubjects, users } from "@shared/schema";
import { hashPassword } from "./auth-utils";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";
import { RESEARCH_CONSENT_TEXT, DELETION_RETENTION_HEADING } from "@shared/research-consent";

/**
 * ASKING AGAIN, AFTER THE TERMS CHANGED.
 *
 * Adding a section to the research consent text does not move anybody onto it. Everyone who
 * already said yes agreed to the older, narrower document, and that is the agreement that binds
 * until they answer again -- so until then their account deletion still removes them entirely.
 *
 * The failure this guards against is the quiet one: a consent surface that shows nothing, so
 * nobody is ever asked, the new terms apply to nobody, and the feature they were written for
 * looks shipped while doing nothing at all.
 */
describe("re-consent after the research terms change", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  const OLD_TEXT = RESEARCH_CONSENT_TEXT.split(DELETION_RETENTION_HEADING)[0];

  async function consentedUnderOldTerms(overrides: Record<string, unknown> = {}) {
    const athlete = await makeAthlete({
      dateOfBirth: "2000-01-01",
      sport: "Football",
      passwordHash: await hashPassword("correct horse"),
      ...overrides,
    });
    await storage.setResearchDataConsent({
      athleteId: athlete.id,
      granted: true,
      grantedByUserId: athlete.id,
    });
    // Rewrite the stored record to the document as it read before the new section existed --
    // which is exactly what an athlete who consented last month has.
    await db
      .update(consentRecords)
      .set({ documentText: OLD_TEXT })
      .where(eq(consentRecords.userId, athlete.id));
    return athlete;
  }

  it("tells an athlete on the old terms that something changed", async () => {
    const athlete = await consentedUnderOldTerms();
    const status = await storage.getResearchDataConsent(athlete.id);
    expect(status?.granted).toBe(true);
    expect(status?.staleTerms).toBe(true);
  });

  it("says nothing to somebody already on the current terms", async () => {
    // The nagging case. Somebody who consented today must not be asked again tomorrow.
    const athlete = await makeAthlete({ dateOfBirth: "2000-01-01" });
    await storage.setResearchDataConsent({
      athleteId: athlete.id,
      granted: true,
      grantedByUserId: athlete.id,
    });
    expect((await storage.getResearchDataConsent(athlete.id))?.staleTerms).toBe(false);
  });

  it("says nothing to somebody who is opted out", async () => {
    // They have no agreement to re-confirm. Asking would be pestering somebody for an answer
    // they already gave.
    const athlete = await consentedUnderOldTerms();
    await storage.setResearchDataConsent({
      athleteId: athlete.id,
      granted: false,
      grantedByUserId: athlete.id,
    });
    expect((await storage.getResearchDataConsent(athlete.id))?.staleTerms).toBe(false);
  });

  it("says nothing to somebody who never answered at all", async () => {
    const athlete = await makeAthlete({ dateOfBirth: "2000-01-01" });
    expect((await storage.getResearchDataConsent(athlete.id))?.staleTerms).toBe(false);
  });

  it("clears the flag once the athlete agrees again, and the new terms then apply", async () => {
    const athlete = await consentedUnderOldTerms();
    await storage.setResearchDataConsent({
      athleteId: athlete.id,
      granted: true,
      grantedByUserId: athlete.id,
    });
    expect((await storage.getResearchDataConsent(athlete.id))?.staleTerms).toBe(false);

    // The point of the whole exercise: they are now on terms that permit retention, so deleting
    // the account keeps the scrubbed record where before it would not have.
    await storage.deleteOwnAccount(athlete.id, "correct horse");
    const subjects = await db.select().from(researchSubjects);
    expect(subjects).toHaveLength(1);
    expect(subjects[0].retainedAfterDeletion).toBe(true);
  });

  it("takes the athlete out entirely when they withdraw instead", async () => {
    const athlete = await consentedUnderOldTerms();
    await storage.setResearchDataConsent({
      athleteId: athlete.id,
      granted: false,
      grantedByUserId: athlete.id,
    });
    expect(await db.select().from(researchSubjects)).toHaveLength(0);
  });

  describe("the guardian's side", () => {
    async function minorWithGuardian() {
      const guardian = await makeCoach({ role: "guardian" } as any);
      const athlete = await consentedUnderOldTerms({ dateOfBirth: "2012-01-01" });
      await db.insert(guardianLinks).values({ guardianId: guardian.id, athleteId: athlete.id });
      return { guardian, athlete };
    }

    it("lists a minor whose consent is on the old terms", async () => {
      // Without this the change reaches adults only -- which for anybody under 18 is the same as
      // not shipping it, since they cannot answer for themselves.
      const { guardian, athlete } = await minorWithGuardian();
      const rows = await storage.listResearchReConsentsForGuardian(guardian.id);
      expect(rows.map((r) => r.athleteId)).toEqual([athlete.id]);
    });

    it("does not list somebody else's athlete", async () => {
      const { athlete } = await minorWithGuardian();
      const stranger = await makeCoach({ role: "guardian" } as any);
      expect(await storage.listResearchReConsentsForGuardian(stranger.id)).toEqual([]);
      // And the write is scoped the same way, not just the read.
      const result = await storage.reConfirmResearchConsentAsGuardian(stranger.id, {
        athleteId: athlete.id,
        granted: true,
      });
      expect(result.ok).toBe(false);
      expect((await storage.getResearchDataConsent(athlete.id))?.staleTerms).toBe(true);
    });

    it("refuses when there is no open question, so a guardian cannot originate a change", async () => {
      // The rule is that a guardian ANSWERS a consent question and never raises one. Without this
      // check the route is a set-consent endpoint pointed at somebody else's record: a guardian
      // could flip an athlete who is perfectly current, at any time, for any reason.
      const { guardian, athlete } = await minorWithGuardian();
      await storage.reConfirmResearchConsentAsGuardian(guardian.id, {
        athleteId: athlete.id,
        granted: true,
      });
      expect((await storage.getResearchDataConsent(athlete.id))?.staleTerms).toBe(false);

      // Now current. A second answer has nothing to answer.
      const again = await storage.reConfirmResearchConsentAsGuardian(guardian.id, {
        athleteId: athlete.id,
        granted: false,
      });
      expect(again.ok).toBe(false);
      expect(
        (await db.select().from(users).where(eq(users.id, athlete.id)))[0].researchDataConsent,
      ).toBe(true);
    });

    it("records the guardian as the grantor, not the minor", async () => {
      const { guardian, athlete } = await minorWithGuardian();
      await storage.reConfirmResearchConsentAsGuardian(guardian.id, {
        athleteId: athlete.id,
        granted: true,
      });

      expect(await storage.listResearchReConsentsForGuardian(guardian.id)).toEqual([]);
      const records = await db
        .select()
        .from(consentRecords)
        .where(eq(consentRecords.userId, athlete.id));
      const latest = records.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      )[0];
      expect(latest.givenByUserId).toBe(guardian.id);
      expect(latest.documentText).toContain(DELETION_RETENTION_HEADING);
      expect(latest.documentText).toContain("guardian");
    });

    it("writes a record when the guardian withdraws, not only when they agree", async () => {
      // A withdrawal is a decision somebody made on a date about a document, same as a yes.
      const { guardian, athlete } = await minorWithGuardian();
      const before = (await db.select().from(consentRecords).where(eq(consentRecords.userId, athlete.id)))
        .length;

      await storage.reConfirmResearchConsentAsGuardian(guardian.id, {
        athleteId: athlete.id,
        granted: false,
      });

      const after = await db.select().from(consentRecords).where(eq(consentRecords.userId, athlete.id));
      expect(after.length).toBe(before + 1);
      expect((await db.select().from(users).where(eq(users.id, athlete.id)))[0].researchDataConsent).toBe(
        false,
      );
    });
  });
});
