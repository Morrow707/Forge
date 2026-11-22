import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { calendarEvents, calendarImports, coachAthletes, coachStaff, teamCoaches, teamMembers, teams } from "@shared/schema";
import { db } from "./db";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestClient, type TestServer } from "./test-support/http-app";
import { setCalendarFetchDepsForTest } from "./calendar-events";
import type { Resolver, Transport } from "./calendar-fetch";

/* CALENDAR EVENTS AND CALENDAR SYNC ON REAL POSTGRES (2026-11-22).
 *   - a coach's team event shows on that team's athlete and not on another team's athlete;
 *   - a held athlete still sees their team's events (a hold keeps the team membership);
 *   - a staff coach narrowed to one team is refused an event on a team outside it;
 *   - a personal event is the creator's only, and only the creator or the team's primary edits;
 *   - a pasted calendar is read through a fake fetch (no network), its address stored ENCRYPTED
 *     and never returned, its events shown read-only, shared to a team by a coach, and an address
 *     that resolves to a private network is refused with nothing saved. */

const OK = 200;
const CREATED = 201;
const NO_CONTENT = 204;
const BAD_REQUEST = 400;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const PUBLIC_IP = "93.184.216.34";
const PRIVATE_IP = "10.0.0.7";
const IPV4 = 4;
const ISO_DATE_LENGTH = 10;
const EVENTS_IN_FEED = 2;
const FEED_URL = "webcal://calendar.test/athletics/secret-token-123.ics";
const RANGE = "start=2026-12-01&end=2026-12-31";

const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "X-WR-CALNAME:School Athletics",
  "BEGIN:VEVENT",
  "UID:game-1@school",
  "DTSTART;TZID=America/New_York:20261212T190000",
  "DURATION:PT2H",
  "SUMMARY:Varsity vs. Central",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:break@school",
  "DTSTART;VALUE=DATE:20261221",
  "SUMMARY:Winter break begins",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const resolver: Resolver = async (host) => [{ address: host === "internal.test" ? PRIVATE_IP : PUBLIC_IP, family: IPV4 }];
let fetched: string[] = [];
const transport: Transport = async ({ url }) => {
  fetched.push(url.toString());
  return { status: OK, location: null, body: ICS };
};

let server: TestServer;
let head: Awaited<ReturnType<typeof makeLoginableUser>>;
let staff: Awaited<ReturnType<typeof makeLoginableUser>>;
let athleteA: Awaited<ReturnType<typeof makeLoginableUser>>;
let athleteB: Awaited<ReturnType<typeof makeLoginableUser>>;
let headClient: TestClient;
let staffClient: TestClient;
let aClient: TestClient;
let bClient: TestClient;
let teamA: number;
let teamB: number;

const event = (overrides: Record<string, unknown> = {}) => ({
  title: "Home game",
  label: "game",
  color: "red",
  date: "2026-12-05",
  startTime: "15:30",
  endTime: "17:00",
  location: "Main gym",
  ...overrides,
});

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
  head = await makeLoginableUser({ role: "coach", name: "Head Coach" } as never);
  staff = await makeLoginableUser({ role: "coach", name: "Position Coach" } as never);
  athleteA = await makeLoginableUser({ role: "athlete", name: "Avery Team-A" } as never);
  athleteB = await makeLoginableUser({ role: "athlete", name: "Blake Team-B" } as never);
  [headClient, staffClient, aClient, bClient] = await Promise.all([head, staff, athleteA, athleteB].map((u) => loginAs(server.baseUrl, u)));
  await db.insert(coachStaff).values({ primaryCoachId: head.id, staffCoachId: staff.id });
  [{ id: teamA }, { id: teamB }] = await db.insert(teams).values([{ coachId: head.id, name: "Varsity" }, { coachId: head.id, name: "JV" }]).returning();
  await db.insert(teamCoaches).values({ teamId: teamA, coachId: staff.id });
  // Athlete A is HELD for the off season; the team membership stays.
  await db.insert(coachAthletes).values([{ coachId: head.id, athleteId: athleteA.id, heldAt: new Date() }, { coachId: head.id, athleteId: athleteB.id }]);
  await db.insert(teamMembers).values([{ teamId: teamA, athleteId: athleteA.id }, { teamId: teamB, athleteId: athleteB.id }]);
  setCalendarFetchDepsForTest({ resolve: resolver, transport });
});

afterAll(async () => {
  setCalendarFetchDepsForTest({});
  await server.close();
});

beforeEach(async () => {
  await db.delete(calendarEvents);
  await db.delete(calendarImports);
  fetched = [];
});

const titles = (body: { title: string }[]) => body.map((e) => e.title).sort();

describe("calendar events", () => {
  it("puts a team event on that team's athletes, a held one included, and not on another team's", async () => {
    const res = await headClient.request("POST", "/api/calendar-events", { body: event({ teamId: teamA, date: "2026-12-12" }) });
    expect(res.status).toBe(CREATED);
    const a = await aClient.request("GET", `/api/calendar-events?${RANGE}`);
    expect(a.status).toBe(OK);
    expect(titles(a.body)).toEqual(["Home game"]);
    expect(a.body[0]).toMatchObject({ teamName: "Varsity", canEdit: false, startTime: "15:30", source: "forge" });
    expect((await bClient.request("GET", `/api/calendar-events?${RANGE}`)).body).toEqual([]);
    // The narrowed staff coach can see Varsity, so they see it too.
    expect(titles((await staffClient.request("GET", `/api/calendar-events?${RANGE}`)).body)).toEqual(["Home game"]);
  });

  it("refuses a narrowed staff coach an event on a team outside their assignment", async () => {
    const outside = await staffClient.request("POST", "/api/calendar-events", { body: event({ teamId: teamB }) });
    expect(outside.status).toBe(FORBIDDEN);
    const inside = await staffClient.request("POST", "/api/calendar-events", { body: event({ teamId: teamA }) });
    expect(inside.status).toBe(CREATED);
  });

  it("refuses an athlete a team event and keeps their personal event their own", async () => {
    expect((await aClient.request("POST", "/api/calendar-events", { body: event({ teamId: teamA }) })).status).toBe(FORBIDDEN);
    const mine = await aClient.request("POST", "/api/calendar-events", { body: event({ title: "Dentist", label: "other", customLabel: "Appointment", color: "slate", startTime: null, endTime: null }) });
    expect(mine.status).toBe(CREATED);
    const own = (await aClient.request("GET", `/api/calendar-events?${RANGE}`)).body;
    expect(own[0]).toMatchObject({ title: "Dentist", customLabel: "Appointment", allDay: true, canEdit: true });
    expect((await headClient.request("GET", `/api/calendar-events?${RANGE}`)).body).toEqual([]);
    expect((await headClient.request("DELETE", `/api/calendar-events/${mine.body.id}`)).status).toBe(NOT_FOUND);
  });

  it("lets the creator and the team's primary coach edit a team event, and nobody else", async () => {
    const made = await staffClient.request("POST", "/api/calendar-events", { body: event({ teamId: teamA }) });
    const patch = event({ teamId: teamA, title: "Home game (moved)" });
    expect((await aClient.request("PATCH", `/api/calendar-events/${made.body.id}`, { body: patch })).status).toBe(NOT_FOUND);
    expect((await headClient.request("PATCH", `/api/calendar-events/${made.body.id}`, { body: patch })).status).toBe(OK);
    expect((await staffClient.request("DELETE", `/api/calendar-events/${made.body.id}`)).status).toBe(NO_CONTENT);
  });

  it("refuses an end before the start and a malformed time", async () => {
    expect((await aClient.request("POST", "/api/calendar-events", { body: event({ startTime: "17:00", endTime: "15:00" }) })).status).toBe(BAD_REQUEST);
    expect((await aClient.request("POST", "/api/calendar-events", { body: event({ startTime: "7pm" }) })).status).toBe(BAD_REQUEST);
  });

  it("puts the person's events in the subscribe feed", async () => {
    await headClient.request("POST", "/api/calendar-events", { body: event({ teamId: teamA, date: new Date().toISOString().slice(0, ISO_DATE_LENGTH) }) });
    const link = await aClient.request("GET", "/api/athlete/calendar-link");
    const feed = await fetch(`${server.baseUrl}/api/calendar/${link.body.token}.ics`);
    const text = await feed.text();
    expect(text).toContain("SUMMARY:Home game");
    expect(text).toContain("LOCATION:Main gym");
  });

  it("keeps a coached athlete's personal events out of the feed, because their coach holds its link", async () => {
    const today = new Date().toISOString().slice(0, ISO_DATE_LENGTH);
    await headClient.request("POST", "/api/calendar-events", { body: event({ teamId: teamA, date: today }) });
    await aClient.request("POST", "/api/calendar-events", { body: event({ title: "Dentist", date: today }) });
    const link = await aClient.request("GET", "/api/athlete/calendar-link");
    const text = await (await fetch(`${server.baseUrl}/api/calendar/${link.body.token}.ics`)).text();
    expect(text).toContain("SUMMARY:Home game");
    expect(text).not.toContain("SUMMARY:Dentist");
  });
});

describe("pasted calendars", () => {
  it("reads the calendar, stores the address encrypted, never returns it, and shows its events read-only", async () => {
    const res = await aClient.request("POST", "/api/calendar-imports", { body: { url: FEED_URL, color: "teal" } });
    expect(res.status).toBe(CREATED);
    expect(fetched).toEqual(["https://calendar.test/athletics/secret-token-123.ics"]);
    expect(res.body).toMatchObject({ name: "School Athletics", host: "calendar.test", eventCount: EVENTS_IN_FEED });
    expect(JSON.stringify(res.body)).not.toContain("secret-token-123");

    const [row] = await db.select().from(calendarImports).where(eq(calendarImports.id, res.body.id));
    expect(row.urlEncrypted.startsWith("v1:")).toBe(true);
    expect(row.urlEncrypted).not.toContain("secret-token-123");

    const list = await aClient.request("GET", "/api/calendar-imports");
    expect(JSON.stringify(list.body)).not.toContain("secret-token-123");

    const events = (await aClient.request("GET", `/api/calendar-events?${RANGE}`)).body;
    const game = events.find((e: { title: string }) => e.title === "Varsity vs. Central");
    expect(game).toMatchObject({ source: "imported", canEdit: false, color: "teal", calendarName: "School Athletics", startsAt: "2026-12-13T00:00:00.000Z" });
    expect(events.find((e: { title: string }) => e.title === "Winter break begins")).toMatchObject({ allDay: true, date: "2026-12-21" });
  });

  it("refuses an address that resolves to a private network, and saves nothing", async () => {
    const res = await aClient.request("POST", "/api/calendar-imports", { body: { url: "https://internal.test/cal.ics" } });
    expect(res.status).toBe(BAD_REQUEST);
    expect(res.body.message).toContain("private network");
    expect(fetched).toEqual([]);
    expect(await db.select().from(calendarImports)).toEqual([]);
  });

  it("lets a coach share a calendar to a team their athletes then see, and refuses an athlete sharing one", async () => {
    expect((await aClient.request("POST", "/api/calendar-imports", { body: { url: FEED_URL, teamId: teamA } })).status).toBe(FORBIDDEN);
    const shared = await headClient.request("POST", "/api/calendar-imports", { body: { url: FEED_URL, teamId: teamA, name: "Athletics" } });
    expect(shared.status).toBe(CREATED);
    expect(titles((await aClient.request("GET", `/api/calendar-events?${RANGE}`)).body)).toEqual(["Varsity vs. Central", "Winter break begins"]);
    expect((await bClient.request("GET", `/api/calendar-events?${RANGE}`)).body).toEqual([]);
    // Only the owner can remove it; the athlete it was shared with cannot.
    expect((await aClient.request("DELETE", `/api/calendar-imports/${shared.body.id}`)).status).toBe(NOT_FOUND);
    expect((await headClient.request("DELETE", `/api/calendar-imports/${shared.body.id}`)).status).toBe(NO_CONTENT);
    expect((await aClient.request("GET", `/api/calendar-events?${RANGE}`)).body).toEqual([]);
  });

  it("never puts an imported event in the outbound feed", async () => {
    await aClient.request("POST", "/api/calendar-imports", { body: { url: FEED_URL } });
    const link = await aClient.request("GET", "/api/athlete/calendar-link");
    const text = await (await fetch(`${server.baseUrl}/api/calendar/${link.body.token}.ics`)).text();
    expect(text).not.toContain("Varsity vs. Central");
  });
});
