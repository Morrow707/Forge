/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/no-explicit-any -- test fixtures */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/* A REAL WARM-UP ON EVERY PROGRAM DAY, ON REAL POSTGRES (2026-11-22). Scott: "I want every single
 * workout plan ... have warmups, I really want to see it."
 *   - the builder's save writes the block and the read hands it back with each drill's name; a
 *     save that omits it keeps it, a null clears it; a drill the coach cannot see is refused;
 *   - the athlete's one "Warm-up done" tick saves with the day, obeys the revision rule, survives
 *     a later save that leaves it out, and is counted on the coach's Today card, the Week tab and
 *     the parent's weekly email;
 *   - the printed sheet prints the day's real block in its warm-up line;
 *   - the AI draft, a day the AI chat creates and the import draft each get a RAMP warm-up from
 *     tagged warm-up drills the room can do, and never one the room lacks.
 * The model is faked (vi.mock of ./ai); it is never called for real here. */

let structuredReply: () => unknown = () => null;
let withToolsReply: () => unknown = () => null;
vi.mock("./ai", async (importOriginal) => {
  const real = await importOriginal<typeof import("./ai")>();
  return {
    ...real,
    aiEnabled: true,
    askClaudeStructured: vi.fn(async () => structuredReply()),
    askClaudeWithTools: vi.fn(async () => withToolsReply()),
  };
});

import { eq } from "drizzle-orm";
import { programDays, teamMembers, teams, workoutLogWarmups } from "@shared/schema";
import { db } from "./db";
import { storage, StaleWorkoutLogError } from "./storage";
import { makeAssignedProgram, makeExercise, resetDatabase } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";
import { submitLogAtCurrentRevision } from "./test-support/save-at-current-revision";
import { readWeeklySummary, buildParentWeeklySummaryEmail } from "./parent-weekly-summary";
import { loadSheetDay } from "./weight-room-sheets";
import { withDraftedWarmups } from "./program-import-routes";
import { buildSheet, DEFAULT_SHEET_LAYOUT, EMPTY_DAY_EDITS } from "@shared/weight-room-sheet";
import { EQUIPMENT_IDS } from "@shared/equipment-profile";

const OK = 200;
const BAD_REQUEST_OR_FORBIDDEN = [400, 403, 404];
const DATE = "2026-11-18"; // a Wednesday
const MONDAY = "2026-11-16";
const NO_BENCH = { items: EQUIPMENT_IDS.filter((id) => id !== "flat_bench" && id !== "adjustable_bench"), dumbbellMaxLbs: 50 };

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

async function setup() {
  const coach = await makeLoginableUser({ role: "coach" });
  const athlete = await makeLoginableUser({ role: "athlete", name: "Riley Warm" } as never);
  await addToRoster(coach.id, athlete.id);
  const squat = await makeExercise(coach.id, { name: "Back Squat", category: "strength", joints: ["knee", "hip"] });
  const bike = await makeExercise(coach.id, { name: "Bike", category: "conditioning", equipment: "Bodyweight", purposes: ["warmup"] });
  const bridge = await makeExercise(coach.id, { name: "Glute Bridge", category: "accessory", equipment: "Bodyweight", purposes: ["warmup"], joints: ["hip"] });
  const stretch = await makeExercise(coach.id, { name: "World's Greatest Stretch", category: "mobility", equipment: "Bodyweight", purposes: ["warmup"], joints: ["hip"] });
  const hops = await makeExercise(coach.id, { name: "Pogo Hops", category: "plyometric", equipment: "Bodyweight", purposes: ["warmup"], joints: ["ankle"] });
  // A tagged warm-up drill that needs a bench, for the room rule.
  const benchDrill = await makeExercise(coach.id, { name: "Bench Hip Thrust Warm-up", category: "accessory", equipment: "Bench", purposes: ["warmup"], joints: ["hip"] });
  const plan = await makeAssignedProgram({ coachId: coach.id, athleteId: athlete.id, exerciseIds: [squat.id], startDate: DATE });
  return { coach, athlete, squat, bike, bridge, stretch, hops, benchDrill, ...plan };
}

const structureWith = (s: Awaited<ReturnType<typeof setup>>, warmup: unknown) => ({
  name: s.program.name,
  weeks: [
    {
      weekNumber: 1,
      days: [
        {
          id: s.day.id,
          dayNumber: 1,
          title: "Day 1",
          isRestDay: false,
          ...(warmup === "omit" ? {} : { warmup }),
          exercises: [{ exerciseId: s.squat.id, orderIndex: 0, sets: 3, reps: "5" }],
        },
      ],
    },
  ],
});

const WARMUP = (s: Awaited<ReturnType<typeof setup>>) => ({
  note: "Easy pace",
  items: [
    { exerciseId: s.bike.id, durationSeconds: 180 },
    { exerciseId: s.bridge.id, sets: 2, reps: "10", note: "Squeeze at the top" },
  ],
});

describe("the builder saves a warm-up and reads it back", () => {
  it("writes the block, hands it back with names, keeps it on an omitted save, clears on null", async () => {
    const s = await setup();
    const coach = await loginAs(server.baseUrl, s.coach);
    expect((await coach.put(`/api/coach/programs/${s.program.id}`, structureWith(s, WARMUP(s)))).status).toBe(OK);
    const read = await coach.get(`/api/coach/programs/${s.program.id}`);
    const warmup = read.body.weeks[0].days[0].warmup;
    expect(warmup.note).toBe("Easy pace");
    expect(warmup.items.map((i: any) => [i.exercise.name, i.sets, i.reps, i.durationSeconds, i.note])).toEqual([
      ["Bike", null, null, 180, null],
      ["Glute Bridge", 2, "10", null, "Squeeze at the top"],
    ]);

    // An older client (or the AI chat's merge) leaves the key out: the warm-up is kept.
    await coach.put(`/api/coach/programs/${s.program.id}`, structureWith(s, "omit"));
    const [kept] = await db.select().from(programDays).where(eq(programDays.id, s.day.id));
    expect(kept.warmup?.items).toHaveLength(2);

    await coach.put(`/api/coach/programs/${s.program.id}`, structureWith(s, null));
    const [cleared] = await db.select().from(programDays).where(eq(programDays.id, s.day.id));
    expect(cleared.warmup).toBeNull();
  });

  it("refuses a warm-up drill the coach cannot see", async () => {
    const s = await setup();
    const stranger = await makeLoginableUser({ role: "coach" });
    const private_ = await makeExercise(stranger.id, { name: "Someone Else's Drill" });
    const coach = await loginAs(server.baseUrl, s.coach);
    const res = await coach.put(`/api/coach/programs/${s.program.id}`, structureWith(s, { items: [{ exerciseId: private_.id, sets: 1, reps: "5" }] }));
    expect(BAD_REQUEST_OR_FORBIDDEN).toContain(res.status);
  });
});

describe("the athlete's Warm-up done tick", () => {
  it("saves with the day, survives a save that omits it, obeys the revision rule, and is counted", async () => {
    const s = await setup();
    await db.update(programDays).set({ warmup: { note: null, items: [{ exerciseId: s.bike.id, sets: null, reps: null, durationSeconds: 180, note: null }] } }).where(eq(programDays.id, s.day.id));
    const base = { assignmentId: s.assignment.id, programDayId: s.day.id, date: DATE, completed: false, entries: [] };

    const detailBefore = await storage.getWorkoutDayDetail(s.athlete.id, s.assignment.id, s.day.id, DATE);
    expect(detailBefore!.day.warmup!.items[0].exercise!.name).toBe("Bike");

    await storage.submitWorkoutLog(s.athlete.id, { ...base, warmupDone: true });
    let detail = await storage.getWorkoutDayDetail(s.athlete.id, s.assignment.id, s.day.id, DATE);
    expect(detail!.log!.warmupDone).toBe(true);

    // A later save that says nothing about it keeps it.
    await submitLogAtCurrentRevision(s.athlete.id, { ...base, completed: true });
    detail = await storage.getWorkoutDayDetail(s.athlete.id, s.assignment.id, s.day.id, DATE);
    expect(detail!.log!.warmupDone).toBe(true);

    // A stale screen cannot untick it: the same 409 as any stale save.
    await expect(storage.submitWorkoutLog(s.athlete.id, { ...base, warmupDone: false, baseRevision: 0 })).rejects.toBeInstanceOf(StaleWorkoutLogError);
    expect(await db.select().from(workoutLogWarmups)).toHaveLength(1);

    // The Today card and the Week tab count it.
    const coach = await loginAs(server.baseUrl, s.coach);
    const today = await coach.get(`/api/coach/attendance/today?date=${DATE}`);
    const row = today.body.athletes.find((a: any) => a.athleteId === s.athlete.id);
    expect(row.warmup).toEqual({ withWarmup: 1, done: 1 });
    const week = await coach.get(`/api/coach/attendance/week?date=${DATE}`);
    expect(week.body.athletes.find((a: any) => a.athleteId === s.athlete.id).warmup).toEqual({ withWarmup: 1, done: 1 });
    expect(week.body.warmupTeam).toEqual({ withWarmup: 1, done: 1, ratePercent: 100 });

    // The parent's weekly email says it.
    const summary = await readWeeklySummary({ id: s.athlete.id, name: "Riley Warm" }, MONDAY);
    expect(summary.warmup).toEqual({ withWarmup: 1, done: 1 });
    expect(buildParentWeeklySummaryEmail(summary).html).toContain("<strong>Warm-up done</strong> 1 of 1.");

    // Unticking is a save like any other.
    await submitLogAtCurrentRevision(s.athlete.id, { ...base, completed: true, warmupDone: false });
    const after = await coach.get(`/api/coach/attendance/today?date=${DATE}`);
    expect(after.body.athletes.find((a: any) => a.athleteId === s.athlete.id).warmup).toEqual({ withWarmup: 1, done: 0 });
  });

  it("a day with no warm-up shows no mark and the email says nothing about warm-ups", async () => {
    const s = await setup();
    const coach = await loginAs(server.baseUrl, s.coach);
    const today = await coach.get(`/api/coach/attendance/today?date=${DATE}`);
    expect(today.body.athletes.find((a: any) => a.athleteId === s.athlete.id).warmup).toBeNull();
    const summary = await readWeeklySummary({ id: s.athlete.id, name: "Riley Warm" }, MONDAY);
    expect(buildParentWeeklySummaryEmail(summary).html).not.toContain("Warm-up");
  });
});

describe("the printed sheet", () => {
  it("prints the day's real warm-up block in its warm-up line", async () => {
    const s = await setup();
    await db.update(programDays).set({ warmup: { note: null, items: [{ exerciseId: s.bike.id, sets: null, reps: null, durationSeconds: 180, note: null }, { exerciseId: s.bridge.id, sets: 2, reps: "10", durationSeconds: null, note: null }] } }).where(eq(programDays.id, s.day.id));
    const [team] = await db.insert(teams).values({ coachId: s.coach.id, name: "Varsity" }).returning();
    await db.insert(teamMembers).values({ teamId: team.id, athleteId: s.athlete.id });
    const data = await loadSheetDay(s.coach.id, team.id, DATE, null);
    expect(data?.source?.warmupBlock).toEqual(["Bike 3 min", "Glute Bridge 2 × 10"]);
    expect(buildSheet(data!.source!, DEFAULT_SHEET_LAYOUT, EMPTY_DAY_EDITS).warmup).toEqual(["Bike 3 min", "Glute Bridge 2 × 10"]);
  });
});

describe("the AI fills the warm-up, from tagged drills the room can do", () => {
  it("the program draft gets a RAMP warm-up and never the bench drill when the room has no bench", async () => {
    const s = await setup();
    const coach = await loginAs(server.baseUrl, s.coach);
    await coach.request("PUT", "/api/coach/equipment-profiles/default", { body: NO_BENCH });
    structuredReply = () => ({
      name: "Lower",
      weeks: [{ weekNumber: 1, days: [
        { dayNumber: 1, title: "Lower", isRestDay: false, exercises: [{ exerciseId: s.squat.id, sets: 3, reps: "5" }] },
        { dayNumber: 2, title: "Off", isRestDay: true, exercises: [] },
      ] }],
    });
    const draft = await storage.generateProgramDraft(s.coach.id, "a lower body day");
    const [lower, rest] = draft!.structure.weeks[0].days as any[];
    const ids = lower.warmup.items.map((i: any) => i.exerciseId);
    expect(ids[0]).toBe(s.bike.id);
    expect(ids).toEqual(expect.arrayContaining([s.bridge.id, s.stretch.id, s.hops.id]));
    expect(ids).not.toContain(s.benchDrill.id);
    expect(ids).not.toContain(s.squat.id);
    expect(rest.warmup).toBeUndefined();
  });

  it("a day the chat creates gets one; the day that already existed keeps its own", async () => {
    const s = await setup();
    await db.update(programDays).set({ warmup: { note: "Mine", items: [{ exerciseId: s.bike.id, sets: null, reps: null, durationSeconds: 300, note: null }] } }).where(eq(programDays.id, s.day.id));
    withToolsReply = () => ({
      toolName: "update_program",
      input: { summary: "Added a day.", weekUpdates: [{ weekNumber: 1, dayUpdates: [
        { dayNumber: 1, exercises: [{ exerciseId: s.squat.id, sets: 4, reps: "5" }] },
        { dayNumber: 2, title: "Lower B", isRestDay: false, exercises: [{ exerciseId: s.squat.id, sets: 3, reps: "8" }] },
      ] }] },
    });
    const result = await storage.generateProgramFromChat(s.program.id, s.coach.id, "add a second lower day", false);
    const days = result.program!.weeks[0].days as any[];
    expect(days[0].warmup.note).toBe("Mine");
    expect(days[0].warmup.items).toHaveLength(1);
    expect(days[1].warmup.items.length).toBeGreaterThan(1);
    expect(days[1].warmup.items.map((i: any) => i.exercise.name)).toContain("Bike");
  });

  it("the import draft proposes one per training day, from the room's tagged drills only", async () => {
    const s = await setup();
    const rows = await storage.getVisibleExercisesForCoach(s.coach.id);
    const draft = {
      name: null,
      note: null,
      notPlaced: [],
      flaggedCount: 0,
      days: [
        { title: "Lower", isRestDay: false, exercises: [{ match: { status: "matched" as const, how: "exact" as const, exercise: { id: s.squat.id, name: "Back Squat" } } }] },
        { title: "Off", isRestDay: true, exercises: [] },
      ],
    };
    const out = await withDraftedWarmups(draft as any, rows as any, NO_BENCH);
    const [lower, rest] = out.days as any[];
    const names = lower.warmup.items.map((i: any) => i.exercise.name);
    expect(names).toContain("Bike");
    expect(names).not.toContain("Bench Hip Thrust Warm-up");
    expect(rest.warmup).toBeNull();
  });
});
