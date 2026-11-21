import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  coachAthleteMessageReads,
  coachAthleteMessages,
  coachAthletes,
  coachStaff,
  guardianLinks,
  notifications,
  teamCoaches,
  teamMembers,
  teamPosts,
  teams,
  users,
} from "@shared/schema";
import { db } from "./db";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestClient, type TestServer } from "./test-support/http-app";

/* COACH <-> ATHLETE MESSAGING ON REAL POSTGRES, THROUGH THE REAL ROUTES (2026-11-21).
 *
 * Scott: "i want 0, absolute 0 communication between users when they aren't being coached." So a
 * message exists only between a coach and an athlete that coach currently coaches:
 *   - a coach messages their own athlete, the athlete reads it and answers, both are notified;
 *   - a coach from another program, a staff coach narrowed to other teams, a Free Agent, and an
 *     athlete addressing a teammate (a forged recipient id) are all refused, and nothing is written;
 *   - a parked (held) athlete's thread reads both ways and takes no new message from either side;
 *   - a thread whose athlete left the roster is read-only for both;
 *   - a minor's guardian reads every thread (removed messages included) and writes nothing; a
 *     guardian of somebody else's child reads nothing, and an adult's guardian link reads nothing;
 *   - a private reply to a coach's Team Board post lands in the thread, never on the board.
 *
 * Nine logins for the whole file, made once: the login limiter allows fifteen per window per
 * process, and every case below changes the ROSTER rather than the cast. */

const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const MINOR_AGE = 15;
const ADULT_AGE = 24;
const OVER_LIMIT = 2001;
const THREE_MESSAGES = 3;
const ISO_DATE_LENGTH = 10;

const isoYearsAgo = (years: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, ISO_DATE_LENGTH);
};

type User = Awaited<ReturnType<typeof makeLoginableUser>>;
let server: TestServer;
let coach: User, staff: User, outsider: User, minor: User, adult: User, freeAgent: User, parent: User, otherParent: User, admin: User, otherKid: User;
let c: Record<"coach" | "staff" | "outsider" | "minor" | "adult" | "freeAgent" | "parent" | "otherParent" | "admin", TestClient>;
let teamA: number, teamB: number;

async function seatEveryone() {
  await db.delete(coachAthletes);
  await db.delete(teamMembers);
  await db.insert(coachAthletes).values([
    { coachId: coach.id, athleteId: minor.id },
    { coachId: coach.id, athleteId: adult.id },
  ]);
  await db.insert(teamMembers).values([
    { teamId: teamA, athleteId: minor.id },
    { teamId: teamB, athleteId: adult.id },
  ]);
}

async function messagesInDb() {
  return db.select().from(coachAthleteMessages);
}

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
  coach = await makeLoginableUser({ role: "coach", name: "Coach Rivera" });
  staff = await makeLoginableUser({ role: "coach", name: "Coach Assistant" });
  outsider = await makeLoginableUser({ role: "coach", name: "Other Program" });
  minor = await makeLoginableUser({ role: "athlete", name: "Jamie Minor", dateOfBirth: isoYearsAgo(MINOR_AGE) });
  adult = await makeLoginableUser({ role: "athlete", name: "Alex Adult", dateOfBirth: isoYearsAgo(ADULT_AGE) });
  freeAgent = await makeLoginableUser({ role: "athlete", name: "Morgan Free" });
  parent = await makeLoginableUser({ role: "guardian", name: "Pat Parent" });
  otherParent = await makeLoginableUser({ role: "guardian", name: "Sam Elsewhere" });
  admin = await makeLoginableUser({ role: "admin", name: "Audit Admin" });
  otherKid = await makeLoginableUser({ role: "athlete", name: "Other Kid", dateOfBirth: isoYearsAgo(MINOR_AGE) });
  await db.insert(guardianLinks).values([
    { athleteId: minor.id, guardianId: parent.id },
    { athleteId: otherKid.id, guardianId: otherParent.id },
  ]);
  await db.insert(coachStaff).values({ primaryCoachId: coach.id, staffCoachId: staff.id });
  [teamA, teamB] = (await db.insert(teams).values([{ coachId: coach.id, name: "Team A" }, { coachId: coach.id, name: "Team B" }]).returning()).map((t) => t.id);
  // The staff coach is narrowed to Team A: they coach the minor and not the adult.
  await db.insert(teamCoaches).values({ teamId: teamA, coachId: staff.id });
  const cast = { coach, staff, outsider, minor, adult, freeAgent, parent, otherParent, admin };
  const clients = await Promise.all(Object.values(cast).map((u) => loginAs(server.baseUrl, u)));
  c = Object.fromEntries(Object.keys(cast).map((k, i) => [k, clients[i]])) as typeof c;
});

afterAll(async () => {
  await server.close();
});

beforeEach(async () => {
  await db.delete(coachAthleteMessageReads);
  await db.delete(coachAthleteMessages);
  await db.delete(notifications);
  await db.delete(teamPosts);
  await seatEveryone();
});

describe("inside a coaching relationship", () => {
  it("a coach messages their athlete, the athlete reads it and answers, each is notified", async () => {
    const sent = await c.coach.post(`/api/coach/messages/${minor.id}`, { body: "Great session today." });
    expect(sent.status).toBe(CREATED);
    expect((await c.minor.get("/api/messages/unread")).body.unread).toBe(1);

    const list = await c.minor.get("/api/athlete/messages");
    expect(list.status).toBe(OK);
    expect(list.body.threads.map((t: { coachId: number }) => t.coachId).sort()).toEqual([coach.id, staff.id].sort());
    expect(list.body.threads.find((t: { coachId: number }) => t.coachId === coach.id)).toMatchObject({ unread: 1, state: "active" });

    const thread = await c.minor.get(`/api/athlete/messages/${coach.id}`);
    expect(thread.status).toBe(OK);
    expect(thread.body).toMatchObject({ state: "active", canSend: true, parentCanSee: true });
    expect(thread.body.messages).toEqual([expect.objectContaining({ body: "Great session today.", senderRole: "coach", fromMe: false })]);
    expect((await c.minor.get("/api/messages/unread")).body.unread, "opening the thread reads it").toBe(0);

    expect((await c.minor.post(`/api/athlete/messages/${coach.id}`, { body: "Thanks coach" })).status).toBe(CREATED);
    const coachView = await c.coach.get(`/api/coach/messages/${minor.id}`);
    expect(coachView.body.messages.map((m: { body: string }) => m.body)).toEqual(["Great session today.", "Thanks coach"]);

    const notes = await db.select().from(notifications).where(eq(notifications.type, "message"));
    expect(notes.map((n) => n.userId).sort()).toEqual([coach.id, minor.id].sort());
  });

  it("an adult athlete's thread says no parent can see it; a minor's says one can", async () => {
    expect((await c.coach.get(`/api/coach/messages/${adult.id}`)).body.parentCanSee).toBe(false);
    expect((await c.coach.get(`/api/coach/messages/${minor.id}`)).body.parentCanSee).toBe(true);
  });

  it("an assigned staff coach messages an athlete on their team", async () => {
    expect((await c.staff.post(`/api/coach/messages/${minor.id}`, { body: "From the assistant" })).status).toBe(CREATED);
  });

  it("refuses an empty message and one over 2000 characters", async () => {
    expect((await c.coach.post(`/api/coach/messages/${minor.id}`, { body: "   " })).status).toBe(BAD_REQUEST);
    expect((await c.coach.post(`/api/coach/messages/${minor.id}`, { body: "x".repeat(OVER_LIMIT) })).status).toBe(BAD_REQUEST);
    expect(await messagesInDb()).toHaveLength(0);
  });
});

describe("outside one, nothing is sent and nothing is read", () => {
  it("a coach from another program cannot message or read the athlete", async () => {
    expect((await c.outsider.post(`/api/coach/messages/${minor.id}`, { body: "hi" })).status).toBe(NOT_FOUND);
    expect((await c.outsider.get(`/api/coach/messages/${minor.id}`)).status).toBe(NOT_FOUND);
    expect((await c.outsider.get("/api/coach/messages")).body.threads).toEqual([]);
    expect(await messagesInDb()).toHaveLength(0);
  });

  it("a staff coach narrowed to Team A cannot reach the athlete on Team B", async () => {
    expect((await c.staff.post(`/api/coach/messages/${adult.id}`, { body: "hi" })).status).toBe(NOT_FOUND);
    expect((await c.staff.get("/api/coach/messages")).body.threads.map((t: { athleteId: number }) => t.athleteId)).toEqual([minor.id]);
    expect((await c.adult.get("/api/athlete/messages")).body.threads.map((t: { coachId: number }) => t.coachId)).toEqual([coach.id]);
    expect(await messagesInDb()).toHaveLength(0);
  });

  it("an athlete cannot address a teammate: a forged recipient id is refused and no route takes one", async () => {
    expect((await c.minor.post(`/api/athlete/messages/${adult.id}`, { body: "hey teammate" })).status).toBe(NOT_FOUND);
    expect((await c.minor.post(`/api/coach/messages/${adult.id}`, { body: "hey teammate" })).status).toBe(FORBIDDEN);
    expect((await c.minor.get(`/api/athlete/messages/${adult.id}`)).status).toBe(NOT_FOUND);
    expect(await messagesInDb()).toHaveLength(0);
  });

  it("a roster row naming an ATHLETE as the coach still makes no coach: two athletes never talk", async () => {
    // Belt to the scope's braces: the relationship needs a coach row AND an athlete row, so even a
    // corrupt seat between two athletes opens nothing.
    await db.insert(coachAthletes).values({ coachId: adult.id, athleteId: freeAgent.id });
    expect((await c.freeAgent.post(`/api/athlete/messages/${adult.id}`, { body: "hi" })).status).toBe(NOT_FOUND);
    expect((await c.freeAgent.get("/api/athlete/messages")).body.threads).toEqual([]);
    expect(await messagesInDb()).toHaveLength(0);
  });

  it("a Free Agent has no coach, so nobody to message and nothing listed", async () => {
    expect((await c.freeAgent.post(`/api/athlete/messages/${coach.id}`, { body: "hello?" })).status).toBe(NOT_FOUND);
    expect((await c.freeAgent.get("/api/athlete/messages")).body.threads).toEqual([]);
    expect((await c.coach.post(`/api/coach/messages/${freeAgent.id}`, { body: "join us" })).status).toBe(NOT_FOUND);
    expect(await messagesInDb()).toHaveLength(0);
  });
});

describe("when the relationship changes", () => {
  it("a held athlete reads every old message, and neither side sends a new one", async () => {
    await c.coach.post(`/api/coach/messages/${minor.id}`, { body: "Before the off season" });
    await db.update(coachAthletes).set({ heldAt: new Date(), heldUntil: "2027-08-01" }).where(eq(coachAthletes.athleteId, minor.id));

    const athleteView = await c.minor.get(`/api/athlete/messages/${coach.id}`);
    expect(athleteView.status).toBe(OK);
    expect(athleteView.body).toMatchObject({ state: "held", canSend: false, heldUntil: "2027-08-01" });
    expect(athleteView.body.messages.map((m: { body: string }) => m.body)).toEqual(["Before the off season"]);
    expect((await c.coach.get(`/api/coach/messages/${minor.id}`)).body.messages).toHaveLength(1);

    const coachSend = await c.coach.post(`/api/coach/messages/${minor.id}`, { body: "new" });
    expect(coachSend.status).toBe(FORBIDDEN);
    expect(coachSend.body.message).toContain("on hold");
    expect((await c.minor.post(`/api/athlete/messages/${coach.id}`, { body: "new" })).status).toBe(FORBIDDEN);
    expect(await messagesInDb()).toHaveLength(1);
  });

  it("an athlete removed from the roster leaves a read-only thread for both", async () => {
    await c.coach.post(`/api/coach/messages/${minor.id}`, { body: "Good luck next season" });
    await db.delete(coachAthletes).where(and(eq(coachAthletes.coachId, coach.id), eq(coachAthletes.athleteId, minor.id)));
    await db.delete(teamMembers).where(eq(teamMembers.athleteId, minor.id));

    const coachView = await c.coach.get(`/api/coach/messages/${minor.id}`);
    expect(coachView.status).toBe(OK);
    expect(coachView.body).toMatchObject({ state: "ended", canSend: false });
    expect((await c.minor.get(`/api/athlete/messages/${coach.id}`)).body.state).toBe("ended");
    expect((await c.coach.post(`/api/coach/messages/${minor.id}`, { body: "again" })).status).toBe(FORBIDDEN);
    expect((await c.minor.post(`/api/athlete/messages/${coach.id}`, { body: "again" })).status).toBe(FORBIDDEN);
    // The assistant never wrote to them, so there is no thread to keep for that pair.
    expect((await c.staff.get(`/api/coach/messages/${minor.id}`)).status).toBe(NOT_FOUND);
    expect(await messagesInDb()).toHaveLength(1);
  });
});

describe("a minor's guardian reads; nobody else's does", () => {
  it("the guardian reads every thread, removed messages included, and writes nothing", async () => {
    await c.coach.post(`/api/coach/messages/${minor.id}`, { body: "Practice moved to 4" });
    const reply = await c.minor.post(`/api/athlete/messages/${coach.id}`, { body: "ok but I forgot" });
    expect((await c.minor.post(`/api/messages/${reply.body.id}/remove`)).status).toBe(NO_CONTENT);
    await c.staff.post(`/api/coach/messages/${minor.id}`, { body: "Bring your shoes" });

    const read = await c.parent.get(`/api/guardian/athletes/${minor.id}/messages`);
    expect(read.status).toBe(OK);
    const byCoach = Object.fromEntries(read.body.threads.map((t: { coachId: number; messages: Array<{ body: string; removed: boolean }> }) => [t.coachId, t.messages]));
    expect(byCoach[coach.id].map((m: { body: string; removed: boolean }) => [m.body, m.removed])).toEqual([["Practice moved to 4", false], ["ok but I forgot", true]]);
    expect(byCoach[staff.id].map((m: { body: string }) => m.body)).toEqual(["Bring your shoes"]);

    expect((await c.parent.post(`/api/athlete/messages/${coach.id}`, { body: "parent here" })).status).toBe(FORBIDDEN);
    expect((await c.parent.post(`/api/coach/messages/${minor.id}`, { body: "parent here" })).status).toBe(FORBIDDEN);
    expect(await messagesInDb()).toHaveLength(THREE_MESSAGES);
    const guardianNotes = await db.select().from(notifications).where(eq(notifications.userId, parent.id));
    expect(guardianNotes, "a guardian reads; they are not notified per message").toEqual([]);
  });

  it("a guardian of another child reads nothing, and an adult's guardian link reads nothing", async () => {
    await c.coach.post(`/api/coach/messages/${minor.id}`, { body: "private" });
    expect((await c.otherParent.get(`/api/guardian/athletes/${minor.id}/messages`)).status).toBe(NOT_FOUND);
    await db.update(users).set({ dateOfBirth: isoYearsAgo(ADULT_AGE) }).where(eq(users.id, otherKid.id));
    expect((await c.otherParent.get(`/api/guardian/athletes/${otherKid.id}/messages`)).status).toBe(FORBIDDEN);
  });
});

describe("removing a message and the audit", () => {
  it("the other party sees only that a message was removed; the sender and an admin audit see it", async () => {
    const sent = await c.minor.post(`/api/athlete/messages/${coach.id}`, { body: "something I regret" });
    expect((await c.coach.post(`/api/messages/${sent.body.id}/remove`)).status, "only the sender removes").toBe(NOT_FOUND);
    expect((await c.minor.post(`/api/messages/${sent.body.id}/remove`)).status).toBe(NO_CONTENT);

    expect((await c.coach.get(`/api/coach/messages/${minor.id}`)).body.messages[0]).toMatchObject({ body: null, removed: true });
    expect((await c.minor.get(`/api/athlete/messages/${coach.id}`)).body.messages[0]).toMatchObject({ body: "something I regret", removed: true });
    const audit = await c.admin.get(`/api/admin/coach-messages/${coach.id}/${minor.id}`);
    expect(audit.status).toBe(OK);
    expect(audit.body.messages[0]).toMatchObject({ body: "something I regret", removed: true });
    expect(JSON.stringify(audit.body), "the audit carries no names").not.toContain("Jamie");
    expect((await c.coach.get(`/api/admin/coach-messages/${coach.id}/${minor.id}`)).status).toBe(FORBIDDEN);
  });
});

describe("team announcements stay on the board; the reply goes private", () => {
  it("an athlete answers a coach's board post privately, and a teammate never sees it", async () => {
    const [post] = await db.insert(teamPosts).values({ coachId: coach.id, authorId: coach.id, body: "Lift at 6am Friday", isAnnouncement: true }).returning();
    const reply = await c.minor.post(`/api/athlete/messages/${coach.id}`, { body: "I have a test then", teamPostId: post.id });
    expect(reply.status).toBe(CREATED);
    const thread = await c.coach.get(`/api/coach/messages/${minor.id}`);
    expect(thread.body.messages[0]).toMatchObject({ body: "I have a test then", replyTo: { teamPostId: post.id, body: "Lift at 6am Friday" } });

    const teammateThread = await c.adult.get(`/api/athlete/messages/${coach.id}`);
    expect(teammateThread.body.messages).toEqual([]);
    const board = await c.adult.get("/api/athlete/team-board");
    expect(board.body.map((p: { body: string }) => p.body)).toEqual(["Lift at 6am Friday"]);
  });

  it("a reply may only answer a post this coach wrote on the athlete's own board", async () => {
    const [teammatePost] = await db.insert(teamPosts).values({ coachId: coach.id, authorId: adult.id, body: "anyone lifting?" }).returning();
    const [otherBoard] = await db.insert(teamPosts).values({ coachId: outsider.id, authorId: outsider.id, body: "elsewhere" }).returning();
    expect((await c.minor.post(`/api/athlete/messages/${coach.id}`, { body: "re", teamPostId: teammatePost.id })).status).toBe(BAD_REQUEST);
    expect((await c.minor.post(`/api/athlete/messages/${coach.id}`, { body: "re", teamPostId: otherBoard.id })).status).toBe(BAD_REQUEST);
    expect(await messagesInDb()).toHaveLength(0);
  });
});
