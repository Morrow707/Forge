import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { assignmentSeasonSetups, coachStaff, externalWaivers, programs, users } from "@shared/schema";
import { makeAssignedProgram, makeExercise, resetDatabase } from "./test-support/fixtures";
import { storage } from "./storage";
import {
  addToRoster,
  loginAs,
  makeLoginableUser,
  startTestServer,
  type TestServer,
} from "./test-support/http-app";
import { ATHLETIC_TRAINER_REFUSAL } from "@shared/staff-kinds";

/** THE ATHLETIC TRAINER, THROUGH THE REAL ROUTES ON REAL POSTGRES (2026-11-22).
 *
 * A trainer joins with the head coach's staff invite code and is a coach on that staff marked
 * `athletic_trainer` (shared/staff-kinds.ts). What they do is set health status and clearance,
 * file medical documents and message athletes; what server/athletic-trainer-gate.ts refuses is
 * every program, assignment, billing, branding and staff write, with a sentence. Scope is an
 * assistant coach's: an athlete off the program is out of reach. */

const CREATED = 201;
const OK = 200;
const FORBIDDEN = 403;
const NOT_FOUND = 404;

/** The smallest thing the upload route accepts: a real PDF header. */
const A_PDF = new Blob([new TextEncoder().encode("%PDF-1.4\n")], { type: "application/pdf" });
const A_LARGER_HEADCOUNT = 40;

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});

async function buildProgram() {
  const head = await makeLoginableUser({ role: "coach", name: "Head Coach" });
  const trainer = await makeLoginableUser({ role: "coach", name: "Pat Trainer" });
  const athlete = await makeLoginableUser({ role: "athlete", name: "Jamie Athlete" });
  await addToRoster(head.id, athlete.id);
  const otherCoach = await makeLoginableUser({ role: "coach", name: "Other School" });
  const outsider = await makeLoginableUser({ role: "athlete", name: "Off Program" });
  await addToRoster(otherCoach.id, outsider.id);
  const exercise = await makeExercise(head.id);
  const { assignment, program } = await makeAssignedProgram({
    coachId: head.id,
    athleteId: athlete.id,
    exerciseIds: [exercise.id],
  });
  const outsiderExercise = await makeExercise(otherCoach.id);
  const outsiderPlan = await makeAssignedProgram({
    coachId: otherCoach.id,
    athleteId: outsider.id,
    exerciseIds: [outsiderExercise.id],
  });
  const code = await storage.getOrCreateStaffInviteCode(head.id);
  return { head, trainer, athlete, outsider, assignment, program, outsiderAssignment: outsiderPlan.assignment, code };
}

async function joinAsTrainer(f: Awaited<ReturnType<typeof buildProgram>>) {
  const client = await loginAs(server.baseUrl, f.trainer);
  const joined = await client.post("/api/coach/staff/join", { code: f.code, staffKind: "athletic_trainer" });
  expect(joined.status).toBe(CREATED);
  return client;
}

describe("an athletic trainer on a program's staff", () => {
  beforeEach(resetDatabase);

  it("joins by the staff invite code and is marked a trainer", async () => {
    const f = await buildProgram();
    const client = await joinAsTrainer(f);
    const [row] = await db
      .select()
      .from(coachStaff)
      .where(and(eq(coachStaff.primaryCoachId, f.head.id), eq(coachStaff.staffCoachId, f.trainer.id)));
    expect(row.staffKind).toBe("athletic_trainer");
    const me = await client.get("/api/auth/me");
    expect(me.body.role).toBe("coach");
    expect(me.body.isAthleticTrainer).toBe(true);
    const staff = await (await loginAs(server.baseUrl, f.head)).get("/api/coach/staff");
    expect(staff.body.staff.find((s: { id: number }) => s.id === f.trainer.id).staffKind).toBe("athletic_trainer");
  });

  it("can be marked a trainer by the head coach after joining as a coach, and only by the head coach", async () => {
    const f = await buildProgram();
    const trainerClient = await loginAs(server.baseUrl, f.trainer);
    expect((await trainerClient.post("/api/coach/staff/join", { code: f.code })).status).toBe(CREATED);
    expect((await trainerClient.get("/api/auth/me")).body.isAthleticTrainer).toBe(false);

    const headClient = await loginAs(server.baseUrl, f.head);
    const marked = await headClient.patch(`/api/coach/staff/${f.trainer.id}/kind`, { staffKind: "athletic_trainer" });
    expect(marked.status).toBe(OK);
    expect((await trainerClient.get("/api/auth/me")).body.isAthleticTrainer).toBe(true);

    // The trainer cannot set it back on themselves: a staff write, refused with the sentence.
    const selfUndo = await trainerClient.patch(`/api/coach/staff/${f.trainer.id}/kind`, { staffKind: "coach" });
    expect(selfUndo.status).toBe(FORBIDDEN);
    expect(selfUndo.body.message).toBe(ATHLETIC_TRAINER_REFUSAL);
  });

  it("sets an athlete's health status and an assignment's clearance and restrictions", async () => {
    const f = await buildProgram();
    const client = await joinAsTrainer(f);

    const hurt = await client.patch(`/api/coach/roster/${f.athlete.id}/health-status`, { healthStatus: "hurt" });
    expect(hurt.status).toBe(OK);
    const [athleteRow] = await db.select({ h: users.healthStatus }).from(users).where(eq(users.id, f.athlete.id));
    expect(athleteRow.h).toBe("hurt");

    const cleared = await client.patch(`/api/coach/clearances/${f.assignment.id}`, {
      confirmed: true,
      restrictions: "No overhead pressing for two weeks.",
    });
    expect(cleared.status).toBe(OK);
    const [setup] = await db
      .select()
      .from(assignmentSeasonSetups)
      .where(eq(assignmentSeasonSetups.assignmentId, f.assignment.id));
    expect(setup.clearanceConfirmedById).toBe(f.trainer.id);
    expect(setup.clearanceRestrictions).toBe("No overhead pressing for two weeks.");

    // The restrictions reach the coach exactly as a clearance ticked at assignment does.
    const headClient = await loginAs(server.baseUrl, f.head);
    const seen = await headClient.get(`/api/assignments/${f.assignment.id}/restrictions`);
    expect(seen.body.restrictions).toBe("No overhead pressing for two weeks.");
    const list = await client.get(`/api/coach/roster/${f.athlete.id}/clearances`);
    expect(list.body.clearances[0]).toMatchObject({ assignmentId: f.assignment.id, confirmed: true });

    const unclear = await client.patch(`/api/coach/clearances/${f.assignment.id}`, { confirmed: false });
    expect(unclear.status).toBe(OK);
    expect(unclear.body.confirmed).toBe(false);
  });

  it("files a medical clearance for an athlete in scope", async () => {
    const f = await buildProgram();
    const client = await joinAsTrainer(f);
    const form = new FormData();
    form.append("file", A_PDF, "clearance.pdf");
    form.append("kind", "medical_clearance");
    const res = await fetch(`${server.baseUrl}/api/waivers/${f.athlete.id}`, {
      method: "POST",
      headers: { cookie: client.cookieHeader() },
      body: form,
    });
    expect(res.status).toBe(CREATED);
    const rows = await db.select().from(externalWaivers).where(eq(externalWaivers.athleteId, f.athlete.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].uploadedByUserId).toBe(f.trainer.id);
    expect(rows[0].kind).toBe("medical_clearance");
    const read = await client.get(`/api/waivers/${f.athlete.id}`);
    expect(read.status).toBe(OK);
    expect(read.body.waivers).toHaveLength(1);
  });

  it("messages an athlete in scope", async () => {
    const f = await buildProgram();
    const client = await joinAsTrainer(f);
    const sent = await client.post(`/api/coach/messages/${f.athlete.id}`, { body: "How is the ankle today?" });
    expect(sent.status).toBe(CREATED);
  });

  it("is refused every program and assignment write, with a sentence", async () => {
    const f = await buildProgram();
    const client = await joinAsTrainer(f);
    const attempts = await Promise.all([
      client.post("/api/coach/programs", { name: "Trainer's program", weeks: [] }),
      client.put(`/api/coach/programs/${f.program.id}`, { name: "Renamed" }),
      client.delete(`/api/coach/programs/${f.program.id}`),
      client.post("/api/coach/assignments", { programId: f.program.id, athleteIds: [f.athlete.id], startDate: "2026-12-01" }),
      client.patch(`/api/coach/assignments/${f.assignment.id}`, { startDate: "2026-12-01" }),
      client.post("/api/coach/season-assignments", { programs: [], athletes: [] }),
      client.post("/api/coach/skill-programs", { name: "x" }),
      client.post("/api/coach/classes", { title: "x" }),
    ]);
    attempts.forEach((res) => {
      expect(res.status).toBe(FORBIDDEN);
      expect(res.body.message).toBe(ATHLETIC_TRAINER_REFUSAL);
    });
    const [program] = await db.select().from(programs).where(eq(programs.id, f.program.id));
    expect(program.name).toBe(f.program.name);
  });

  it("is refused the plan, billing, branding and staff writes", async () => {
    const f = await buildProgram();
    const client = await joinAsTrainer(f);
    const attempts = await Promise.all([
      client.put("/api/coach/plan", { plannedAthleteCount: A_LARGER_HEADCOUNT }),
      client.post("/api/billing/checkout/coach", {}),
      client.patch("/api/coach/branding", { brandPrimaryColor: "#123456" }),
      client.post("/api/coach/staff/invite-code/regenerate"),
      client.delete(`/api/coach/staff/${f.head.id}`),
      client.patch(`/api/coach/staff/${f.trainer.id}/title`, { title: "Head" }),
      client.post("/api/coach/teams", { name: "Trainer's team" }),
    ]);
    attempts.forEach((res) => {
      expect(res.status).toBe(FORBIDDEN);
      expect(res.body.message).toBe(ATHLETIC_TRAINER_REFUSAL);
    });
  });

  it("cannot reach an athlete outside the program", async () => {
    const f = await buildProgram();
    const client = await joinAsTrainer(f);
    const health = await client.patch(`/api/coach/roster/${f.outsider.id}/health-status`, { healthStatus: "hurt" });
    expect(health.status).toBe(NOT_FOUND);
    const clearance = await client.patch(`/api/coach/clearances/${f.outsiderAssignment.id}`, { confirmed: true });
    expect(clearance.status).toBe(NOT_FOUND);
    expect((await client.get(`/api/coach/roster/${f.outsider.id}/clearances`)).status).toBe(NOT_FOUND);
    expect((await client.get(`/api/waivers/${f.outsider.id}`)).status).toBe(FORBIDDEN);
    const sent = await client.post(`/api/coach/messages/${f.outsider.id}`, { body: "Hello" });
    expect(sent.status).toBeGreaterThanOrEqual(FORBIDDEN);
    const [outsiderRow] = await db.select({ h: users.healthStatus }).from(users).where(eq(users.id, f.outsider.id));
    expect(outsiderRow.h).toBe("healthy");
  });

  it("changes nothing for an ordinary assistant coach", async () => {
    const f = await buildProgram();
    const client = await loginAs(server.baseUrl, f.trainer);
    expect((await client.post("/api/coach/staff/join", { code: f.code })).status).toBe(CREATED);
    const renamed = await client.put(`/api/coach/programs/${f.program.id}`, { name: "Renamed by the assistant" });
    expect(renamed.status).not.toBe(FORBIDDEN);
  });
});
