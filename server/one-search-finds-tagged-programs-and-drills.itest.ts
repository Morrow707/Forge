import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { makeAssignedProgram, makeAthlete, makeExercise, resetDatabase } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";
import { keepForAge, YOUTH_SAFE_MIN_AGE } from "@shared/exercise-tags";

/**
 * ONE SEARCH FINDS EVERYTHING, ON REAL ROWS (2026-11-22).
 *
 * Scott: warm-up, joint-care and return-to-training drills live in the ordinary library and one
 * search finds them. The pure scorers are tested in shared/; this drives the program list routes'
 * `?q=` against programs saved through the real create and update routes, the exercise tags through
 * the real exercise route, and the youth classification against real dates of birth.
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
const NOT_FOUND = 404;
const ADULT = 30;
/** Two years under the youth line: a 12-year-old today. */
const YEARS_UNDER_THE_LINE = 2;
const PROGRAMS_MADE = 4;
const LIBRARY_SIZE = 3;

const thisYear = new Date().getUTCFullYear();
/** A date of birth that is this many whole years ago today (born on 1 January). */
const bornYearsAgo = (years: number) => `${thisYear - years}-01-01`;
const YOUNG = YOUTH_SAFE_MIN_AGE - YEARS_UNDER_THE_LINE;

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

describe("youth-safe: what Forge offers an athlete under 14", () => {
  async function library(coachId: number) {
    const safe = await makeExercise(coachId, { name: "Goblet Squat", youthSafe: true });
    const unclassified = await makeExercise(coachId, { name: "Back Squat" });
    const held = await makeExercise(coachId, { name: "Depth Jump", youthSafe: false });
    return { safe, unclassified, held };
  }

  it("a program assigned to a 12-year-old is for youth; to an adult it is not", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const client = await loginAs(server.baseUrl, coach);
    const { safe } = await library(coach.id);
    const young = await makeAthlete({ dateOfBirth: bornYearsAgo(YOUNG) });
    const adult = await makeAthlete({ dateOfBirth: bornYearsAgo(ADULT) });
    const forYoung = await makeAssignedProgram({ coachId: coach.id, athleteId: young.id, exerciseIds: [safe.id] });
    const forAdult = await makeAssignedProgram({ coachId: coach.id, athleteId: adult.id, exerciseIds: [safe.id] });

    const youngRes = await client.get(`/api/coach/programs/${forYoung.program.id}/youth-audience`);
    expect(youngRes.status).toBe(OK);
    expect(youngRes.body).toEqual({ forYouth: true });
    const adultRes = await client.get(`/api/coach/programs/${forAdult.program.id}/youth-audience`);
    expect(adultRes.body).toEqual({ forYouth: false });
  });

  it("with no assignment yet, the coach's roster decides; an unknown birthday is not a child", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const client = await loginAs(server.baseUrl, coach);
    const created = await client.post("/api/coach/programs", emptyProgram("New Block"));
    const noBirthday = await makeAthlete({ dateOfBirth: null });
    await addToRoster(coach.id, noBirthday.id);
    expect((await client.get(`/api/coach/programs/${created.body.id}/youth-audience`)).body.forYouth).toBe(false);

    const young = await makeAthlete({ dateOfBirth: bornYearsAgo(YOUNG) });
    await addToRoster(coach.id, young.id);
    expect((await client.get(`/api/coach/programs/${created.body.id}/youth-audience`)).body.forYouth).toBe(true);
  });

  it("another coach cannot ask about a program that is not theirs", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const client = await loginAs(server.baseUrl, coach);
    const created = await client.post("/api/coach/programs", emptyProgram("Mine"));
    const other = await makeLoginableUser({ role: "coach" });
    const otherClient = await loginAs(server.baseUrl, other);
    expect((await otherClient.get(`/api/coach/programs/${created.body.id}/youth-audience`)).status).toBe(NOT_FOUND);
  });

  it("the library Forge picks from for a 12-year-old drops only the exercise marked not for them", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    await library(coach.id);
    const young = await makeAthlete({ dateOfBirth: bornYearsAgo(YOUNG) });
    const visible = await storage.getVisibleExercisesForCoach(coach.id);
    const age = await storage.knownAgeOf(young.id);
    expect(age).toBe(YOUNG);
    const offered = keepForAge(visible, age).map((e) => e.name).sort();
    expect(offered).toEqual(["Back Squat", "Goblet Squat"]);
    // An adult, and somebody with no birthday on file, are offered everything.
    expect(keepForAge(visible, ADULT)).toHaveLength(LIBRARY_SIZE);
    const noBirthday = await makeAthlete({ dateOfBirth: null });
    expect(keepForAge(visible, await storage.knownAgeOf(noBirthday.id))).toHaveLength(LIBRARY_SIZE);
  });

  it("a Free Agent's own age decides their own program", async () => {
    const youngFa = await makeAthlete({ dateOfBirth: bornYearsAgo(YOUNG) });
    const adultFa = await makeAthlete({ dateOfBirth: bornYearsAgo(ADULT) });
    expect(await storage.programIsForYouth(null, youngFa.id)).toBe(true);
    expect(await storage.programIsForYouth(null, adultFa.id)).toBe(false);
  });
});
