import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { calendarEvents, coachAthletes, teamMembers, teams } from "@shared/schema";
import { db } from "./db";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestClient, type TestServer } from "./test-support/http-app";
import { setCalendarFetchDepsForTest } from "./calendar-events";
import type { Resolver, Transport } from "./calendar-fetch";

/* SEASON SETUP READS THE GAMES OFF THE CALENDAR, ON REAL POSTGRES (2026-11-22).
 *   - a coach sees the games on their own calendar: a team game, their own game, a game on a
 *     calendar they pasted in; never a practice titled like a game;
 *   - naming athletes narrows team games to those athletes' teams;
 *   - an athlete's personal event, another coach's game and a calendar an athlete pasted in for
 *     themselves never reach a coach;
 *   - the earliest and latest game come back, and a coached athlete is refused the read. */

const OK = 200;
const CREATED = 201;
const FORBIDDEN = 403;
const PUBLIC_IP = "93.184.216.34";
const IPV4 = 4;
const START = "2026-11-22";
const GAMES_ON_HEAD_CALENDAR = 4;

const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "X-WR-CALNAME:School Athletics",
  "BEGIN:VEVENT",
  "UID:game-1@school",
  "DTSTART;VALUE=DATE:20270115",
  "SUMMARY:Varsity vs. Central",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:break@school",
  "DTSTART;VALUE=DATE:20261221",
  "SUMMARY:Winter break begins",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const ATHLETE_ICS = ICS.replace("Varsity vs. Central", "Club game @ Riverside").replace("game-1@school", "club@me");

const resolver: Resolver = async () => [{ address: PUBLIC_IP, family: IPV4 }];
const transport: Transport = async ({ url }) => ({ status: OK, location: null, body: url.toString().includes("mine") ? ATHLETE_ICS : ICS });

let server: TestServer;
let headClient: TestClient;
let otherClient: TestClient;
let aClient: TestClient;
let head: Awaited<ReturnType<typeof makeLoginableUser>>;
let athleteA: Awaited<ReturnType<typeof makeLoginableUser>>;
let athleteB: Awaited<ReturnType<typeof makeLoginableUser>>;

type GamesBody = { games: { date: string; title: string }[]; firstGameDate: string | null; lastGameDate: string | null; count: number };
const titles = (b: GamesBody) => b.games.map((g) => g.title).sort();

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
  head = await makeLoginableUser({ role: "coach", name: "Head Coach" } as never);
  const other = await makeLoginableUser({ role: "coach", name: "Other Coach" } as never);
  athleteA = await makeLoginableUser({ role: "athlete", name: "Avery Varsity" } as never);
  athleteB = await makeLoginableUser({ role: "athlete", name: "Blake JV" } as never);
  [headClient, otherClient, aClient] = await Promise.all([head, other, athleteA].map((u) => loginAs(server.baseUrl, u)));
  const [{ id: varsity }, { id: jv }] = await db
    .insert(teams)
    .values([{ coachId: head.id, name: "Varsity" }, { coachId: head.id, name: "JV" }])
    .returning();
  await db.insert(coachAthletes).values([{ coachId: head.id, athleteId: athleteA.id }, { coachId: head.id, athleteId: athleteB.id }]);
  await db.insert(teamMembers).values([{ teamId: varsity, athleteId: athleteA.id }, { teamId: jv, athleteId: athleteB.id }]);
  setCalendarFetchDepsForTest({ resolve: resolver, transport });

  const ev = (createdBy: number, values: Record<string, unknown>) =>
    db.insert(calendarEvents).values({ createdBy, color: "red", label: "game", ...values } as never);
  await ev(head.id, { title: "Season opener", date: "2026-12-04", teamId: varsity });
  await ev(head.id, { title: "JV opener", date: "2026-12-03", teamId: jv });
  await ev(head.id, { title: "Booster game night", date: "2027-02-12", teamId: null });
  await ev(head.id, { title: "vs Central walkthrough", label: "practice", date: "2026-12-10", teamId: varsity });
  await ev(athleteA.id, { title: "Club vs Eastside", date: "2026-12-06", teamId: null });
  await ev(other.id, { title: "Rival opener", date: "2026-12-01", teamId: null });

  // The head coach pastes in the school calendar for themselves; athlete A pastes in their club's.
  const imported = await headClient.request("POST", "/api/calendar-imports", { body: { url: "https://calendar.test/school.ics" } });
  expect(imported.status).toBe(CREATED);
  const mine = await aClient.request("POST", "/api/calendar-imports", { body: { url: "https://calendar.test/mine.ics" } });
  expect(mine.status).toBe(CREATED);
});

afterAll(async () => {
  setCalendarFetchDepsForTest({});
  await server.close();
});

describe("GET /api/season-setup/games", () => {
  it("finds the games on the coach's own calendar and nothing that is not theirs or not a game", async () => {
    const res = await headClient.request("GET", `/api/season-setup/games?start=${START}`);
    expect(res.status).toBe(OK);
    expect(titles(res.body)).toEqual(["Booster game night", "JV opener", "Season opener", "Varsity vs. Central"]);
    expect(res.body).toMatchObject({ firstGameDate: "2026-12-03", lastGameDate: "2027-02-12", count: GAMES_ON_HEAD_CALENDAR });
  });

  it("narrows team games to the teams of the athletes being assigned", async () => {
    const res = await headClient.request("GET", `/api/season-setup/games?start=${START}&athleteIds=${athleteA.id}`);
    expect(res.status).toBe(OK);
    expect(titles(res.body)).toEqual(["Booster game night", "Season opener", "Varsity vs. Central"]);
    expect(res.body.firstGameDate).toBe("2026-12-04");
  });

  it("ignores an athlete id that is not on the coach's roster", async () => {
    const res = await otherClient.request("GET", `/api/season-setup/games?start=${START}&athleteIds=${athleteA.id}`);
    expect(res.status).toBe(OK);
    expect(titles(res.body)).toEqual(["Rival opener"]);
  });

  it("never shows an athlete's personal event or pasted calendar to their coach", async () => {
    const res = await headClient.request("GET", `/api/season-setup/games?start=${START}&athleteIds=${athleteA.id},${athleteB.id}`);
    const all = titles(res.body);
    expect(all).not.toContain("Club vs Eastside");
    expect(all).not.toContain("Club game @ Riverside");
  });

  it("refuses a coached athlete, whose coach sets up their programs", async () => {
    expect((await aClient.request("GET", `/api/season-setup/games?start=${START}`)).status).toBe(FORBIDDEN);
  });
});
