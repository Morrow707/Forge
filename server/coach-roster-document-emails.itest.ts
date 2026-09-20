import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { coachAthletes, coachStaff, guardianLinks, legalDocuments, notifications, teams, teamMembers, users } from "@shared/schema";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs as rawLoginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";
import { testOutbox } from "./email";

/** Signing in writes its own "new login" notice to the outbox; nothing here is about that
 * email, so it is cleared after every login and the assertions read only what the routes sent. */
async function loginAs(baseUrl: string, user: { email: string }) {
  const client = await rawLoginAs(baseUrl, user);
  testOutbox.length = 0;
  return client;
}

/** A COACH'S PAPERWORK REQUESTS LEAVE THE APP.
 *
 * Both halves of the coach email-to-roster feature, through the real routes and the real
 * outbox: (a) "ask for what is outstanding" now emails the person who can act on it -- the adult
 * athlete, or a minor's guardians -- as well as writing the in-app notice; (b) a coach can send
 * any PUBLIC legal document to their roster scope. The things worth proving are the ones that
 * are only visible from outside: who the email went TO, that the 24-hour floor still holds, that
 * a coach cannot reach another coach's families, and that per-team narrowing narrows the send.
 */

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});

const isoYearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
};

async function makeGuardianFor(athleteId: number, name = "Test Guardian") {
  const guardian = await makeLoginableUser({ role: "guardian", name });
  await db.insert(guardianLinks).values({ athleteId, guardianId: guardian.id });
  return guardian;
}

async function seedPrivacyPolicy() {
  await db
    .insert(legalDocuments)
    .values({ docType: "privacy_policy", content: "Privacy Policy body for the test." })
    .onConflictDoNothing();
}

describe("asking for outstanding documents", () => {
  beforeEach(async () => {
    await resetDatabase();
    testOutbox.length = 0;
  });

  it("emails an adult athlete directly and a minor's guardian about the child", async () => {
    const coach = await makeLoginableUser({ role: "coach", name: "Coach Rivera" });
    const adult = await makeLoginableUser({ role: "athlete", name: "Adult Athlete", dateOfBirth: isoYearsAgo(22) });
    const minor = await makeLoginableUser({ role: "athlete", name: "Minor Athlete", dateOfBirth: isoYearsAgo(15) });
    // One guardian per athlete (guardian_links is unique on athlete_id), so "every linked
    // guardian" is one address here; the roster send below covers one guardian for two athletes.
    const mum = await makeGuardianFor(minor.id, "Mum");
    await db.insert(coachAthletes).values([
      { coachId: coach.id, athleteId: adult.id },
      { coachId: coach.id, athleteId: minor.id },
    ]);

    const client = await loginAs(server.baseUrl, coach);
    const res = await client.post("/api/coach/documents-status/request", {});
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(2);
    expect(res.body.emailed).toBe(2);
    expect(res.body.inAppOnly).toBe(0);
    const byAthlete = Object.fromEntries(res.body.results.map((r: any) => [r.athleteId, r]));
    expect(byAthlete[adult.id].detail).toBe("athlete");
    expect(byAthlete[minor.id].detail).toBe("guardians");

    const to = testOutbox.map((m) => m.to).sort();
    expect(to).toEqual([adult.email, mum.email].sort());
    // The minor's own inbox is never written to about their own paperwork.
    expect(to).not.toContain(minor.email);

    const toMum = testOutbox.find((m) => m.to === mum.email)!;
    expect(toMum.subject).toBe("Documents needed for Minor Athlete");
    expect(toMum.html).toContain("Coach Rivera");
    expect(toMum.html).toContain("needs these on file");
    expect(toMum.html).toContain(`/documents/${minor.id}`);
    const toAdult = testOutbox.find((m) => m.to === adult.email)!;
    expect(toAdult.html).toMatch(/href="[^"]*\/documents"/);

    // The in-app notice is still written, for everybody it always was.
    const notes = await db.select().from(notifications).where(eq(notifications.type, "documents_requested"));
    expect(notes.map((n) => n.userId).sort()).toEqual([adult.id, minor.id, mum.id].sort());
  });

  it("reports in-app only, with the reason, when there is no address to send to", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    // A minor with no guardian linked and no email of their own.
    const minor = await makeLoginableUser({ role: "athlete", name: "Orphaned Minor", dateOfBirth: isoYearsAgo(14) });
    await db.update(users).set({ email: "" }).where(eq(users.id, minor.id));
    await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: minor.id });

    const client = await loginAs(server.baseUrl, coach);
    const res = await client.post("/api/coach/documents-status/request", {});
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(1);
    expect(res.body.emailed).toBe(0);
    expect(res.body.inAppOnly).toBe(1);
    expect(res.body.results[0].detail).toBe("no_email");
    expect(testOutbox).toHaveLength(0);
    const notes = await db.select().from(notifications).where(eq(notifications.userId, minor.id));
    expect(notes).toHaveLength(1);
  });

  it("keeps the once-per-24h floor: the second ask sends nothing and says so", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const adult = await makeLoginableUser({ role: "athlete", dateOfBirth: isoYearsAgo(20) });
    await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: adult.id });
    const client = await loginAs(server.baseUrl, coach);

    const first = await client.post("/api/coach/documents-status/request", {});
    expect(first.body.sent).toBe(1);
    expect(testOutbox).toHaveLength(1);

    const second = await client.post("/api/coach/documents-status/request", {});
    expect(second.body.sent).toBe(0);
    expect(second.body.skipped).toBe(1);
    expect(second.body.emailed).toBe(0);
    expect(testOutbox).toHaveLength(1);
  });
});

describe("sending a public document to the roster", () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedPrivacyPolicy();
    testOutbox.length = 0;
  });

  it("lists only the public types, and refuses a type that is not one", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const client = await loginAs(server.baseUrl, coach);
    const list = await client.get("/api/coach/legal-documents/sendable");
    expect(list.status).toBe(200);
    const types = list.body.map((d: any) => d.type);
    expect(types).toContain("privacy_policy");
    expect(types).toContain("terms_of_service");
    // The parental notice is a legal type but not a public one.
    expect(types).not.toContain("parental_notice");
    const refused = await client.post("/api/coach/legal-documents/parental_notice/email-roster");
    expect(refused.status).toBe(404);
    expect(testOutbox).toHaveLength(0);
  });

  it("routes adults to themselves, minors to guardians, de-duplicates, and never crosses rosters", async () => {
    const coach = await makeLoginableUser({ role: "coach", name: "Coach Rivera" });
    const otherCoach = await makeLoginableUser({ role: "coach", name: "Somebody Else" });
    const adult = await makeLoginableUser({ role: "athlete", name: "Adult", dateOfBirth: isoYearsAgo(19) });
    const kidA = await makeLoginableUser({ role: "athlete", name: "Kid A", dateOfBirth: isoYearsAgo(15) });
    const kidB = await makeLoginableUser({ role: "athlete", name: "Kid B", dateOfBirth: isoYearsAgo(13) });
    // One parent, two athletes: one email.
    const parent = await makeGuardianFor(kidA.id, "Parent");
    await db.insert(guardianLinks).values({ athleteId: kidB.id, guardianId: parent.id });
    const stranger = await makeLoginableUser({ role: "athlete", name: "Stranger", dateOfBirth: isoYearsAgo(25) });
    await db.insert(coachAthletes).values([
      { coachId: coach.id, athleteId: adult.id },
      { coachId: coach.id, athleteId: kidA.id },
      { coachId: coach.id, athleteId: kidB.id },
      { coachId: otherCoach.id, athleteId: stranger.id },
    ]);

    const client = await loginAs(server.baseUrl, coach);
    const count = await client.get("/api/coach/legal-documents/email-roster/recipients");
    expect(count.status).toBe(200);
    expect(count.body).toEqual({ athletes: 3, recipients: 2, athletesWithoutAddress: 0 });

    const res = await client.post("/api/coach/legal-documents/privacy_policy/email-roster");
    expect(res.status).toBe(200);
    expect(res.body.recipients).toBe(2);
    expect(res.body.emailed).toBe(2);
    expect(res.body.failed).toBe(0);
    expect(res.body.notConfigured).toBe(false);

    const to = testOutbox.map((m) => m.to).sort();
    expect(to).toEqual([adult.email, parent.email].sort());
    expect(to).not.toContain(stranger.email);
    expect(to).not.toContain(kidA.email);

    const toParent = testOutbox.find((m) => m.to === parent.email)!;
    expect(toParent.subject).toContain("Privacy Policy");
    expect(toParent.html).toContain("Coach Rivera");
    expect(toParent.html).toContain("/privacy");
    expect(toParent.html).toContain("/api/legal-documents/privacy_policy.pdf");
    // A link, never the text pasted in: a copy in an inbox is the one nobody can correct.
    expect(toParent.html).not.toContain("Privacy Policy body for the test.");
  });

  it("respects per-team narrowing for a staff coach, and a primary coach sends to everyone", async () => {
    const primary = await makeLoginableUser({ role: "coach", name: "Primary" });
    const staff = await makeLoginableUser({ role: "coach", name: "Staff" });
    await db.insert(coachStaff).values({ primaryCoachId: primary.id, staffCoachId: staff.id });
    const varsityAthlete = await makeLoginableUser({ role: "athlete", name: "Varsity", dateOfBirth: isoYearsAgo(18) });
    const jvAthlete = await makeLoginableUser({ role: "athlete", name: "JV", dateOfBirth: isoYearsAgo(18) });
    await db.insert(coachAthletes).values([
      { coachId: primary.id, athleteId: varsityAthlete.id },
      { coachId: primary.id, athleteId: jvAthlete.id },
    ]);
    const [varsity] = await db.insert(teams).values({ coachId: primary.id, name: "Varsity", code: "VARS01" }).returning();
    const [jv] = await db.insert(teams).values({ coachId: primary.id, name: "JV", code: "JVJV01" }).returning();
    await db.insert(teamMembers).values([
      { teamId: varsity.id, athleteId: varsityAthlete.id },
      { teamId: jv.id, athleteId: jvAthlete.id },
    ]);
    const primaryClient = await loginAs(server.baseUrl, primary);
    const assign = await primaryClient.put(`/api/coach/teams/${varsity.id}/coaches`, { coachIds: [staff.id] });
    expect(assign.status).toBe(200);

    const staffClient = await loginAs(server.baseUrl, staff);
    const staffSend = await staffClient.post("/api/coach/legal-documents/privacy_policy/email-roster");
    expect(staffSend.status).toBe(200);
    expect(staffSend.body.emailed).toBe(1);
    expect(testOutbox.map((m) => m.to)).toEqual([varsityAthlete.email]);

    testOutbox.length = 0;
    const primarySend = await primaryClient.post("/api/coach/legal-documents/privacy_policy/email-roster");
    expect(primarySend.body.emailed).toBe(2);
    expect(testOutbox.map((m) => m.to).sort()).toEqual([jvAthlete.email, varsityAthlete.email].sort());
  });

  it("is a coach's control: an athlete gets 403", async () => {
    const athlete = await makeLoginableUser({ role: "athlete" });
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.post("/api/coach/legal-documents/privacy_policy/email-roster");
    expect(res.status).toBe(403);
  });
});
