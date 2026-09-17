import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { consentRecords, provisionalAthletes } from "@shared/schema";
import { storage } from "./storage";
import { resetDatabase } from "./test-support/fixtures";
import {
  loginAs,
  makeLoginableUser,
  startTestServer,
  type TestServer,
} from "./test-support/http-app";
import {
  COACH_COPPA_ATTESTATION,
  COACH_COPPA_ATTESTATION_NOT_TAKEN,
} from "@shared/coach-attestation";

/** THE CONSENT A TIER 1 ACCOUNT RESTS ON.
 *
 * There is no verified-parent step in the coach-provisioned flow. A coach makes the slot, the
 * child claims it, and the coach relaying a parent's permission is the entire lawful basis --
 * the row the compliance report prints as "Coach/Program Consent (Tier 1 agent)".
 *
 * That row used to store Forge's TERMS OF USE, so it said a coach had accepted some terms and
 * asserted nothing about any parent. These tests fire the real route, because a gate that lives
 * only in the dialog is one a scripted POST walks straight past.
 */
const yearsAgo = (n: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - n);
  return d.toISOString().slice(0, 10);
};

describe("adding an under-13 to a roster", () => {
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

  it("refuses the import until the coach attests", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const client = await loginAs(server.baseUrl, coach);

    const res = await client.post("/api/coach/roster/player-intake/apply", {
      rows: [{ name: "Young Athlete", age: 11 }],
    });
    expect(res.status).toBe(400);
    expect(String(res.body?.message)).toMatch(/under 13/i);
    expect(await db.query.provisionalAthletes.findMany()).toHaveLength(0);
  });

  it("records the attestation against the slot that needed one, and only that slot", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const client = await loginAs(server.baseUrl, coach);

    const res = await client.post("/api/coach/roster/player-intake/apply", {
      rows: [
        { name: "Young Athlete", age: 11 },
        { name: "Older Athlete", age: 16 },
      ],
      coppaAttested: true,
    });
    expect(res.status).toBe(201);

    const slots = await db.query.provisionalAthletes.findMany();
    const young = slots.find((s) => s.name === "Young Athlete")!;
    const older = slots.find((s) => s.name === "Older Athlete")!;
    expect(young.coppaAttestedAt).not.toBeNull();
    // A coach who added one eleven-year-old among sixteen-year-olds attested about the
    // eleven-year-old. Stamping the rest would make the record claim more than was asked.
    expect(older.coppaAttestedAt).toBeNull();
  });

  it("writes the attestation as the consent when the athlete claims", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const client = await loginAs(server.baseUrl, coach);
    await client.post("/api/coach/roster/player-intake/apply", {
      rows: [{ name: "Young Athlete", age: 11 }],
      coppaAttested: true,
    });
    const [slot] = await db.query.provisionalAthletes.findMany();

    const claimed = await storage.claimProvisionalAthlete(
      slot!.claimCode,
      {
        email: `claim-${Date.now().toString(36)}@example.test`,
        password: "correct-horse-battery-staple-9",
        dateOfBirth: yearsAgo(11),
        guardianEmail: "parent@example.test",
        sport: "Football",
        position: "Linebacker",
        heightIn: 62,
        bodyWeightLbs: 110,
      } as never,
      "FORGE -- TERMS OF USE (the agreement text, which is NOT what this row should carry)",
    );
    if ("error" in claimed) throw new Error(`claim failed: ${claimed.error}`);
    const athleteId = claimed.user.id;

    const rows = await db.query.consentRecords.findMany({
      where: eq(consentRecords.userId, athleteId),
    });
    const coppa = rows.find((r) => r.consentType === "coach_coppa_consent")!;
    expect(coppa).toBeTruthy();
    expect(coppa.documentText).toBe(COACH_COPPA_ATTESTATION);
    // Given BY the coach, ABOUT the athlete. Both halves matter: the coach is the one who
    // asserted it, and the account it justifies is the child's.
    expect(coppa.givenByUserId).toBe(coach.id);
  });

  it("says no attestation was taken when the age only showed up at claim time", async () => {
    // The hole this closes. An intake sheet with no ages produces a slot nobody attested for,
    // and the real date of birth arrives at claim. Citing the attestation there would assert a
    // confirmation the coach was never shown -- the exact defect the attestation replaced.
    const coach = await makeLoginableUser({ role: "coach" });
    const client = await loginAs(server.baseUrl, coach);
    const res = await client.post("/api/coach/roster/player-intake/apply", {
      rows: [{ name: "Age Unknown" }],
    });
    expect(res.status).toBe(201);
    const [slot] = await db.query.provisionalAthletes.findMany();
    expect(slot!.coppaAttestedAt).toBeNull();

    const claimed = await storage.claimProvisionalAthlete(
      slot!.claimCode,
      {
        email: `claim-${Date.now().toString(36)}-b@example.test`,
        password: "correct-horse-battery-staple-9",
        dateOfBirth: yearsAgo(10),
        guardianEmail: "parent@example.test",
        sport: "Football",
        position: "Linebacker",
        heightIn: 62,
        bodyWeightLbs: 110,
      } as never,
      "FORGE -- TERMS OF USE",
    );
    if ("error" in claimed) throw new Error(`claim failed: ${claimed.error}`);
    const athleteId = claimed.user.id;
    const rows = await db.query.consentRecords.findMany({
      where: eq(consentRecords.userId, athleteId),
    });
    const coppa = rows.find((r) => r.consentType === "coach_coppa_consent")!;
    expect(coppa.documentText).toBe(COACH_COPPA_ATTESTATION_NOT_TAKEN);
    expect(coppa.documentText).not.toBe(COACH_COPPA_ATTESTATION);
  });
});
