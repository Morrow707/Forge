import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { externalWaivers } from "@shared/schema";
import { resetDatabase } from "./test-support/fixtures";
import {
  addToRoster,
  loginAs,
  makeLoginableUser,
  startTestServer,
  TEST_PASSWORD,
  type TestServer,
} from "./test-support/http-app";

/** A COACH FILING A ROSTERED ATHLETE'S PAPERWORK.
 *
 * The server has allowed this from the start -- canManageWaiversFor covers a coach with a roster
 * link -- and the app could not reach it: /documents was hardcoded to the logged-in user, so the
 * only person who could ever upload an athlete's form was the athlete or their guardian. A
 * comment on the coach's chase screen asserted the opposite, which is how it survived.
 *
 * That gap matters because of who actually holds these forms. A club that ran its own paperwork
 * in August has the whole roster's participation waivers in one folder. Asking it to chase each
 * parent for a document already on its desk is how a checklist stays permanently red.
 *
 * So the reachable path is tested rather than the permission function: log in as the coach, post
 * the file the way the browser does, and check it landed on the ATHLETE's record.
 */
async function loginCookie(baseUrl: string, email: string): Promise<string> {
  // A raw fetch here sends no device id, so since new-device approval it
  // would get the "check your email" step instead of a cookie. Sign in
  // through the harness client, which pre-trusts its own device, and lift
  // the cookie off it for the multipart fetches below.
  const client = await loginAs(baseUrl, { email });
  return client.cookieHeader();
}

/** The smallest thing the upload route will accept: a real PDF header, so multer's mime check
 * and the reader both get something of the declared type rather than a string pretending. */
const A_PDF = new Blob([Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a])], {
  type: "application/pdf",
});

async function uploadAs(baseUrl: string, cookie: string, athleteId: number, kind: string) {
  const form = new FormData();
  form.append("file", A_PDF, "waiver.pdf");
  form.append("kind", kind);
  form.append("issuingOrganization", "Lincoln High School Athletics");
  return fetch(`${baseUrl}/api/waivers/${athleteId}`, {
    method: "POST",
    headers: { cookie },
    body: form,
  });
}

describe("a coach filing for a rostered athlete", () => {
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

  it("uploads onto the athlete's record, not the coach's", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const athlete = await makeLoginableUser({ role: "athlete" });
    await addToRoster(coach.id, athlete.id);

    const cookie = await loginCookie(server.baseUrl, coach.email);
    const res = await uploadAs(server.baseUrl, cookie, athlete.id, "participation_waiver");
    expect(res.status).toBe(201);

    const rows = await db.query.externalWaivers.findMany({
      where: eq(externalWaivers.athleteId, athlete.id),
    });
    expect(rows).toHaveLength(1);
    // Whose record it is, and who filed it. Both, because a document that cannot say who
    // produced it is worth less than one that can, and the coach is not the subject of it.
    expect(rows[0]!.athleteId).toBe(athlete.id);
    expect(rows[0]!.uploadedByUserId).toBe(coach.id);
    expect(rows[0]!.issuingOrganization).toBe("Lincoln High School Athletics");

    // Nothing landed on the coach.
    const onCoach = await db.query.externalWaivers.findMany({
      where: eq(externalWaivers.athleteId, coach.id),
    });
    expect(onCoach).toHaveLength(0);
  });

  it("refuses a coach with no roster link to that athlete", async () => {
    // The whole reason the route can be role-agnostic in App.tsx: typing somebody else's id into
    // the URL bar has to be a 403, not a stranger's medical form.
    const stranger = await makeLoginableUser({ role: "coach" });
    const athlete = await makeLoginableUser({ role: "athlete" });

    const cookie = await loginCookie(server.baseUrl, stranger.email);
    const res = await uploadAs(server.baseUrl, cookie, athlete.id, "medical_clearance");
    expect(res.status).toBe(403);
    expect(
      await db.query.externalWaivers.findMany({ where: eq(externalWaivers.athleteId, athlete.id) }),
    ).toHaveLength(0);
  });

  it("tells the page whose documents it is showing", async () => {
    // The page titles itself "<name>'s forms" off this field. Without it a coach filing a child's
    // medical form sees a screen identical to the one where they file their own.
    const coach = await makeLoginableUser({ role: "coach" });
    const athlete = await makeLoginableUser({ role: "athlete", name: "Sam Rivera" });
    await addToRoster(coach.id, athlete.id);

    const client = await loginAs(server.baseUrl, coach);
    const res = await client.get(`/api/waivers/${athlete.id}`);
    expect(res.status).toBe(200);
    expect(res.body.athleteName).toBe("Sam Rivera");
  });

  it("takes a form nobody has a category for", async () => {
    // Every school and organisation has its own paperwork, and a fixed list of kinds cannot
    // anticipate it. "Other" plus the issuing organisation is the escape hatch that keeps a
    // one-off form from being unfileable.
    const coach = await makeLoginableUser({ role: "coach" });
    const athlete = await makeLoginableUser({ role: "athlete" });
    await addToRoster(coach.id, athlete.id);

    const cookie = await loginCookie(server.baseUrl, coach.email);
    const res = await uploadAs(server.baseUrl, cookie, athlete.id, "other");
    expect(res.status).toBe(201);
    const rows = await db.query.externalWaivers.findMany({
      where: eq(externalWaivers.athleteId, athlete.id),
    });
    expect(rows[0]!.kind).toBe("other");
  });
});
