/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/no-explicit-any -- test fixtures */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/* THE WEIGHT-ROOM EQUIPMENT PROFILE ON REAL POSTGRES (2026-11-21). Scott: "they don't have a
 * bench so every sort of seated press is out, but we can still do floor press".
 *   - the routes and their scope: the head coach edits, staff read, a coached athlete reads and
 *     cannot write, a Free Agent writes their own, another program's team is 404;
 *   - the AI program draft: the model is told the room AND its exercise list is narrowed, and a
 *     bench exercise it hands back anyway is dropped on the server;
 *   - the AI program chat: an exercise the coach already placed by hand is KEPT, a new one the room
 *     cannot do is dropped;
 *   - the assign dialog's check names the gap, and its swaps write nothing until applied.
 * The model is faked (vi.mock of ./ai): what matters is what it is HANDED and what the server
 * does with what comes back. */

const captured: { structured: Array<{ system: unknown; tool: { input_schema: any } }>; withTools: Array<{ system: unknown }> } = { structured: [], withTools: [] };
let structuredReply: (tool: { name: string; input_schema: any }) => unknown = () => null;
let withToolsReply: () => unknown = () => null;

vi.mock("./ai", async (importOriginal) => {
  const real = await importOriginal<typeof import("./ai")>();
  return {
    ...real,
    aiEnabled: true,
    askClaudeStructured: vi.fn(async (system: unknown, _prompt: string, tool: { name: string; input_schema: any }) => {
      captured.structured.push({ system, tool });
      return structuredReply(tool);
    }),
    askClaudeWithTools: vi.fn(async (system: unknown) => {
      captured.withTools.push({ system });
      return withToolsReply();
    }),
  };
});

import { coachStaff, teamMembers, teams } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import { makeAssignedProgram, makeExercise, resetDatabase } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";
import { EQUIPMENT_IDS } from "@shared/equipment-profile";

const NO_BENCH = { items: EQUIPMENT_IDS.filter((id) => id !== "flat_bench" && id !== "adjustable_bench"), dumbbellMaxLbs: 50 };
const systemText = (system: unknown) => JSON.stringify(system);

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(async () => {
  await resetDatabase();
  captured.structured = [];
  captured.withTools = [];
});

async function setup() {
  const coach = await makeLoginableUser({ role: "coach" });
  const staff = await makeLoginableUser({ role: "coach" });
  await db.insert(coachStaff).values({ primaryCoachId: coach.id, staffCoachId: staff.id });
  const outsider = await makeLoginableUser({ role: "coach" });
  const athlete = await makeLoginableUser({ role: "athlete" });
  await addToRoster(coach.id, athlete.id);
  const freeAgent = await makeLoginableUser({ role: "athlete" });
  const [team] = await db.insert(teams).values({ coachId: coach.id, name: "Varsity" }).returning();
  const [otherTeam] = await db.insert(teams).values({ coachId: outsider.id, name: "Elsewhere" }).returning();
  await db.insert(teamMembers).values({ teamId: team.id, athleteId: athlete.id });
  const bench = await makeExercise(coach.id, { name: "Bench Press", equipment: "Barbell", movementType: "Push", muscleGroup: "Chest" });
  const incline = await makeExercise(coach.id, { name: "Incline Dumbbell Press", equipment: "Dumbbell", movementType: "Press", muscleGroup: "Chest" });
  const floor = await makeExercise(coach.id, { name: "Floor Press", equipment: "Barbell", movementType: "Push", muscleGroup: "Chest" });
  const pushUp = await makeExercise(coach.id, { name: "Push-Up", equipment: "Bodyweight", movementType: "Push", muscleGroup: "Chest" });
  return { coach, staff, outsider, athlete, freeAgent, team, otherTeam, bench, incline, floor, pushUp };
}

describe("who may set which room", () => {
  it("the head coach edits the default and a team; staff read; another program's team is 404", async () => {
    const s = await setup();
    const head = await loginAs(server.baseUrl, s.coach);
    expect((await head.request("PUT", "/api/coach/equipment-profiles/default", { body: NO_BENCH })).status).toBe(200);
    expect((await head.request("PUT", `/api/coach/equipment-profiles/teams/${s.team.id}`, { body: { items: ["dumbbells"] } })).status).toBe(200);
    expect((await head.request("PUT", `/api/coach/equipment-profiles/teams/${s.otherTeam.id}`, { body: NO_BENCH })).status).toBe(404);

    const staffClient = await loginAs(server.baseUrl, s.staff);
    const read = await staffClient.request("GET", "/api/coach/equipment-profiles");
    expect(read.status).toBe(200);
    expect(read.body.canEdit).toBe(false);
    expect(read.body.defaultRoom.items).not.toContain("flat_bench");
    expect(read.body.teams.find((t: { id: number }) => t.id === s.team.id).room.items).toEqual(["dumbbells"]);
    expect((await staffClient.request("PUT", "/api/coach/equipment-profiles/default", { body: { items: [] } })).status).toBe(403);
  });

  it("a coached athlete trains in their team's room and cannot set their own; a Free Agent sets theirs", async () => {
    const s = await setup();
    const head = await loginAs(server.baseUrl, s.coach);
    await head.request("PUT", "/api/coach/equipment-profiles/default", { body: NO_BENCH });
    await head.request("PUT", `/api/coach/equipment-profiles/teams/${s.team.id}`, { body: { items: ["dumbbells"] } });

    const athlete = await loginAs(server.baseUrl, s.athlete);
    const mine = await athlete.request("GET", "/api/equipment/my-room");
    expect(mine.body.room.items).toEqual(["dumbbells"]);
    expect((await athlete.request("PUT", "/api/account/equipment-profile", { body: NO_BENCH })).status).toBe(403);

    const fa = await loginAs(server.baseUrl, s.freeAgent);
    expect((await fa.request("GET", "/api/equipment/my-room")).body.room).toBeNull();
    expect((await fa.request("PUT", "/api/account/equipment-profile", { body: { items: ["bands"] } })).status).toBe(200);
    expect((await fa.request("GET", "/api/equipment/my-room")).body.room.items).toEqual(["bands"]);
    expect((await fa.request("PUT", "/api/account/equipment-profile", { body: { items: ["laser"] } })).status).toBe(400);
  });
});

describe("the AI plans for the room", () => {
  it("the program draft is told the room, sees no bench press, and a bench press handed back is dropped", async () => {
    const s = await setup();
    const head = await loginAs(server.baseUrl, s.coach);
    await head.request("PUT", "/api/coach/equipment-profiles/default", { body: NO_BENCH });
    structuredReply = () => ({
      name: "Push day",
      weeks: [{ weekNumber: 1, days: [{ dayNumber: 1, title: "Push", isRestDay: false, exercises: [
        { exerciseId: s.bench.id, sets: 3, reps: "5" },
        { exerciseId: s.floor.id, sets: 3, reps: "5" },
      ] }] }],
    });
    const draft = await storage.generateProgramDraft(s.coach.id, "an upper body push day");
    const call = captured.structured.at(-1)!;
    const enumIds: number[] = call.tool.input_schema.properties.weeks.items.properties.days.items.properties.exercises.items.properties.exerciseId.enum;
    expect(enumIds).toContain(s.floor.id);
    expect(enumIds).not.toContain(s.bench.id);
    expect(enumIds).not.toContain(s.incline.id);
    expect(systemText(call.system)).toContain("Weight-room equipment on hand:");
    expect(systemText(call.system)).toContain("Not available: Flat bench, Adjustable bench");
    const placed = draft!.structure.weeks[0].days[0].exercises.map((e) => e.exerciseId);
    expect(placed).toEqual([s.floor.id]);
  });

  it("with no profile nothing changes: every exercise is offered and no room line is sent", async () => {
    const s = await setup();
    structuredReply = () => ({ name: "x", weeks: [] });
    await storage.generateProgramDraft(s.coach.id, "anything");
    const call = captured.structured.at(-1)!;
    const enumIds: number[] = call.tool.input_schema.properties.weeks.items.properties.days.items.properties.exercises.items.properties.exerciseId.enum;
    expect(enumIds).toEqual(expect.arrayContaining([s.bench.id, s.incline.id, s.floor.id]));
    expect(systemText(call.system)).not.toContain("Weight-room equipment on hand:");
  });

  it("the program chat keeps the coach's hand-placed bench press and drops a new incline press", async () => {
    const s = await setup();
    const head = await loginAs(server.baseUrl, s.coach);
    await head.request("PUT", "/api/coach/equipment-profiles/default", { body: NO_BENCH });
    const { program } = await makeAssignedProgram({ coachId: s.coach.id, athleteId: s.athlete.id, exerciseIds: [s.bench.id] });
    withToolsReply = () => ({
      toolName: "update_program",
      input: { summary: "Added more pressing.", weekUpdates: [{ weekNumber: 1, dayUpdates: [{ dayNumber: 1, exercises: [
        { exerciseId: s.bench.id, sets: 3, reps: "5" },
        { exerciseId: s.incline.id, sets: 3, reps: "8" },
        { exerciseId: s.pushUp.id, sets: 3, reps: "12" },
      ] }] }] },
    });
    const result = await storage.generateProgramFromChat(program.id, s.coach.id, "add pressing", false);
    expect(systemText(captured.withTools.at(-1)!.system)).toContain("Weight-room equipment on hand:");
    const names = (result as any).program.weeks[0].days[0].exercises.map((e: any) => e.exercise.name);
    expect(names).toEqual(["Bench Press", "Push-Up"]);
  });
});

describe("assigning a program to athletes whose room lacks the gear", () => {
  it("names the gap, suggests swaps that write nothing, and applies them on request", async () => {
    const s = await setup();
    const head = await loginAs(server.baseUrl, s.coach);
    await head.request("PUT", `/api/coach/equipment-profiles/teams/${s.team.id}`, { body: NO_BENCH });
    const { program, programExercises: rows } = await makeAssignedProgram({ coachId: s.coach.id, athleteId: s.athlete.id, exerciseIds: [s.bench.id, s.pushUp.id] });

    const check = await head.request("POST", `/api/coach/programs/${program.id}/equipment-check`, { body: { athleteIds: [s.athlete.id] } });
    expect(check.status).toBe(200);
    expect(check.body.days).toHaveLength(1);
    expect(check.body.days[0].exercises.map((e: any) => e.name)).toEqual(["Bench Press"]);

    // The model answers the swap with Floor Press; nothing is written by a suggestion.
    structuredReply = (tool) => (tool.name === "substitute_exercise" ? { exerciseId: s.floor.id, summary: "Floor press keeps the push without a bench." } : null);
    const swaps = await head.request("POST", `/api/coach/programs/${program.id}/equipment-swaps`, { body: { athleteIds: [s.athlete.id] } });
    expect(swaps.body.suggestions).toEqual([expect.objectContaining({ programExerciseId: rows[0].id, to: { id: s.floor.id, name: "Floor Press" } })]);
    const swapCall = captured.structured.find((c) => c.tool && (c.tool as any).name === "substitute_exercise")!;
    expect(swapCall.tool.input_schema.properties.exerciseId.enum).not.toContain(s.incline.id);
    expect((await storage.getProgramFull(program.id))!.weeks[0].days[0].exercises[0].exerciseId).toBe(s.bench.id);

    const applied = await head.request("POST", `/api/coach/programs/${program.id}/equipment-swaps/apply`, { body: { swaps: [{ programExerciseId: rows[0].id, exerciseId: s.floor.id }] } });
    expect(applied.body.applied).toBe(1);
    expect((await storage.getProgramFull(program.id))!.weeks[0].days[0].exercises[0].exerciseId).toBe(s.floor.id);

    const outsider = await loginAs(server.baseUrl, s.outsider);
    expect((await outsider.request("POST", `/api/coach/programs/${program.id}/equipment-swaps/apply`, { body: { swaps: [{ programExerciseId: rows[0].id, exerciseId: s.bench.id }] } })).status).toBe(404);
  });
});
