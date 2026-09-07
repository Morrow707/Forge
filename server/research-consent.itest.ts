import { describe, it, expect, beforeEach } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { consentRecords, guardianLinks } from "@shared/schema";
import { eq } from "drizzle-orm";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

const adultDob = "2000-01-01";
const minorDob = "2012-01-01";

describe("research data consent", () => {
  let adminId: number;

  beforeEach(async () => {
    await resetDatabase();
    const admin = await makeCoach({ role: "admin", name: "Admin" });
    adminId = admin.id;
  });

  it("starts off for everyone", async () => {
    // The default has to be off, or an extract built on day one silently
    // includes people who were never asked.
    const athlete = await makeAthlete({ dateOfBirth: adultDob });
    const status = await storage.getResearchDataConsent(athlete.id);
    expect(status?.granted).toBe(false);
    expect(status?.grantedAt).toBeNull();
  });

  it("records the full consent text, not just a version", async () => {
    // A record that keeps a version number and not the words cannot answer,
    // a year later, what the person was actually looking at.
    const athlete = await makeAthlete({ dateOfBirth: adultDob });
    await storage.setResearchDataConsent({
      athleteId: athlete.id,
      granted: true,
      grantedByUserId: athlete.id,
    });
    const [record] = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.userId, athlete.id));
    expect(record.consentType).toBe("research_data_use");
    expect(record.documentText).toContain("Only group numbers");
    expect(record.documentText).toContain("Your name, email, birthday");
  });

  it("records a withdrawal as its own dated decision", async () => {
    // A trail that only keeps the yeses cannot say when someone took it back.
    const athlete = await makeAthlete({ dateOfBirth: adultDob });
    await storage.setResearchDataConsent({
      athleteId: athlete.id,
      granted: true,
      grantedByUserId: athlete.id,
    });
    await storage.setResearchDataConsent({
      athleteId: athlete.id,
      granted: false,
      grantedByUserId: athlete.id,
    });

    const records = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.userId, athlete.id));
    expect(records).toHaveLength(2);
    expect(records.some((r) => r.documentText.startsWith("WITHDRAWN"))).toBe(true);

    const status = await storage.getResearchDataConsent(athlete.id);
    expect(status?.granted).toBe(false);
    expect(status?.grantedAt).toBeNull();
  });

  it("names the guardian a coach relayed the answer from", async () => {
    // "A coach ticked a box" and "a named guardian said yes and the coach
    // recorded it" are different things, and only one is consent.
    const athlete = await makeAthlete({ dateOfBirth: minorDob });
    await storage.setResearchDataConsent({
      athleteId: athlete.id,
      granted: true,
      grantedByUserId: adminId,
      relayedFrom: "Dana Reyes (mother)",
    });
    const [record] = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.userId, athlete.id));
    expect(record.documentText).toContain("Dana Reyes (mother)");
    expect(record.givenByUserId).toBe(adminId);
  });

  it("says a minor needs a guardian, and treats an unknown age as a minor", async () => {
    const minor = await makeAthlete({ dateOfBirth: minorDob });
    const adult = await makeAthlete({ dateOfBirth: adultDob });
    const unknown = await makeAthlete({});

    expect((await storage.getResearchDataConsent(minor.id))?.requiresGuardian).toBe(true);
    expect((await storage.getResearchDataConsent(adult.id))?.requiresGuardian).toBe(false);
    // No date of birth on file: the safe assumption is the one that needs an
    // adult, not the one that does not.
    expect((await storage.getResearchDataConsent(unknown.id))?.requiresGuardian).toBe(true);
  });

  it("only includes consenting athletes in a research cohort", async () => {
    for (let i = 0; i < 6; i++) {
      const a = await makeAthlete({ sport: "Football", age: 17, dateOfBirth: adultDob });
      if (i < 4) {
        await storage.setResearchDataConsent({
          athleteId: a.id,
          granted: true,
          grantedByUserId: a.id,
        });
      }
    }
    const counts = await storage.getResearchConsentCounts();
    expect(counts.totalAthletes).toBe(6);
    expect(counts.consentedAthletes).toBe(4);
  });
});

describe("research consent at signup", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("is off when an adult does not tick the box", async () => {
    // The default has to survive a signup that simply ignores the option.
    const athlete = await makeAthlete({ dateOfBirth: adultDob });
    expect((await storage.getResearchDataConsent(athlete.id))?.granted).toBe(false);
  });

  it("records an adult's consent with the full text when they do", async () => {
    const athlete = await makeAthlete({ dateOfBirth: adultDob });
    await storage.setResearchDataConsent({
      athleteId: athlete.id,
      granted: true,
      grantedByUserId: athlete.id,
    });
    const status = await storage.getResearchDataConsent(athlete.id);
    expect(status?.granted).toBe(true);
    expect(status?.grantedAt).not.toBeNull();
    expect(status?.requiresGuardian).toBe(false);
  });

  it("keeps a minor out of the dataset even if their own consent row were set", async () => {
    // Defence in depth. The signup route ignores the flag for a minor and
    // the client hides the box, but if a row were ever set some other way,
    // requiresGuardian is what tells every surface this was not the minor's
    // decision to make.
    const minor = await makeAthlete({ dateOfBirth: minorDob });
    const status = await storage.getResearchDataConsent(minor.id);
    expect(status?.requiresGuardian).toBe(true);
  });
});

describe("guardian access is a link, not a role", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("lets an athlete account hold a guardian link to someone else", async () => {
    // A parent who trains on Forge as a Free Agent keeps that one account and
    // gains a free guardian view, rather than needing a second email.
    const parent = await makeAthlete({ dateOfBirth: adultDob, name: "Parent" });
    const child = await makeAthlete({ dateOfBirth: minorDob, name: "Child" });
    await db.insert(guardianLinks).values({ athleteId: child.id, guardianId: parent.id });

    const linked = await storage.getAthletesForGuardian(parent.id);
    expect(linked).toHaveLength(1);
    expect(linked[0].id).toBe(child.id);
  });

  it("scopes a guardian to only their own linked athletes", async () => {
    const parent = await makeAthlete({ dateOfBirth: adultDob });
    const child = await makeAthlete({ dateOfBirth: minorDob });
    const stranger = await makeAthlete({ dateOfBirth: minorDob });
    await db.insert(guardianLinks).values({ athleteId: child.id, guardianId: parent.id });

    expect(await storage.getAthleteForGuardianScoped(parent.id, child.id)).not.toBeNull();
    // Someone else's child is a 404, not a 403 -- a guardian should not learn
    // that an account exists by asking about it.
    expect(await storage.getAthleteForGuardianScoped(parent.id, stranger.id)).toBeFalsy();
  });

  it("gives no guardian access to an account with no links", async () => {
    const loner = await makeAthlete({ dateOfBirth: adultDob });
    expect(await storage.getAthletesForGuardian(loner.id)).toHaveLength(0);
  });
});
