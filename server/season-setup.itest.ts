/**
 * SEASON SETUP, THROWING WORKLOAD AND THE YEAR-ROUND NOTE, DRIVEN THROUGH THE REAL ROUTES (2026-11-22).
 *
 * What is claimed, each against real Postgres:
 *   - a season plan assigns every program with the start date the coach confirmed, and records the
 *     phase, the game dates, the team and each athlete's position beside each assignment;
 *   - the position defaults from the athlete's profile (the context read returns it);
 *   - the clinician clearance is required for a return-to-training program and for nothing else,
 *     on the season route AND on the ordinary assign routes, and the restrictions reach the day;
 *   - a narrowed staff coach can neither describe nor assign an athlete outside their team, and
 *     cannot read that athlete's throwing history;
 *   - pitches logged as "Pitching (Game)" sets reach the coach's history and the Today card's note.
 *
 * Six logins for the whole file (the login limiter allows fifteen per IP per fifteen minutes).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  assignmentSeasonSetups,
  assignments,
  coachAthletes,
  coachStaff,
  programDays,
  programWeeks,
  programs,
  teamMembers,
  teams,
  workoutLogEntries,
  workoutLogs,
  workoutSetEntries,
  exercises,
} from "@shared/schema";
import { resetDatabase } from "./test-support/fixtures";
import { loginAs, makeLoginableUser, startTestServer, type TestClient, type TestServer } from "./test-support/http-app";
import { proposeSeasonPlan } from "@shared/season-plan";
import { seedThrowingWorkloadExercises } from "./seed-throwing-exercises";
import { PITCHING_GAME_EXERCISE } from "@shared/throwing-workload";

let server: TestServer;
let primaryClient: TestClient;
let staffClient: TestClient;
let freeAgentClient: TestClient;
let otherCoachClient: TestClient;
let varsityClient: TestClient;
let ids: {
  primary: number;
  staff: number;
  varsity: number;
  jv: number;
  freeAgent: number;
  pre: number;
  inSeason: number;
  post: number;
  rtt: number;
  plain: number;
};

const FIRST_GAME = "2027-03-15";
const LAST_GAME = "2027-05-23";
const TODAY = new Date().toISOString().slice(0, 10);

async function makeProgram(coachId: number, name: string, weeks: number, tags: Partial<typeof programs.$inferInsert>) {
  const [p] = await db.insert(programs).values({ coachId, name, sport: "Baseball", ...tags }).returning();
  const weekRows = await db
    .insert(programWeeks)
    .values(Array.from({ length: weeks }, (_, i) => ({ programId: p.id, weekNumber: i + 1 })))
    .returning();
  await db.insert(programDays).values(weekRows.map((w) => ({ weekId: w.id, dayNumber: 1, title: "Day 1" })));
  return p.id;
}

beforeAll(async () => {
  server = await startTestServer();
  await resetDatabase();
  const primary = await makeLoginableUser({ role: "coach", name: "Head Coach" });
  const staff = await makeLoginableUser({ role: "coach", name: "Assistant" });
  const otherCoach = await makeLoginableUser({ role: "coach", name: "Other Program" });
  await db.insert(coachStaff).values({ primaryCoachId: primary.id, staffCoachId: staff.id });
  const varsity = await makeLoginableUser({ role: "athlete", name: "Varsity Pitcher", position: "Pitcher", gender: "female" });
  const jv = await makeLoginableUser({ role: "athlete", name: "JV Catcher", position: "Catcher", gender: "female" });
  const freeAgent = await makeLoginableUser({ role: "athlete", name: "Free Agent" });
  await db.insert(coachAthletes).values([
    { coachId: primary.id, athleteId: varsity.id },
    { coachId: primary.id, athleteId: jv.id },
  ]);
  const [varsityTeam] = await db.insert(teams).values({ coachId: primary.id, name: "Varsity", code: "SEAS01" }).returning();
  const [jvTeam] = await db.insert(teams).values({ coachId: primary.id, name: "JV", code: "SEAS02" }).returning();
  await db.insert(teamMembers).values([
    { teamId: varsityTeam.id, athleteId: varsity.id },
    { teamId: jvTeam.id, athleteId: jv.id },
  ]);

  ids = {
    primary: primary.id,
    staff: staff.id,
    varsity: varsity.id,
    jv: jv.id,
    freeAgent: freeAgent.id,
    pre: await makeProgram(primary.id, "Preseason Arm", 6, { seasonPhase: "pre_season", positions: ["pitcher"] }),
    inSeason: await makeProgram(primary.id, "In-Season Maintenance", 4, { seasonPhase: "in_season" }),
    post: await makeProgram(primary.id, "Postseason Recovery", 3, { seasonPhase: "post_season" }),
    rtt: await makeProgram(primary.id, "Elbow Return", 4, { purposes: ["return_to_training"] }),
    plain: await makeProgram(primary.id, "General Strength", 4, {}),
  };

  primaryClient = await loginAs(server.baseUrl, primary);
  // The primary narrows the assistant to Varsity through the real route.
  const assign = await primaryClient.put(`/api/coach/teams/${varsityTeam.id}/coaches`, { coachIds: [staff.id] });
  expect(assign.status).toBe(200);
  staffClient = await loginAs(server.baseUrl, staff);
  freeAgentClient = await loginAs(server.baseUrl, freeAgent);
  otherCoachClient = await loginAs(server.baseUrl, otherCoach);
  varsityClient = await loginAs(server.baseUrl, varsity);
});

afterAll(async () => {
  await server.close();
});

describe("season setup", () => {
  it("the context read gives the profile position, the team suggestion and no age or gender", async () => {
    const res = await primaryClient.post("/api/season-setup/context", { programIds: [ids.pre, ids.rtt], athleteIds: [ids.varsity, ids.jv] });
    expect(res.status).toBe(200);
    const byId = new Map(res.body.athletes.map((a: any) => [a.id, a]));
    expect((byId.get(ids.varsity) as any).position).toBe("Pitcher");
    expect(res.body.suggestedTeamGender).toBe("girls");
    const sent = JSON.stringify(res.body.athletes);
    ["female", "dateOfBirth", '"age"'].forEach((word) => expect(sent).not.toContain(word));
    const rtt = res.body.programs.find((p: any) => p.id === ids.rtt);
    expect(rtt.returnToTraining).toBe(true);
    expect(res.body.programs.find((p: any) => p.id === ids.pre).weekCount).toBe(6);
  });

  it("plans a season: every program lands on its confirmed start date with its setup", async () => {
    const plan = proposeSeasonPlan({
      firstGameDate: FIRST_GAME,
      lastGameDate: LAST_GAME,
      programs: [
        { programId: ids.pre, seasonPhase: "pre_season", weekCount: 6 },
        { programId: ids.inSeason, seasonPhase: "in_season", weekCount: 4 },
        { programId: ids.post, seasonPhase: "post_season", weekCount: 3 },
      ],
    });
    if (!plan.ok) throw new Error(plan.reason);
    // The coach moves the postseason by a day: what is sent is what lands.
    const programsBody = plan.proposals.map((p) => ({
      programId: p.programId,
      startDate: p.programId === ids.post ? "2027-05-25" : p.startDate,
      durationWeeks: p.durationWeeks,
      seasonPhase: p.seasonPhase,
    }));
    const res = await primaryClient.post("/api/coach/season-assignments", {
      programs: programsBody,
      teamGender: "girls",
      firstGameDate: FIRST_GAME,
      lastGameDate: LAST_GAME,
      athletes: [{ athleteId: ids.varsity, correctivesEnabled: false, position: "Pitcher" }],
    });
    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(3);
    const rows = await db.select().from(assignments).where(inArray(assignments.id, res.body.created.map((c: any) => c.id)));
    const byProgram = new Map(rows.map((r) => [r.programId, r]));
    expect(byProgram.get(ids.pre)?.startDate).toBe("2027-02-01");
    expect(byProgram.get(ids.inSeason)).toMatchObject({ startDate: FIRST_GAME, durationWeeks: 3 });
    expect(byProgram.get(ids.post)?.startDate).toBe("2027-05-25");
    const setups = await db.select().from(assignmentSeasonSetups).where(inArray(assignmentSeasonSetups.assignmentId, rows.map((r) => r.id)));
    expect(setups).toHaveLength(3);
    expect(setups.every((s) => s.teamGender === "girls" && s.position === "pitcher" && s.firstGameDate === FIRST_GAME)).toBe(true);
    expect(new Set(setups.map((s) => s.seasonPhase))).toEqual(new Set(["pre_season", "in_season", "post_season"]));
    expect(setups.every((s) => s.clearanceConfirmedAt === null)).toBe(true);
  });

  it("requires the clearance for a return-to-training program, and only for one", async () => {
    const athletes = [{ athleteId: ids.jv, correctivesEnabled: false }];
    const without = await primaryClient.post("/api/coach/season-assignments", {
      programs: [{ programId: ids.rtt, startDate: TODAY, durationWeeks: 1 }],
      athletes,
    });
    expect(without.status).toBe(400);
    expect(without.body.message).toContain("clearance");
    // The ordinary assign route refuses it too, naming where the tick is.
    const ordinary = await primaryClient.post("/api/coach/assignments", { programId: ids.rtt, startDate: TODAY, athletes });
    expect(ordinary.status).toBe(400);
    // A plain program needs nothing, on either route.
    const plain = await primaryClient.post("/api/coach/season-assignments", {
      programs: [{ programId: ids.plain, startDate: TODAY, durationWeeks: 1 }],
      athletes,
    });
    expect(plain.status).toBe(201);
    expect((await primaryClient.post("/api/coach/assignments", { programId: ids.plain, startDate: TODAY, athletes })).status).toBe(201);

    const withTick = await primaryClient.post("/api/coach/season-assignments", {
      programs: [{ programId: ids.rtt, startDate: TODAY, durationWeeks: 1, clearance: { confirmed: true, restrictions: "No throwing past 60 feet." } }],
      athletes: [{ athleteId: ids.varsity, correctivesEnabled: false }],
    });
    expect(withTick.status).toBe(201);
    const assignmentId = withTick.body.created[0].id;
    const [setup] = await db.select().from(assignmentSeasonSetups).where(eq(assignmentSeasonSetups.assignmentId, assignmentId));
    expect(setup).toMatchObject({ clearanceConfirmedById: ids.primary, clearanceRestrictions: "No throwing past 60 feet." });
    expect(setup.clearanceConfirmedAt).not.toBeNull();

    // The restrictions reach the athlete's day, and the coach's; nobody else's.
    const athleteRead = await varsityClient.get(`/api/assignments/${assignmentId}/restrictions`);
    expect(athleteRead.status).toBe(200);
    expect(athleteRead.body.line).toBe("Clinician's restrictions: No throwing past 60 feet.");
    expect((await primaryClient.get(`/api/assignments/${assignmentId}/restrictions`)).body.restrictions).toBe("No throwing past 60 feet.");
    expect((await otherCoachClient.get(`/api/assignments/${assignmentId}/restrictions`)).status).toBe(404);
  });

  it("an adult Free Agent ticks their own clearance; without it the self route refuses", async () => {
    // A Free Agent can use a program only if it is visible to them; give them their own copy.
    const ownRtt = await makeProgram(ids.freeAgent, "My Knee Return", 2, { purposes: ["return_to_training"] });
    const refused = await freeAgentClient.post("/api/my/season-assignments", { programs: [{ programId: ownRtt, startDate: TODAY, durationWeeks: 1 }] });
    expect(refused.status).toBe(400);
    expect((await freeAgentClient.post("/api/athlete/my/assignments", { programId: ownRtt, startDate: TODAY })).status).toBe(400);
    const ok = await freeAgentClient.post("/api/my/season-assignments", {
      programs: [{ programId: ownRtt, startDate: TODAY, durationWeeks: 1, clearance: { confirmed: true, restrictions: null } }],
      position: "Shortstop",
    });
    expect(ok.status).toBe(201);
    const [setup] = await db.select().from(assignmentSeasonSetups).where(eq(assignmentSeasonSetups.assignmentId, ok.body.created[0].id));
    expect(setup).toMatchObject({ clearanceConfirmedById: ids.freeAgent, position: "shortstop" });
  });

  it("a narrowed staff coach's scope holds", async () => {
    const ctx = await staffClient.post("/api/season-setup/context", { programIds: [ids.plain], athleteIds: [ids.varsity, ids.jv] });
    expect(ctx.status).toBe(200);
    expect(ctx.body.athletes.map((a: any) => a.id)).toEqual([ids.varsity]);
    const outside = await staffClient.post("/api/coach/season-assignments", {
      programs: [{ programId: ids.plain, startDate: TODAY, durationWeeks: 1 }],
      athletes: [{ athleteId: ids.jv, correctivesEnabled: false }],
    });
    expect(outside.status).toBe(400);
    const inside = await staffClient.post("/api/coach/season-assignments", {
      programs: [{ programId: ids.plain, startDate: TODAY, durationWeeks: 1 }],
      athletes: [{ athleteId: ids.varsity, correctivesEnabled: false }],
    });
    expect(inside.status).toBe(201);
    expect((await staffClient.get(`/api/coach/roster/${ids.jv}/throwing`)).status).toBe(404);
    expect((await staffClient.get(`/api/coach/roster/${ids.jv}/single-sport-note`)).status).toBe(404);
  });
});

describe("throwing workload", () => {
  it("a game logged as Pitching (Game) sets reaches the history and the Today note", async () => {
    expect(await seedThrowingWorkloadExercises(ids.primary)).toBe(3);
    expect(await seedThrowingWorkloadExercises(ids.primary)).toBe(0);
    const [pitching] = await db.select().from(exercises).where(eq(exercises.name, PITCHING_GAME_EXERCISE));
    expect(pitching.isForgeOfficial).toBe(true);

    const [assignment] = await db.select().from(assignments).where(eq(assignments.athleteId, ids.varsity));
    const [day] = await db
      .select({ id: programDays.id })
      .from(programDays)
      .innerJoin(programWeeks, eq(programDays.weekId, programWeeks.id))
      .where(eq(programWeeks.programId, assignment.programId));
    const [log] = await db.insert(workoutLogs).values({ assignmentId: assignment.id, programDayId: day.id, athleteId: ids.varsity, date: TODAY }).returning();
    const [entry] = await db.insert(workoutLogEntries).values({ workoutLogId: log.id, exerciseId: pitching.id }).returning();
    // Six innings of 16 pitches: 96 in one game, past the 85 line.
    await db.insert(workoutSetEntries).values(Array.from({ length: 6 }, (_, i) => ({ logEntryId: entry.id, setNumber: i + 1, reps: "16" })));

    const history = await primaryClient.get(`/api/coach/roster/${ids.varsity}/throwing`);
    expect(history.status).toBe(200);
    const thisWeek = history.body.weeks[history.body.weeks.length - 1];
    expect(thisWeek).toMatchObject({ pitches: 96, innings: 6, topGamePitches: 96 });
    expect(history.body.notes.map((n: any) => n.kind)).toContain("game_pitches");

    const today = await primaryClient.get("/api/coach/throwing-notes");
    expect(today.body.athletes.map((a: any) => a.athleteId)).toEqual([ids.varsity]);
    expect((await otherCoachClient.get(`/api/coach/roster/${ids.varsity}/throwing`)).status).toBe(404);
  });

  it("the year-round note answers for an in-scope athlete", async () => {
    const res = await primaryClient.get(`/api/coach/roster/${ids.varsity}/single-sport-note`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("note");
  });
});
