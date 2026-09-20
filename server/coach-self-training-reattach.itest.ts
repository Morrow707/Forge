import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { uploadedFiles } from "@shared/schema";
import { loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";
import { makeAssignedProgram, makeExercise, makeUploadedFile, resetDatabase } from "./test-support/fixtures";

/** A COACH FILMING THEIR OWN LIFT CAN LINK THE CLIP, NOT JUST UPLOAD IT.
 *
 * /api/athlete/form-video was opened to coach and admin on an earlier pass; the reattach and
 * unattached-clip routes were not, so a coach's queued clip uploaded, 403'd on the link, and
 * sat in a list no coach page could reach. This proves the whole loop for a coach on their own
 * program: attach by row id, a declined attach recorded and listed, linked by hand, dismissed.
 * Every storage call scopes by the caller's id, so the last case proves a coach cannot see an
 * athlete's orphan through the same routes. */

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});

const DAY = "2026-09-18";

async function ownProgram(coachId: number) {
  const bench = await makeExercise(coachId, { name: "Bench Press" });
  return makeAssignedProgram({ coachId, athleteId: coachId, exerciseIds: [bench.id] });
}

async function clipFor(userId: number) {
  const url = await makeUploadedFile(`coach-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
  await db.insert(uploadedFiles).values({ path: url, uploadedBy: userId });
  return url;
}

async function logDay(userId: number, program: Awaited<ReturnType<typeof ownProgram>>) {
  const result = await storage.submitWorkoutLog(userId, {
    assignmentId: program.assignment.id,
    programDayId: program.day.id,
    date: DAY,
    completed: false,
    entries: [
      {
        programExerciseId: program.programExercises[0].id,
        weightMode: "numeric",
        weightUnit: "lbs",
        sets: [{ setNumber: 1, reps: "10", weight: "135" }],
      },
    ],
  } as any);
  if (!result) throw new Error("submitWorkoutLog returned null");
  return result;
}

describe("a coach's own queued clip", () => {
  beforeEach(resetDatabase);

  for (const role of ["coach", "admin"] as const) {
    it(`attaches by row id for a ${role}`, async () => {
      const me = await makeLoginableUser({ role, name: `Self ${role}` });
      const program = await ownProgram(me.id);
      const saved = await logDay(me.id, program);
      const clip = await clipFor(me.id);
      const client = await loginAs(server.baseUrl, me);
      const res = await client.request("POST", "/api/athlete/log/attach-video", {
        body: {
          assignmentId: program.assignment.id,
          programDayId: program.day.id,
          date: DAY,
          programExerciseId: program.programExercises[0].id,
          setNumber: 1,
          workoutSetEntryId: saved.savedSetRowIds[0].id,
          videoUrl: clip,
          reason: "offline_flush",
        },
      });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ attached: true, via: "row_id" });
    });
  }

  it("is recorded, listed, linked by hand and dismissed through the same routes an athlete uses", async () => {
    const coach = await makeLoginableUser({ role: "coach", name: "Coach" });
    const program = await ownProgram(coach.id);
    const saved = await logDay(coach.id, program);
    const client = await loginAs(server.baseUrl, coach);

    // Wrong set number: declined, so the route writes the orphan row.
    const clip = await clipFor(coach.id);
    const declined = await client.request("POST", "/api/athlete/log/attach-video", {
      body: {
        assignmentId: program.assignment.id,
        programDayId: program.day.id,
        date: DAY,
        programExerciseId: program.programExercises[0].id,
        setNumber: 7,
        videoUrl: clip,
        reason: "server_error_retry",
        label: "Bench Press · Set 7",
      },
    });
    expect(declined.status).toBe(200);
    expect(declined.body).toEqual({ attached: false, cause: "set_not_logged" });

    const list = await client.request("GET", "/api/athlete/unattached-videos");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    const orphan = list.body[0];

    const candidates = await client.request("GET", `/api/athlete/unattached-videos/${orphan.id}/candidate-sets`);
    expect(candidates.status).toBe(200);
    expect(candidates.body.map((c: { workoutSetEntryId: number }) => c.workoutSetEntryId)).toEqual([
      saved.savedSetRowIds[0].id,
    ]);

    const linked = await client.request("POST", `/api/athlete/unattached-videos/${orphan.id}/attach`, {
      body: { workoutSetEntryId: saved.savedSetRowIds[0].id },
    });
    expect(linked.status).toBe(200);
    expect(linked.body).toMatchObject({ attached: true });
    expect(await client.request("GET", "/api/athlete/unattached-videos").then((r) => r.body)).toEqual([]);

    // A second orphan, dismissed rather than linked.
    const clip2 = await clipFor(coach.id);
    await client.request("POST", "/api/athlete/log/attach-video", {
      body: {
        assignmentId: program.assignment.id,
        programDayId: program.day.id,
        date: DAY,
        programExerciseId: program.programExercises[0].id,
        setNumber: 9,
        videoUrl: clip2,
      },
    });
    const [second] = (await client.request("GET", "/api/athlete/unattached-videos")).body;
    const dismissed = await client.request("POST", `/api/athlete/unattached-videos/${second.id}/dismiss`);
    expect(dismissed.status).toBe(200);
    expect(await client.request("GET", "/api/athlete/unattached-videos").then((r) => r.body)).toEqual([]);
  });

  it("never shows a coach an athlete's orphan through these routes", async () => {
    const coach = await makeLoginableUser({ role: "coach", name: "Coach" });
    const athlete = await makeLoginableUser({ role: "athlete", name: "Athlete" });
    await storage.recordUnattachedVideoUpload({
      athleteId: athlete.id,
      videoUrl: await clipFor(athlete.id),
      label: null,
      cause: "set_not_logged",
      attachReason: null,
      target: null,
    } as any);
    const client = await loginAs(server.baseUrl, coach);
    const list = await client.request("GET", "/api/athlete/unattached-videos");
    expect(list.body).toEqual([]);
    const [orphan] = await storage.listUnattachedVideoUploads(athlete.id);
    const stolen = await client.request("POST", `/api/athlete/unattached-videos/${orphan.id}/dismiss`);
    expect(stolen.status).toBe(404);
  });
});
