import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { consentRecords, guardianLinks, users } from "@shared/schema";
import { storage } from "./storage";
import { resetDatabase } from "./test-support/fixtures";

// PAYMENT AS CORROBORATION, NOT AS THE CONSENT.
//
// The FTC treats a card transaction that notifies the cardholder of each charge as one of its
// approved verification methods: holding an adult's payment instrument, and getting the
// statement, is something a child cannot fake for long.
//
// What matters in the record is honesty about which of two very different things happened. A
// guardian paying is attributable to a named adult who has already signed. A charge on the
// minor's own account says only that somebody's card was used and it was not the child's. A row
// that flattened those would make the weak case read like the strong one -- the failure mode
// that matters most in a consent record, because it is the thing someone later relies on.
const isoYearsAgo = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
};

let seq = 0;
async function makeUser(role: "athlete" | "guardian", dateOfBirth: string | null) {
  const [row] = await db
    .insert(users)
    .values({
      email: `vpc-${Date.now().toString(36)}-${seq++}@example.test`,
      passwordHash: "not-a-real-hash",
      name: role === "guardian" ? "Pat Guardian" : "Sam Athlete",
      role,
      dateOfBirth,
    })
    .returning();
  return row;
}

const recordsFor = (athleteId: number) =>
  db.query.consentRecords.findMany({ where: eq(consentRecords.userId, athleteId) });

describe("recording a payment as parental verification", () => {
  beforeEach(resetDatabase);

  it("records against every linked minor when a guardian pays", async () => {
    const guardian = await makeUser("guardian", null);
    const first = await makeUser("athlete", isoYearsAgo(11));
    const second = await makeUser("athlete", isoYearsAgo(15));
    await db.insert(guardianLinks).values([
      { athleteId: first.id, guardianId: guardian.id },
      { athleteId: second.id, guardianId: guardian.id },
    ]);

    const written = await storage.recordPaymentAsParentalVerification({
      payerId: guardian.id,
      reference: "cs_test_123",
      amountCents: 999,
      source: "stripe",
    });
    expect(written).toBe(2);

    const rows = await recordsFor(first.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].consentType).toBe("guardian_payment_verification");
    expect(rows[0].givenByUserId).toBe(guardian.id);
    // The strong case says so, and names who paid.
    expect(rows[0].documentText).toContain("a linked guardian of this athlete");
    expect(rows[0].documentText).toContain("cs_test_123");
  });

  // The weaker case has to read as weaker. A charge on the child's own account proves an adult's
  // card was used and nothing about who presented it.
  it("does not claim a guardian paid when the charge was on the minor's own account", async () => {
    const athlete = await makeUser("athlete", isoYearsAgo(12));
    const guardian = await makeUser("guardian", null);
    await db.insert(guardianLinks).values({ athleteId: athlete.id, guardianId: guardian.id });

    const written = await storage.recordPaymentAsParentalVerification({
      payerId: athlete.id,
      reference: "cs_test_456",
      amountCents: 999,
      source: "stripe",
    });
    expect(written).toBe(1);

    const rows = await recordsFor(athlete.id);
    expect(rows[0].documentText).toContain("does not identify who presented it");
    expect(rows[0].documentText).not.toContain("a linked guardian of this athlete");
  });

  // Every record says it is corroboration, so nobody reading one later mistakes it for the
  // consent itself.
  it("never lets a row read as the consent of record", async () => {
    const athlete = await makeUser("athlete", isoYearsAgo(10));
    await storage.recordPaymentAsParentalVerification({
      payerId: athlete.id,
      reference: "cs_test_789",
      source: "apple_iap",
    });
    const rows = await recordsFor(athlete.id);
    expect(rows[0].documentText).toContain("corroborating evidence");
    expect(rows[0].documentText).toContain("guardian's signed agreement at account claim");
  });

  it("writes nothing for an adult paying for themselves", async () => {
    const adult = await makeUser("athlete", isoYearsAgo(30));
    expect(
      await storage.recordPaymentAsParentalVerification({
        payerId: adult.id,
        reference: "cs_test_adult",
        source: "stripe",
      }),
    ).toBe(0);
    expect(await recordsFor(adult.id)).toHaveLength(0);
  });

  // A guardian of grown children is not verifying anything about a minor.
  it("writes nothing when every linked athlete is an adult", async () => {
    const guardian = await makeUser("guardian", null);
    const grown = await makeUser("athlete", isoYearsAgo(19));
    await db.insert(guardianLinks).values({ athleteId: grown.id, guardianId: guardian.id });
    expect(
      await storage.recordPaymentAsParentalVerification({
        payerId: guardian.id,
        reference: "cs_test_grown",
        source: "stripe",
      }),
    ).toBe(0);
  });
});
