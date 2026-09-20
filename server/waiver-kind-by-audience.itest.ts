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

  it("accepts a paper institutional agreement only from the primary coach who owes one", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const cookie = (await loginAs(server.baseUrl, coach)).cookieHeader();
    // No organisational plan: not owed, so not accepted.
    expect((await upload(server.baseUrl, cookie, coach.id, "institutional_agreement")).status).toBe(400);
    await db.update(users).set({ billingTier: "21-40", plannedAthleteCount: 30 }).where(eq(users.id, coach.id));
    expect((await upload(server.baseUrl, cookie, coach.id, "institutional_agreement")).status).toBe(201);
  });
});
