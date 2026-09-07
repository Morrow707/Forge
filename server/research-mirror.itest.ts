import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { db } from "./db";
import { injuryHistory, researchSubjectInjuries, researchSubjects, users } from "@shared/schema";
import { syncAllResearchSubjects, syncResearchSubject } from "./research-mirror";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

const adultDob = "2000-01-01";
const minorDob = "2012-01-01";

/**
 * The mirror's job is to be exactly the consenting population and nothing
 * else. Every test here is a way that could stop being true -- and the
 * removal cases matter more than the addition cases, because an athlete
 * wrongly present in the mirror is an athlete in a document that left the
 * organisation without their agreement.
 */
describe("research mirror", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  const consent = (athleteId: number, granted: boolean) =>
    storage.setResearchDataConsent({ athleteId, granted, grantedByUserId: athleteId });

  it("holds nobody until somebody consents", async () => {
    await makeAthlete({ dateOfBirth: adultDob, sport: "Football" });
    expect(await db.select().from(researchSubjects)).toHaveLength(0);
  });

  it("adds a subject the moment consent is granted, without waiting for the nightly job", async () => {
    const athlete = await makeAthlete({ dateOfBirth: adultDob, sport: "Football", age: 24 });
    await consent(athlete.id, true);

    const rows = await db.select().from(researchSubjects);
    expect(rows).toHaveLength(1);
    expect(rows[0].sport).toBe("Football");
    expect(rows[0].age).toBe(24);
  });

  it("removes the subject the moment consent is withdrawn", async () => {
    // The failure this guards against is a withdrawal that only takes effect
    // at the next nightly run, leaving a window in which an extract can still
    // include somebody who said no.
    const athlete = await makeAthlete({ dateOfBirth: adultDob });
    await consent(athlete.id, true);
    expect(await db.select().from(researchSubjects)).toHaveLength(1);

    await consent(athlete.id, false);
    expect(await db.select().from(researchSubjects)).toHaveLength(0);
  });

  it("gives a re-consenting athlete a different subject id than before", async () => {
    // Reusing the id would let two extracts taken a year apart be joined on
    // it, which is exactly the linkage the mirror exists to prevent.
    const athlete = await makeAthlete({ dateOfBirth: adultDob });
    await consent(athlete.id, true);
    const [first] = await db.select().from(researchSubjects);
    await consent(athlete.id, false);
    await consent(athlete.id, true);
    const [second] = await db.select().from(researchSubjects);

    expect(second.subjectId).not.toBe(first.subjectId);
  });

  it("gives consecutive accounts unrelated random subject ids", async () => {
    // User ids are sequential integers, so anything derived from one --
    // a hash included -- would be trivially reversible by trying the few
    // thousand ids that exist. Random v4 uuids, unrelated to each other.
    const a = await makeAthlete({ dateOfBirth: adultDob });
    const b = await makeAthlete({ dateOfBirth: adultDob });
    await consent(a.id, true);
    await consent(b.id, true);
    const ids = (await db.select().from(researchSubjects)).map((r) => r.subjectId);

    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
    // Consecutive accounts, ids that share nothing -- a derived scheme would
    // put them adjacent.
    expect(ids[0].slice(0, 8)).not.toBe(ids[1].slice(0, 8));
  });

  it("keeps no name, email or date of birth in the mirror", async () => {
    const athlete = await makeAthlete({
      dateOfBirth: minorDob,
      name: "Jordan Vasquez",
      sport: "Soccer",
    });
    await consent(athlete.id, true);
    const [row] = await db.select().from(researchSubjects);
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("Jordan");
    expect(serialized).not.toContain(athlete.email);
    expect(serialized).not.toContain(minorDob);
    // Whether the subject is a minor survives; which minor does not.
    expect(row.isMinor).toBe(true);
  });

  it("normalizes an injury to a region and never copies the free text", async () => {
    const athlete = await makeAthlete({ dateOfBirth: adultDob });
    await db.insert(injuryHistory).values({
      athleteId: athlete.id,
      bodyPart: "left hamstring",
      occurredOn: "2026-03-04",
      description: "Pulled it at Coach Dana Reyes' Tuesday session at Lincoln High",
    });
    await consent(athlete.id, true);

    const [row] = await db.select().from(researchSubjectInjuries);
    expect(row.region).toBe("hamstring");
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("Dana");
    expect(serialized).not.toContain("Lincoln");
    // Coarsened to the week it fell in, never the day.
    expect(row.week).toBe("2026-03-01");
  });

  it("drops an athlete who opted out of tracking, even with research consent on file", async () => {
    // The two flags answer different questions and an athlete has to be on
    // the right side of both.
    const coach = await makeCoach({});
    const athlete = await makeAthlete({ dateOfBirth: adultDob });
    await db.execute(
      `INSERT INTO coach_athletes (coach_id, athlete_id) VALUES (${coach.id}, ${athlete.id})` as never,
    );
    await consent(athlete.id, true);
    expect(await db.select().from(researchSubjects)).toHaveLength(1);

    await db.update(users).set({ trackingOptOut: true }).where(eq(users.id, athlete.id));
    expect(await syncResearchSubject(athlete.id)).toBeNull();
    expect(await db.select().from(researchSubjects)).toHaveLength(0);
  });

  it("sweeps a subject whose account was deleted outright", async () => {
    // Nothing points from the mirror back at users, so a deleted account
    // leaves an orphan that only the reconcile can find.
    const athlete = await makeAthlete({ dateOfBirth: adultDob });
    await consent(athlete.id, true);
    await db.delete(users).where(eq(users.id, athlete.id));
    expect(await db.select().from(researchSubjects)).toHaveLength(1);

    const { removed } = await syncAllResearchSubjects();
    expect(removed).toBe(1);
    expect(await db.select().from(researchSubjects)).toHaveLength(0);
  });

  it("refreshes rather than duplicates when an athlete is synced twice", async () => {
    const athlete = await makeAthlete({ dateOfBirth: adultDob, sport: "Football" });
    await consent(athlete.id, true);
    await db.update(users).set({ sport: "Track & Field" }).where(eq(users.id, athlete.id));
    await syncResearchSubject(athlete.id);

    const rows = await db.select().from(researchSubjects);
    expect(rows).toHaveLength(1);
    expect(rows[0].sport).toBe("Track & Field");
  });
});
