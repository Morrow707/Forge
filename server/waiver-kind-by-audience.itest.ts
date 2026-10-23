import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { resetDatabase } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/** A DOCUMENT KIND HAS TO BELONG ON THE PROFILE IT IS FILED AGAINST.
 *
 * Runtime audit, 2026-09-20: an athlete posted kind=institutional_agreement against their own
 * record and got a 201, and the admin queue showed "Jordan Athlete / Institutional Service
 * Agreement (signed)" as if a school had signed. The enum said yes because the enum is every
 * kind the table can hold; nobody had asked whether this PERSON is ever asked for that kind.
 * The rule is now the checklist itself (shared/required-documents.ts), with the institutional
 * agreement allowed only for the primary coach the server says owes one. */

const A_PDF = new Blob([Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a])], {
  type: "application/pdf",
});

async function upload(baseUrl: string, cookie: string, athleteId: number, kind: string) {
  const form = new FormData();
  form.append("file", A_PDF, "doc.pdf");
  form.append("kind", kind);
  return fetch(`${baseUrl}/api/waivers/${athleteId}`, { method: "POST", headers: { cookie }, body: form });
}

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});

describe("which kinds a profile accepts", () => {
  beforeEach(resetDatabase);

  it("refuses an institutional agreement filed by an athlete against themselves", async () => {
    const athlete = await makeLoginableUser({ role: "athlete" });
    const cookie = (await loginAs(server.baseUrl, athlete)).cookieHeader();
    const res = await upload(server.baseUrl, cookie, athlete.id, "institutional_agreement");
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/does not belong on this profile/);
  });

  it("refuses a coach credential filed against an athlete, and an athlete form against a coach", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const athlete = await makeLoginableUser({ role: "athlete" });
    await addToRoster(coach.id, athlete.id);
    const coachCookie = (await loginAs(server.baseUrl, coach)).cookieHeader();
    expect((await upload(server.baseUrl, coachCookie, athlete.id, "background_check")).status).toBe(400);
    expect((await upload(server.baseUrl, coachCookie, coach.id, "medical_clearance")).status).toBe(400);
    // The kinds each profile IS asked for still land.
    expect((await upload(server.baseUrl, coachCookie, athlete.id, "participation_waiver")).status).toBe(201);
    expect((await upload(server.baseUrl, coachCookie, coach.id, "cpr_first_aid")).status).toBe(201);
  });

  it("refuses a participation waiver for a free agent, who has no institution to have issued one", async () => {
    const free = await makeLoginableUser({ role: "athlete" });
    const cookie = (await loginAs(server.baseUrl, free)).cookieHeader();
    expect((await upload(server.baseUrl, cookie, free.id, "participation_waiver")).status).toBe(400);
    expect((await upload(server.baseUrl, cookie, free.id, "medical_clearance")).status).toBe(201);
  });

  it("A GUARDIAN'S OWN PROFILE TAKES NO DOCUMENT BUT 'other'", async () => {
    // The defect this closes, found 2026-10-22. `documentAudienceFor` tested two role strings
    // where the pgEnum has four, so a guardian fell through to the ATHLETE branch -- and the two
    // halves then disagreed: the page resolved `athlete_rostered` (it passes
    // `hasCoach: isFreeAgent !== true`, and useIsFreeAgent returns false for a non-athlete) while
    // both server call sites resolved `athlete_free_agent` (they pass `hasCoach: false`).
    //
    // So the parent was shown two red rows about their own training. One of them, the
    // participation waiver, 400'd when tapped -- a dead end on the row the page pre-selected.
    // The other, medical_clearance, was ACCEPTED: an adult's own physician's letter filed into
    // the admin review queue of children's medical records, where the query joins `users` for an
    // `athleteName` with no role filter.
    //
    // Both assertions matter and they are different: the FIRST is the one that was already
    // refused (so it guards the audience not silently widening), the SECOND is the live bug.
    const guardian = await makeLoginableUser({ role: "guardian" });
    const cookie = (await loginAs(server.baseUrl, guardian)).cookieHeader();

    expect((await upload(server.baseUrl, cookie, guardian.id, "participation_waiver")).status).toBe(400);
    const clearance = await upload(server.baseUrl, cookie, guardian.id, "medical_clearance");
    expect(clearance.status).toBe(400);
    expect((await clearance.json()).message).toMatch(/does not belong on this profile/);

    // "other" survives on every profile on purpose -- it is the escape hatch for a form no list
    // anticipated, and taking it away from a guardian would be a refusal nobody asked for.
    expect((await upload(server.baseUrl, cookie, guardian.id, "other")).status).toBe(201);
  });

  it("and the guardian's compliance answer is complete rather than two documents they can never owe", async () => {
    const guardian = await makeLoginableUser({ role: "guardian" });
    const cookie = (await loginAs(server.baseUrl, guardian)).cookieHeader();
    const res = await fetch(`${server.baseUrl}/api/account/document-compliance`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Before the fix this named participation_waiver and medical_clearance for a parent.
    expect(body.missing).toEqual([]);
    expect(body.complete).toBe(true);
  });

  it("accepts a paper institutional agreement only from the primary coach who owes one", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const cookie = (await loginAs(server.baseUrl, coach)).cookieHeader();
    // No organisational plan: not owed, so not accepted.
    expect((await upload(server.baseUrl, cookie, coach.id, "institutional_agreement")).status).toBe(400);
    await db.update(users).set({ billingTier: "21-40", plannedAthleteCount: 30 }).where(eq(users.id, coach.id));
    expect((await upload(server.baseUrl, cookie, coach.id, "institutional_agreement")).status).toBe(201);
  });
});
