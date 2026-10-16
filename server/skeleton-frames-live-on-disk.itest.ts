import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { consentRecords, workoutSetEntries, workoutLogEntries, workoutLogs } from "@shared/schema";
import { resetDatabase, makeExercise, makeAssignedProgram } from "./test-support/fixtures";
import { startTestServer, makeLoginableUser, type TestServer } from "./test-support/http-app";
import { UPLOADS_ROOT } from "./uploaded-files";
import { SET_TRACES_DIR, readSetTraceFile } from "./set-trace-files";
import { offloadSetTraces } from "./set-trace-offload-job";

/** THE DATABASE HALF of set-trace-files.ts, on real Postgres and a real disk: the frames a save
 * is handed land in a file, the row carries the path, a save that omits them carries the path
 * forward instead of ten megabytes, a retake replaces the file, an explicit null removes it,
 * both readers answer the same frames as before, the offload job moves a row written the old
 * way, and account deletion takes the directory with it. */
describe("a set's skeleton frames live in a file on the persistent disk", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(resetDatabase);

  const frame = (t: number) => ({
    t,
    landmarks: Array.from({ length: 33 }, (_, i) => ({ x: i / 33, y: t / 100, z: 0, visibility: 0.9 })),
    worldLandmarks: Array.from({ length: 33 }, (_, i) => ({ x: i, y: t, z: 0, visibility: 0.9 })),
  });
  const frames = (n: number) => Array.from({ length: n }, (_, i) => frame(i));

  async function athleteWithConsent() {
    const coach = await makeLoginableUser({ role: "coach" });
    const athlete = await makeLoginableUser({ role: "athlete", trackingOptOut: false });
    await db.insert(consentRecords).values({
      userId: athlete.id,
      consentType: "biometric_waiver",
      documentText: "Video and Biometric Consent (test)",
      documentVersion: "test",
    });
    const exercise = await makeExercise(coach.id, { name: "Back Squat" });
    const program = await makeAssignedProgram({ coachId: coach.id, athleteId: athlete.id, exerciseIds: [exercise.id] });
    return { coach, athlete, exercise, program };
  }

  function payload(p: Awaited<ReturnType<typeof athleteWithConsent>>["program"], sets: Record<string, unknown>[], baseRevision?: number) {
    return {
      assignmentId: p.assignment.id,
      programDayId: p.day.id,
      date: "2026-10-16",
      completed: false,
      entries: [{ programExerciseId: p.programExercises[0].id, weightMode: "numeric" as const, sets: sets as never }],
      ...(baseRevision != null ? { baseRevision } : {}),
    };
  }

  async function rowsFor(athleteId: number) {
    return db
      .select({
        id: workoutSetEntries.id,
        setNumber: workoutSetEntries.setNumber,
        frames: workoutSetEntries.skeletonFrames,
        path: workoutSetEntries.skeletonFramesPath,
      })
      .from(workoutSetEntries)
      .innerJoin(workoutLogEntries, eq(workoutLogEntries.id, workoutSetEntries.logEntryId))
      .innerJoin(workoutLogs, eq(workoutLogs.id, workoutLogEntries.workoutLogId))
      .where(eq(workoutLogs.athleteId, athleteId))
      .orderBy(workoutSetEntries.setNumber);
  }

  const diskPath = (url: string) => path.join(UPLOADS_ROOT, url.replace(/^\/uploads\//, ""));

  it("a save with frames writes the file, stores the path and keeps the column null", async () => {
    const { athlete, program } = await athleteWithConsent();
    const saved = await storage.submitWorkoutLog(athlete.id, payload(program, [{ setNumber: 1, reps: "5", weight: "135", skeletonFrames: frames(40) }]));
    const [row] = await rowsFor(athlete.id);
    expect(row.frames).toBeNull();
    expect(row.path).toMatch(new RegExp(`^/uploads/${SET_TRACES_DIR}/${athlete.id}/${saved!.id}-pe_\\d+-1-[0-9a-f]{8}\\.json$`));
    expect(fs.existsSync(diskPath(row.path!))).toBe(true);
    expect((await readSetTraceFile(row.path))?.length).toBe(40);
    // The ledger knows the file.
    const ledger = await db.execute(sql`SELECT uploaded_by FROM uploaded_files WHERE path = ${row.path}`);
    const ledgerRows = ((ledger as unknown as { rows?: { uploaded_by: number }[] }).rows ?? []) as { uploaded_by: number }[];
    expect(ledgerRows[0]?.uploaded_by).toBe(athlete.id);
  });

  it("a save that omits the key carries the PATH forward and leaves the file alone", async () => {
    const { athlete, program } = await athleteWithConsent();
    const first = await storage.submitWorkoutLog(athlete.id, payload(program, [{ setNumber: 1, reps: "5", skeletonFrames: frames(10) }]));
    const [before] = await rowsFor(athlete.id);
    const mtime = fs.statSync(diskPath(before.path!)).mtimeMs;
    await storage.submitWorkoutLog(athlete.id, payload(program, [{ setNumber: 1, reps: "6" }], first!.revision));
    const [after] = await rowsFor(athlete.id);
    expect(after.id).not.toBe(before.id); // the set row was re-inserted, as every save does
    expect(after.path).toBe(before.path);
    expect(after.frames).toBeNull();
    expect(fs.statSync(diskPath(after.path!)).mtimeMs).toBe(mtime);
  });

  it("a retake writes a new file and removes the old one after the commit", async () => {
    const { athlete, program } = await athleteWithConsent();
    const first = await storage.submitWorkoutLog(athlete.id, payload(program, [{ setNumber: 1, reps: "5", skeletonFrames: frames(10) }]));
    const [before] = await rowsFor(athlete.id);
    await storage.submitWorkoutLog(athlete.id, payload(program, [{ setNumber: 1, reps: "5", skeletonFrames: frames(20) }], first!.revision));
    const [after] = await rowsFor(athlete.id);
    expect(after.path).not.toBe(before.path);
    expect(fs.existsSync(diskPath(before.path!))).toBe(false);
    expect((await readSetTraceFile(after.path))?.length).toBe(20);
  });

  it("an explicit null clears the path and deletes the file", async () => {
    const { athlete, program } = await athleteWithConsent();
    const first = await storage.submitWorkoutLog(athlete.id, payload(program, [{ setNumber: 1, reps: "5", skeletonFrames: frames(10) }]));
    const [before] = await rowsFor(athlete.id);
    await storage.submitWorkoutLog(athlete.id, payload(program, [{ setNumber: 1, reps: "5", skeletonFrames: null }], first!.revision));
    const [after] = await rowsFor(athlete.id);
    expect(after.path).toBeNull();
    expect(after.frames).toBeNull();
    expect(fs.existsSync(diskPath(before.path!))).toBe(false);
  });

  it("without biometric consent nothing new lands and no file is written", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const athlete = await makeLoginableUser({ role: "athlete" });
    const exercise = await makeExercise(coach.id, { name: "Bench Press" });
    const program = await makeAssignedProgram({ coachId: coach.id, athleteId: athlete.id, exerciseIds: [exercise.id] });
    // Ids restart with every reset while the disk does not, so the check is "no file appeared
    // for this save", not "no directory exists".
    const dir = path.join(UPLOADS_ROOT, SET_TRACES_DIR, String(athlete.id));
    const before = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    await storage.submitWorkoutLog(athlete.id, payload(program, [{ setNumber: 1, reps: "5", skeletonFrames: frames(10) }]));
    const [row] = await rowsFor(athlete.id);
    expect(row.path).toBeNull();
    expect(row.frames).toBeNull();
    expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toEqual(before);
  });

  it("both readers answer the frames from the file, and the clip list counts the set", async () => {
    const { athlete, program } = await athleteWithConsent();
    await storage.submitWorkoutLog(athlete.id, payload(program, [{ setNumber: 1, reps: "5", skeletonFrames: frames(12) }]));
    const [row] = await rowsFor(athlete.id);
    // The clip readers key on a video being attached; give the set one.
    await db
      .update(workoutSetEntries)
      .set({ formCheckVideoUrl: "/uploads/form-videos/x.mp4", barPathTrace: [{ t: 0, x: 0, y: 0 }] })
      .where(eq(workoutSetEntries.id, row.id));
    const clip = await storage.getSetClipFramesForAthlete(athlete.id, row.id);
    expect(clip?.skeletonFrames.length).toBe(12);
    const clips = await storage.getClipsForAthlete(athlete.id);
    expect(clips.find((c) => c.id === row.id)?.hasSkeletonFrames).toBe(true);
    const replay = await storage.getStoredCapturesForReplay(5, { includeSkeleton: true });
    const mine = replay.find((r) => r.setId === row.id) as { skeletonFrames?: unknown[]; skeletonFramesPath?: unknown } | undefined;
    expect(mine?.skeletonFrames?.length).toBe(12);
    expect(mine).not.toHaveProperty("skeletonFramesPath");
  });

  it("the offload job moves a row written the old way and a second run finds nothing", async () => {
    const { athlete, program } = await athleteWithConsent();
    await storage.submitWorkoutLog(athlete.id, payload(program, [{ setNumber: 1, reps: "5" }]));
    const [row] = await rowsFor(athlete.id);
    await db.update(workoutSetEntries).set({ skeletonFrames: frames(7) }).where(eq(workoutSetEntries.id, row.id));
    const first = await offloadSetTraces({ batch: 2 });
    expect(first.moved).toBe(1);
    expect(first.remaining).toBe(0);
    const [moved] = await rowsFor(athlete.id);
    expect(moved.frames).toBeNull();
    expect((await readSetTraceFile(moved.path))?.length).toBe(7);
    expect((await offloadSetTraces()).moved).toBe(0);
    // A later save of the day carries the moved path forward.
    const log = await db.query.workoutLogs.findFirst({ where: eq(workoutLogs.athleteId, athlete.id) });
    await storage.submitWorkoutLog(athlete.id, payload(program, [{ setNumber: 1, reps: "8" }], log!.revision));
    const [again] = await rowsFor(athlete.id);
    expect(again.path).toBe(moved.path);
  });

  it("deleting the account removes the athlete's trace directory", async () => {
    const { athlete, program } = await athleteWithConsent();
    await storage.submitWorkoutLog(athlete.id, payload(program, [{ setNumber: 1, reps: "5", skeletonFrames: frames(3) }]));
    const dir = path.join(UPLOADS_ROOT, SET_TRACES_DIR, String(athlete.id));
    expect(fs.existsSync(dir)).toBe(true);
    await storage.deleteUserRecord(athlete.id);
    expect(fs.existsSync(dir)).toBe(false);
  });
});
