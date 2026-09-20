import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { db } from "./db";
import { unattachedVideoUploads, uploadedFiles, workoutSetEntries } from "@shared/schema";
import {
  addToRoster,
  loginAs,
  makeLoginableUser,
  startTestServer,
  type TestServer,
} from "./test-support/http-app";
import { makeAssignedProgram, makeExercise, makeUploadedFile, resetDatabase } from "./test-support/fixtures";

/** A DEFERRED CLIP NAMES ITS SET BY ROW ID FIRST, BY TUPLE SECOND, AND IS RECORDED WHEN NEITHER LANDS.
 *
 * Before 2026-09-20 the only address a queued clip had was the five-field tuple, and the only
 * record of a clip the tuple could not place was a localStorage list on the phone that filmed
 * it. This file proves the three branches of the new precedence and the one row that makes an
 * orphaned clip visible to the athlete and the coach:
 *
 *   1. the row id still exists            -> attached via "row_id", reason recorded on the row
 *   2. the row id is gone (day resaved),
 *      the tuple still resolves           -> attached via "tuple"
 *   3. neither resolves                   -> declined, and the ROUTE writes unattached_video_uploads
 *
 * Plus the two things the column has to survive: a resave that keeps the video carries the
 * reason forward (the omission-vs-null contract), and a retake with a different url clears it. */

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});

const DAY = "2026-09-18";

async function setup() {
  const coach = await makeLoginableUser({ role: "coach", name: "Coach" });
  const athlete = await makeLoginableUser({ role: "athlete", name: "Athlete" });
  await addToRoster(coach.id, athlete.id);
  const bench = await makeExercise(coach.id, { name: "Bench Press" });
  const program = await makeAssignedProgram({ coachId: coach.id, athleteId: athlete.id, exerciseIds: [bench.id] });
  return { coach, athlete, program };
}

type Program = Awaited<ReturnType<typeof setup>>["program"];

async function clipFor(athleteId: number) {
  const url = await makeUploadedFile(`bench-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
  await db.insert(uploadedFiles).values({ path: url, uploadedBy: athleteId });
  return url;
}

async function logDay(
  athleteId: number,
  program: Program,
  sets: Record<string, unknown>[] = [{ setNumber: 1, reps: "10", weight: "135" }],
) {
  const result = await storage.submitWorkoutLog(athleteId, {
    assignmentId: program.assignment.id,
    programDayId: program.day.id,
    date: DAY,
    completed: false,
    entries: [
      {
        programExerciseId: program.programExercises[0].id,
        weightMode: "numeric",
        weightUnit: "lbs",
        sets,
      },
    ],
  } as any);
  if (!result) throw new Error("submitWorkoutLog returned null");
  return result;
}

function tupleFor(program: Program, setNumber = 1) {
  return {
    assignmentId: program.assignment.id,
    programDayId: program.day.id,
    date: DAY,
    programExerciseId: program.programExercises[0].id,
    setNumber,
  };
}

async function setRow(id: number) {
  return db.query.workoutSetEntries.findFirst({ where: eq(workoutSetEntries.id, id) });
}

describe("the save response names the rows", () => {
  beforeEach(resetDatabase);

  it("returns one row id per saved set, and a resave returns different ones", async () => {
    const { athlete, program } = await setup();
    const first = await logDay(athlete.id, program, [
      { setNumber: 1, reps: "10", weight: "135" },
      { setNumber: 2, reps: "10", weight: "135" },
    ]);
    expect(first.savedSetRowIds).toHaveLength(2);
    expect(first.savedSetRowIds.map((r) => r.setNumber)).toEqual([1, 2]);
    expect(first.savedSetRowIds[0].programExerciseId).toBe(program.programExercises[0].id);

    const second = await logDay(athlete.id, program, [
      { setNumber: 1, reps: "10", weight: "135" },
      { setNumber: 2, reps: "10", weight: "135" },
    ]);
    const firstIds = new Set(first.savedSetRowIds.map((r) => r.id));
    for (const r of second.savedSetRowIds) expect(firstIds.has(r.id)).toBe(false);
  });
});

describe("attach precedence", () => {
  beforeEach(resetDatabase);

  it("1. lands on the row id when it still exists, and records the reason on the row", async () => {
    const { athlete, program } = await setup();
    const clip = await clipFor(athlete.id);
    const saved = await logDay(athlete.id, program);
    const rowId = saved.savedSetRowIds[0].id;

    const result = await storage.attachVideoToLoggedSet(athlete.id, {
      ...tupleFor(program),
      // A tuple that cannot resolve, so a landing can only have come from the id.
      setNumber: 7,
      workoutSetEntryId: rowId,
      videoUrl: clip,
      reason: "offline_flush",
    });
    expect(result).toEqual({ attached: true, via: "row_id" });
    const row = await setRow(rowId);
    expect(row?.formCheckVideoUrl).toBe(clip);
    expect(row?.videoAttachReason).toBe("offline_flush");
  });

  it("2. falls back to the tuple when the row id has been replaced by a resave", async () => {
    const { athlete, program } = await setup();
    const clip = await clipFor(athlete.id);
    const first = await logDay(athlete.id, program);
    const staleId = first.savedSetRowIds[0].id;
    const second = await logDay(athlete.id, program); // reinserts: staleId is gone
    expect(await setRow(staleId)).toBeUndefined();

    const result = await storage.attachVideoToLoggedSet(athlete.id, {
      ...tupleFor(program),
      workoutSetEntryId: staleId,
      videoUrl: clip,
      reason: "server_error_retry",
    });
    expect(result).toEqual({ attached: true, via: "tuple" });
    const row = await setRow(second.savedSetRowIds[0].id);
    expect(row?.formCheckVideoUrl).toBe(clip);
    expect(row?.videoAttachReason).toBe("server_error_retry");
  });

  it("never lands on another athlete's row through the id", async () => {
    const { athlete, program } = await setup();
    const other = await setup();
    const clip = await clipFor(athlete.id);
    const theirs = await logDay(other.athlete.id, other.program);
    await logDay(athlete.id, program);

    const result = await storage.attachVideoToLoggedSet(athlete.id, {
      ...tupleFor(program),
      workoutSetEntryId: theirs.savedSetRowIds[0].id,
      videoUrl: clip,
      reason: "offline_flush",
    });
    // The id is ignored as if absent; the tuple (this athlete's own day) lands it.
    expect(result).toEqual({ attached: true, via: "tuple" });
    expect((await setRow(theirs.savedSetRowIds[0].id))?.formCheckVideoUrl).toBeNull();
  });

  it("3. declines when neither resolves, and the route records the clip as unattached", async () => {
    const { athlete, program } = await setup();
    const clip = await clipFor(athlete.id);
    const first = await logDay(athlete.id, program);
    const staleId = first.savedSetRowIds[0].id;
    await logDay(athlete.id, program, [{ setNumber: 1, reps: "10", weight: "135", formCheckVideoUrl: await clipFor(athlete.id) }]);

    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.request("POST", "/api/athlete/log/attach-video", {
      body: {
        ...tupleFor(program),
        workoutSetEntryId: staleId,
        videoUrl: clip,
        reason: "offline_flush",
        label: "Bench Press · Set 1",
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ attached: false, cause: "set_already_has_video" });

    const orphans = await storage.listUnattachedVideoUploads(athlete.id);
    expect(orphans).toHaveLength(1);
    expect(orphans[0]).toMatchObject({
      videoUrl: clip,
      label: "Bench Press · Set 1",
      cause: "set_already_has_video",
      attachReason: "offline_flush",
      date: DAY,
      programExerciseId: program.programExercises[0].id,
      setNumber: 1,
      resolvedAt: null,
    });

    // A second failed flush of the same clip updates the one row rather than listing it twice.
    const again = await client.request("POST", "/api/athlete/log/attach-video", {
      body: { ...tupleFor(program), videoUrl: clip, reason: "server_error_retry" },
    });
    expect(again.body.attached).toBe(false);
    expect(await storage.listUnattachedVideoUploads(athlete.id)).toHaveLength(1);
  });

  it("a landed attach writes no unattached row", async () => {
    const { athlete, program } = await setup();
    const clip = await clipFor(athlete.id);
    await logDay(athlete.id, program);
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.request("POST", "/api/athlete/log/attach-video", {
      body: { ...tupleFor(program), videoUrl: clip, reason: "offline_flush" },
    });
    expect(res.body).toEqual({ attached: true, via: "tuple" });
    expect(await storage.listUnattachedVideoUploads(athlete.id)).toHaveLength(0);
  });
});

describe("the reason column across resaves", () => {
  beforeEach(resetDatabase);

  it("is carried forward when a resave omits the url, and cleared by a different url", async () => {
    const { athlete, program } = await setup();
    const clip = await clipFor(athlete.id);
    const saved = await logDay(athlete.id, program);
    await storage.attachVideoToLoggedSet(athlete.id, {
      ...tupleFor(program),
      workoutSetEntryId: saved.savedSetRowIds[0].id,
      videoUrl: clip,
      reason: "manual",
    });

    // Resave with the url omitted: the omission contract keeps the video AND how it arrived.
    const resaved = await logDay(athlete.id, program, [{ setNumber: 1, reps: "8", weight: "140" }]);
    const kept = await setRow(resaved.savedSetRowIds[0].id);
    expect(kept?.formCheckVideoUrl).toBe(clip);
    expect(kept?.videoAttachReason).toBe("manual");

    // A retake sent inline is an ordinary save; the record of the old arrival goes with the old clip.
    const retake = await clipFor(athlete.id);
    const retaken = await logDay(athlete.id, program, [
      { setNumber: 1, reps: "8", weight: "140", formCheckVideoUrl: retake },
    ]);
    const fresh = await setRow(retaken.savedSetRowIds[0].id);
    expect(fresh?.formCheckVideoUrl).toBe(retake);
    expect(fresh?.videoAttachReason).toBeNull();
  });
});

describe("the unattached list, athlete and coach", () => {
  beforeEach(resetDatabase);

  async function orphanFor(athlete: { id: number }, program: Program, clip: string) {
    return storage.recordUnattachedVideoUpload({
      athleteId: athlete.id,
      videoUrl: clip,
      label: "Bench Press · Set 1",
      cause: "no_log_for_date",
      attachReason: "offline_flush",
      target: tupleFor(program),
    });
  }

  it("lets the athlete pick one of the day's video-less sets and link the clip by hand", async () => {
    const { athlete, program } = await setup();
    const clip = await clipFor(athlete.id);
    const orphan = await orphanFor(athlete, program, clip);
    const saved = await logDay(athlete.id, program, [
      { setNumber: 1, reps: "10", weight: "135", formCheckVideoUrl: await clipFor(athlete.id) },
      { setNumber: 2, reps: "10", weight: "135" },
    ]);
    const client = await loginAs(server.baseUrl, athlete);

    const list = await client.request("GET", "/api/athlete/unattached-videos");
    expect(list.body.map((o: { id: number }) => o.id)).toEqual([orphan.id]);

    // Only the set without a video is offered.
    const candidates = await client.request("GET", `/api/athlete/unattached-videos/${orphan.id}/candidate-sets`);
    expect(candidates.status).toBe(200);
    expect(candidates.body.map((c: { setNumber: number }) => c.setNumber)).toEqual([2]);
    expect(candidates.body[0].exerciseName).toBe("Bench Press");
    const target = candidates.body[0].workoutSetEntryId as number;
    expect(target).toBe(saved.savedSetRowIds[1].id);

    // Picking the set that already has a video is refused, and the orphan stays open.
    const refused = await client.request("POST", `/api/athlete/unattached-videos/${orphan.id}/attach`, {
      body: { workoutSetEntryId: saved.savedSetRowIds[0].id },
    });
    expect(refused.status).toBe(409);
    expect((await storage.listUnattachedVideoUploads(athlete.id)).length).toBe(1);

    const linked = await client.request("POST", `/api/athlete/unattached-videos/${orphan.id}/attach`, {
      body: { workoutSetEntryId: target },
    });
    expect(linked.status).toBe(200);
    expect(linked.body).toEqual({ attached: true, via: "row_id" });
    const row = await setRow(target);
    expect(row?.formCheckVideoUrl).toBe(clip);
    expect(row?.videoAttachReason).toBe("manual");
    expect(await storage.listUnattachedVideoUploads(athlete.id)).toHaveLength(0);
    const [resolved] = await db.select().from(unattachedVideoUploads).where(eq(unattachedVideoUploads.id, orphan.id));
    expect(resolved.resolvedHow).toBe("attached");
  });

  it("dismiss keeps the file and stops listing the clip; another athlete cannot touch it", async () => {
    const { athlete, program } = await setup();
    const clip = await clipFor(athlete.id);
    const orphan = await orphanFor(athlete, program, clip);
    const stranger = await makeLoginableUser({ role: "athlete", name: "Stranger" });

    const theirs = await loginAs(server.baseUrl, stranger);
    expect((await theirs.request("POST", `/api/athlete/unattached-videos/${orphan.id}/dismiss`)).status).toBe(404);
    expect((await theirs.request("GET", `/api/athlete/unattached-videos/${orphan.id}/candidate-sets`)).status).toBe(404);

    const mine = await loginAs(server.baseUrl, athlete);
    expect((await mine.request("POST", `/api/athlete/unattached-videos/${orphan.id}/dismiss`)).status).toBe(200);
    expect(await storage.listUnattachedVideoUploads(athlete.id)).toHaveLength(0);
    const [row] = await db.select().from(uploadedFiles).where(eq(uploadedFiles.path, clip));
    expect(row).toBeDefined();
  });

  it("the coach sees the open list for a roster athlete and nothing for anyone else", async () => {
    const { coach, athlete, program } = await setup();
    const clip = await clipFor(athlete.id);
    await orphanFor(athlete, program, clip);
    const other = await setup();

    const client = await loginAs(server.baseUrl, coach);
    const own = await client.request("GET", `/api/coach/roster/${athlete.id}/unattached-videos`);
    expect(own.status).toBe(200);
    expect(own.body).toHaveLength(1);
    expect(own.body[0]).toMatchObject({ videoUrl: clip, cause: "no_log_for_date" });

    const notMine = await client.request("GET", `/api/coach/roster/${other.athlete.id}/unattached-videos`);
    expect(notMine.status).toBe(404);
  });
});
