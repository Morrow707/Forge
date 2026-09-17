import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { storage, queryResearchCohort, queryTrackedCohort } from "./storage";
import { db } from "./db";
import { consentRecords, researchSubjects, researchSubjectSets, users } from "@shared/schema";
import { syncAllResearchSubjects } from "./research-mirror";
import { hashPassword } from "./auth-utils";
import { makeAthlete, resetDatabase } from "./test-support/fixtures";
import { RESEARCH_CONSENT_TEXT, DELETION_RETENTION_HEADING } from "@shared/research-consent";

/**
 * DELETING AN ACCOUNT IS NOT WITHDRAWING FROM RESEARCH.
 *
 * An athlete who agreed that their scrubbed numbers could be studied agreed to
 * something that only has value over years -- "a 15 year old football player
 * on a certain lifting protocol" is a question you cannot ask if the record
 * leaves the moment they stop being a member. So the group numbers stay when
 * the account goes.
 *
 * Every test here is a way that could quietly stop being true. The one that
 * matters most is the nightly sweep: it decides mirror membership by comparing
 * the mirror against everyone currently consenting, so a retained subject --
 * which by definition has no live account behind it -- looks exactly like a
 * stale orphan. That is how this retention was being lost before the flag
 * existed: not blocked by a policy, reaped by a garbage collector a day later.
 */
describe("research data surviving account deletion", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  /** An athlete who consented under the current text, with a real password so
   * the genuine deleteOwnAccount path (which re-checks it) can run. */
  async function consentingAthlete(overrides: Record<string, unknown> = {}) {
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
    return athlete;
  }

  it("keeps the scrubbed subject when the account is deleted", async () => {
    const athlete = await consentingAthlete();
    expect(await db.select().from(researchSubjects)).toHaveLength(1);

    const result = await storage.deleteOwnAccount(athlete.id, "correct horse");
    expect(result).toEqual({ ok: true });

    expect(await db.select().from(users).where(eq(users.id, athlete.id))).toHaveLength(0);
    const subjects = await db.select().from(researchSubjects);
    expect(subjects).toHaveLength(1);
    expect(subjects[0].retainedAfterDeletion).toBe(true);
    // The whole point: the numbers a researcher would ask about are still here.
    expect(subjects[0].sport).toBe("Football");
  });

  it("does not let the nightly sweep reap a retained subject", async () => {
    // THE REGRESSION THIS FILE EXISTS FOR. The sweep sees a subject with no
    // live account and no consenting user pointing at it -- identical, from
    // where it stands, to somebody who withdrew.
    const athlete = await consentingAthlete();
    await storage.deleteOwnAccount(athlete.id, "correct horse");

    const { removed } = await syncAllResearchSubjects();
    expect(removed).toBe(0);
    expect(await db.select().from(researchSubjects)).toHaveLength(1);

    // And again, because a bug that survives one pass is not a fix.
    await syncAllResearchSubjects();
    expect(await db.select().from(researchSubjects)).toHaveLength(1);
  });

  it("still reaps a genuine orphan, so the sweep has not simply been disarmed", async () => {
    const athlete = await consentingAthlete();
    // A subject whose account vanished WITHOUT going through the retention
    // path -- the case the sweep was written for.
    await db.delete(users).where(eq(users.id, athlete.id));

    const { removed } = await syncAllResearchSubjects();
    expect(removed).toBe(1);
    expect(await db.select().from(researchSubjects)).toHaveLength(0);
  });

  it("withdrawing then deleting leaves nothing behind", async () => {
    // The order the consent text tells somebody to use if they want no trace.
    const athlete = await consentingAthlete();
    await storage.setResearchDataConsent({
      athleteId: athlete.id,
      granted: false,
      grantedByUserId: athlete.id,
    });
    expect(await db.select().from(researchSubjects)).toHaveLength(0);

    await storage.deleteOwnAccount(athlete.id, "correct horse");
    expect(await db.select().from(researchSubjects)).toHaveLength(0);
  });

  it("keeps nothing for an athlete who never consented", async () => {
    const athlete = await makeAthlete({
      dateOfBirth: "2000-01-01",
      passwordHash: await hashPassword("correct horse"),
    });
    await storage.deleteOwnAccount(athlete.id, "correct horse");
    expect(await db.select().from(researchSubjects)).toHaveLength(0);
  });

  it("keeps nothing for someone whose consent text never mentioned deletion", async () => {
    // Retention is only defensible against somebody who was told. This
    // rewrites the stored record to the text as it read before the disclosure
    // was added -- exactly what an athlete who consented last month has.
    const athlete = await consentingAthlete();
    const olderText = RESEARCH_CONSENT_TEXT.split(DELETION_RETENTION_HEADING)[0];
    expect(olderText).not.toContain(DELETION_RETENTION_HEADING);
    await db
      .update(consentRecords)
      .set({ documentText: olderText })
      .where(eq(consentRecords.userId, athlete.id));

    await storage.deleteOwnAccount(athlete.id, "correct horse");

    // Not retained -- so the sweep takes it, which is the correct outcome for
    // somebody who was never told this could happen.
    await syncAllResearchSubjects();
    expect(await db.select().from(researchSubjects)).toHaveLength(0);
  });

  it("counts a retained subject in the denominator it is drawn from", async () => {
    // An extract quotes "N matched the filters overall" beside the cohort it
    // built. That denominator is counted from LIVE athletes, so a retained
    // subject is in the numerator and invisible to it -- left alone, a cohort
    // could report 12 of 8. Nonsense on a document leaving the organisation,
    // and the sort of thing a reader is right to distrust the rest of a page
    // over.
    const gone = await consentingAthlete();
    await storage.deleteOwnAccount(gone.id, "correct horse");
    // One athlete still on the platform, consented, so both halves are
    // non-empty and the sum is not trivially right.
    await consentingAthlete();

    const filters = { sports: ["Football"], metrics: [] } as any;
    const [live, consented] = await Promise.all([
      queryTrackedCohort(filters, { population: "tracked" }),
      queryResearchCohort(filters),
    ]);

    expect(consented.cohortSize).toBe(2);
    expect(consented.formerAthletes).toBe(1);
    // The live query cannot see the deleted athlete at all -- which is the
    // whole problem the formerAthletes count exists to correct.
    expect(live.cohortSize).toBe(1);

    const matchedBeforeConsent = live.cohortSize + consented.formerAthletes;
    expect(matchedBeforeConsent).toBe(2);
    expect(matchedBeforeConsent).toBeGreaterThanOrEqual(consented.cohortSize);
  });

  it("keeps the subject's training rows, not just the subject", async () => {
    // A retained subject with no sets is a row that answers no question.
    const athlete = await consentingAthlete();
    const [subject] = await db.select().from(researchSubjects);
    await db.insert(researchSubjectSets).values({
      subjectId: subject.subjectId,
      week: "2026-09-14",
      exerciseName: "Back Squat",
      peakVelocityMps: 0.62,
    });

    await storage.deleteOwnAccount(athlete.id, "correct horse");
    await syncAllResearchSubjects();

    expect(await db.select().from(researchSubjectSets)).toHaveLength(1);
  });
});
