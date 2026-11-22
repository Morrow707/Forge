import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { makeAssignedProgram, makeAthlete, makeExercise, resetDatabase } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/**
 * ONE SEARCH FINDS EVERYTHING, ON REAL ROWS (2026-11-22).
 *
 * Scott: warm-up, joint-care and return-to-training drills live in the ordinary library and one
 * search finds them. The pure scorers are tested in shared/; this drives the program list routes'
 * `?q=` against programs saved through the real create and update routes, the exercise tags through
 * the real exercise route, and that a twelve-year-old is offered the whole library.
 */
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

const OK = 200;
const CREATED = 201;
const FIRST_NON_SUCCESS = 300;
const BAD_REQUEST = 400;
/** Scott's own example: "a 12 year old can back squat the bar". */
const YOUNG = 12;
const PROGRAMS_MADE = 4;
const LIBRARY_SIZE = 3;

const thisYear = new Date().getUTCFullYear();
/** A date of birth that is this many whole years ago today (born on 1 January). */
const bornYearsAgo = (years: number) => `${thisYear - years}-01-01`;

const emptyProgram = (name: string, tags: Record<string, unknown> = {}) => ({ name, weeks: [], ...tags });

describe("the program list routes search by name, sport and tags", () => {
  async function coachWithPrograms() {
    const coach = await makeLoginableUser({ role: "coach" });
    const client = await loginAs(server.baseUrl, coach);
    const soccer = await client.post(
      "/api/coach/programs",
      emptyProgram("Speed Block", {
        sport: "Soccer",
        seasonPhase: "pre_season",
        positions: ["  Goalkeeper ", "goalkeeper"],
      }),
    );
    const knee = await client.post(
      "/api/coach/programs",
      emptyProgram("Back on the Field", { joints: ["knee"], purposes: ["return_to_training"] }),
    );
    const pitcher = await client.post(
      "/api/coach/programs",
      emptyProgram("Arm Care", { sport: "Baseball", positions: ["Pitcher"], joints: ["shoulder", "elbow"], purposes: ["care"] }),
    );
    const plain = await client.post("/api/coach/programs", emptyProgram("Hypertrophy Basics"));
    [soccer, knee, pitcher, plain].forEach((r) => expect(r.status).toBe(CREATED));
    return { coach, client, soccer: soccer.body, knee: knee.body, pitcher: pitcher.body, plain: plain.body };
  }

  const names = (body: { name: string }[]) => body.map((p) => p.name);

  it("saves the tags normalised: positions lower case and once each", async () => {
    const { client, soccer } = await coachWithPrograms();
    const detail = await client.get(`/api/coach/programs/${soccer.id}`);
    expect(detail.body.sport).toBe("Soccer");
    expect(detail.body.seasonPhase).toBe("pre_season");
    expect(detail.body.positions).toEqual(["goalkeeper"]);
  });

  // One sign-in for the whole table: the login limiter's budget is per file.
  it("each query finds the one program it names and nothing else", async () => {
    const { client } = await coachWithPrograms();
    const table: [string, string][] = [
      ["soccer preseason", "Speed Block"],
      ["soccer pre season", "Speed Block"],
      ["pitcher", "Arm Care"],
      ["knee return", "Back on the Field"],
      ["acl rehab", "Back on the Field"],
      ["rotator cuff", "Arm Care"],
      ["hypertrophy", "Hypertrophy Basics"],
    ];
    const results = await Promise.all(
      table.map(async ([q]) => client.get(`/api/coach/programs?q=${encodeURIComponent(q)}`)),
    );
    results.forEach((res, at) => {
      expect(res.status).toBe(OK);
      expect(names(res.body), `?q=${table[at][0]}`).toEqual([table[at][1]]);
    });
  });

  it("adding a word narrows, never widens", async () => {
    const { client } = await coachWithPrograms();
    const one = await client.get(`/api/coach/programs?q=soccer`);
    const two = await client.get(`/api/coach/programs?q=${encodeURIComponent("soccer in season")}`);
    expect(names(one.body)).toEqual(["Speed Block"]);
    expect(two.body).toEqual([]);
  });

  it("no query returns the whole list, and nonsense returns none", async () => {
    const { client } = await coachWithPrograms();
    expect((await client.get("/api/coach/programs")).body).toHaveLength(PROGRAMS_MADE);
    expect((await client.get("/api/coach/programs?q=zzqqxx")).body).toEqual([]);
  });

  it("an older client's save (no tag fields) keeps the tags; an explicit null clears one", async () => {
    const { client, soccer } = await coachWithPrograms();
    const kept = await client.put(`/api/coach/programs/${soccer.id}`, { name: "Speed Block", weeks: [] });
    expect(kept.status).toBeLessThan(FIRST_NON_SUCCESS);
    expect((await client.get(`/api/coach/programs/${soccer.id}`)).body.seasonPhase).toBe("pre_season");
    await client.put(`/api/coach/programs/${soccer.id}`, { name: "Speed Block", weeks: [], seasonPhase: null });
    const after = await client.get(`/api/coach/programs/${soccer.id}`);
    expect(after.body.seasonPhase).toBeNull();
    expect(after.body.sport).toBe("Soccer");
  });

  it("refuses a season phase outside the vocabulary", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const client = await loginAs(server.baseUrl, coach);
    const res = await client.post("/api/coach/programs", emptyProgram("Odd", { seasonPhase: "taper" }));
    expect(res.status).toBe(BAD_REQUEST);
  });

  it("the admin list and a Free Agent's list search the same way", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const adminClient = await loginAs(server.baseUrl, admin);
    await adminClient.post("/api/admin/programs", emptyProgram("Forge Ankle Prep", { joints: ["ankle"], purposes: ["warmup"] }));
    const adminRes = await adminClient.get(`/api/admin/programs?q=${encodeURIComponent("warm up ankle")}`);
    expect(names(adminRes.body)).toEqual(["Forge Ankle Prep"]);

    const freeAgent = await makeLoginableUser({ role: "athlete" });
    const faClient = await loginAs(server.baseUrl, freeAgent);
    await faClient.post("/api/athlete/programs", emptyProgram("My Knee Plan", { joints: ["knee"], purposes: ["care"] }));
    const faRes = await faClient.get(`/api/athlete/programs?q=${encodeURIComponent("prehab meniscus")}`);
    expect(faRes.status).toBe(OK);
    expect(names(faRes.body)).toContain("My Knee Plan");
    expect(names(faRes.body)).not.toContain("Forge Ankle Prep");
  });
});

describe("exercise tags through the real exercise route", () => {
  it("stores the five fields, positions normalised, and refuses a joint outside the list", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const client = await loginAs(server.baseUrl, coach);
    const ok = await client.post("/api/coach/exercises", {
      name: "Band External Rotation",
      category: "mobility",
      muscleGroup: "Shoulders",
      equipment: "Band",
      joints: ["shoulder"],
      purposes: ["care", "warmup"],
      positions: ["Pitcher", "PITCHER", " catcher "],
      youthSafe: true,
      cautionNote: "Skip after a recent shoulder dislocation unless cleared",
    });
    expect(ok.status).toBe(CREATED);
    expect(ok.body.positions).toEqual(["pitcher", "catcher"]);
    expect(ok.body.youthSafe).toBe(true);
    expect(ok.body.cautionNote).toContain("dislocation");

    const bad = await client.post("/api/coach/exercises", { name: "Odd", joints: ["toe"] });
    expect(bad.status).toBe(BAD_REQUEST);
  });
});

describe("no exercise is held back for an athlete's age (Scott, 2026-11-22: proficiency, not age)", () => {
  it("a coach's library offers every exercise, whatever the column says, and the youth route is gone", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const client = await loginAs(server.baseUrl, coach);
    const safe = await makeExercise(coach.id, { name: "Goblet Squat", youthSafe: true });
    await makeExercise(coach.id, { name: "Back Squat" });
    await makeExercise(coach.id, { name: "Depth Jump", youthSafe: false });
    const young = await makeAthlete({ dateOfBirth: bornYearsAgo(YOUNG) });
    await addToRoster(coach.id, young.id);
    const assigned = await makeAssignedProgram({ coachId: coach.id, athleteId: young.id, exerciseIds: [safe.id] });

    const visible = (await storage.getVisibleExercisesForCoach(coach.id)).map((e) => e.name).sort();
    expect(visible).toEqual(["Back Squat", "Depth Jump", "Goblet Squat"]);
    expect(visible).toHaveLength(LIBRARY_SIZE);
    const route = await client.get(`/api/coach/programs/${assigned.program.id}/youth-audience`);
    expect(route.status).toBeGreaterThanOrEqual(FIRST_NON_SUCCESS);
  });
});
