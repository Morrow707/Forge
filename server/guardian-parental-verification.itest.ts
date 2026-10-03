import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "./db";
import { consentRecords, guardianLinks } from "@shared/schema";
import { storage } from "./storage";
import { handleStripeWebhookEvent } from "./billing";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

// AN UNDER-13 ACCOUNT STAYS HELD UNTIL A LINKED GUARDIAN'S CARD HAS BEEN CHARGED ONCE.
//
// Counsel, 2026-10-03 (docs/legal-open-questions.md, question 5): the emailed claim link is not
// verifiable parental consent under COPPA for what Forge does with the data; a transaction on the
// parent's own card is. So the claim opens the account for a 13-to-17-year-old as before, and for
// an under-13 it opens a second hold that only Stripe's webhook can release, by writing the
// guardian_payment_verification record athleteGateStatus reads.
const isoYearsAgo = (years: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
};

describe("the card verification for an athlete under 13", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(async () => {
    await resetDatabase();
  });

  async function family(ageYears: number) {
    const athlete = await makeLoginableUser({ role: "athlete", name: "Sam Young", dateOfBirth: isoYearsAgo(ageYears) });
    const guardian = await makeLoginableUser({ role: "guardian", name: "Pat Guardian" });
    await db.insert(guardianLinks).values({ athleteId: athlete.id, guardianId: guardian.id });
    return { athlete, guardian };
  }

  const paidSession = (guardianId: number, athleteId: number, eventId: string) =>
    ({
      id: eventId,
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_${eventId}`,
          client_reference_id: String(guardianId),
          payment_status: "paid",
          payment_intent: `pi_${eventId}`,
          amount_total: 50,
          customer: null,
          subscription: null,
          metadata: { kind: "guardian_verification", userId: String(guardianId), athleteId: String(athleteId) },
        },
      },
    }) as unknown as Stripe.Event;

  it("holds the under-13 after the claim, tells both sides why, and releases on the webhook", async () => {
    const { athlete, guardian } = await family(10);
    expect(await storage.athleteGateStatus(athlete.id)).toBe("needs_guardian_verification");

    const child = await loginAs(server.baseUrl, athlete);
    const me = await child.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.guardianVerificationRequired).toBe(true);
    expect(me.body.guardianLinkRequired).toBe(false);
    // The server refuses the app, not just the client.
    expect((await child.get("/api/athlete/calendar?start=2026-01-01&end=2026-01-31")).status).toBe(403);

    const parent = await loginAs(server.baseUrl, guardian);
    const before = await parent.get(`/api/guardian/athletes/${athlete.id}/parental-verification`);
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ required: true, verified: false, verifiedAt: null, chargeCents: 50 });
    // No Stripe key under test: the route says so rather than pretending.
    const start = await parent.post(`/api/guardian/athletes/${athlete.id}/parental-verification`, {});
    expect(start.status).toBe(503);

    await handleStripeWebhookEvent(paidSession(guardian.id, athlete.id, "evt_verify_1"));

    const rows = await db.select().from(consentRecords).where(eq(consentRecords.userId, athlete.id));
    const record = rows.find((r) => r.consentType === "guardian_payment_verification");
    expect(record).toBeDefined();
    expect(record!.givenByUserId).toBe(guardian.id);
    expect(record!.documentText).toContain("pi_evt_verify_1");
    expect(record!.documentText).toContain("linked guardian");

    expect(await storage.athleteGateStatus(athlete.id)).toBe("ok");
    const after = await parent.get(`/api/guardian/athletes/${athlete.id}/parental-verification`);
    expect(after.body).toMatchObject({ required: true, verified: true });
    expect(after.body.verifiedAt).not.toBeNull();
    const meAfter = await child.get("/api/auth/me");
    expect(meAfter.body.guardianVerificationRequired).toBe(false);
    expect((await child.get("/api/athlete/calendar?start=2026-01-01&end=2026-01-31")).status).toBe(200);
    // Done once; the route refuses a second charge.
    const again = await parent.post(`/api/guardian/athletes/${athlete.id}/parental-verification`, {});
    expect(again.status).toBe(400);
  });

  it("asks nothing of a 13-to-17-year-old, whose claim is the consent", async () => {
    const { athlete, guardian } = await family(15);
    expect(await storage.athleteGateStatus(athlete.id)).toBe("ok");
    const parent = await loginAs(server.baseUrl, guardian);
    const status = await parent.get(`/api/guardian/athletes/${athlete.id}/parental-verification`);
    expect(status.body).toMatchObject({ required: false, verified: false });
    const start = await parent.post(`/api/guardian/athletes/${athlete.id}/parental-verification`, {});
    expect(start.status).toBe(400);
  });

  it("does not count a card used on the child's own account as the parent's", async () => {
    const { athlete } = await family(10);
    await storage.recordPaymentAsParentalVerification({ payerId: athlete.id, reference: "pi_own", source: "stripe" });
    expect(await storage.athleteGateStatus(athlete.id)).toBe("needs_guardian_verification");
  });

  it("ignores an unpaid session", async () => {
    const { athlete, guardian } = await family(10);
    const event = paidSession(guardian.id, athlete.id, "evt_unpaid");
    (event.data.object as any).payment_status = "unpaid";
    await handleStripeWebhookEvent(event);
    expect(await storage.athleteGateStatus(athlete.id)).toBe("needs_guardian_verification");
  });
});
