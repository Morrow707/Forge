import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import {
  classLessons,
  skillAssignments,
  skillExercises,
  skillProgramDays,
  skillProgramExercises,
  skillProgramWeeks,
  skillSessionLogs,
} from "@shared/schema";
import { makeAthlete, makeCoach, makeUploadedFile, resetDatabase, uploadedFileExists } from "./test-support/fixtures";

// Editing a class must never touch what an enrolled athlete has already
// captured. The lesson's hidden skill-program day used to be deleted and
// rebuilt on EVERY save, and skillSessionLogs cascade off that day -- so a
// title edit silently destroyed every athlete's sessions and clip references
// for the whole class.

async function makeDrill(coachId: number, name: string) {
  const [row] = await db
    .insert(skillExercises)
    .values({ coachId, name, sports: ["baseball"], skillType: "Hitting" })
    .returning();
  return row;
}

function structure(title: string, drillIds: number[], lessonId?: number) {
  return {
    name: "Hitting",
    lessons: [
      {
        ...(lessonId ? { id: lessonId } : {}),
        lessonNumber: 1,
        title,
        unlockRule: "immediate" as const,
        exercises: drillIds.map((id, i) => ({
          skillExerciseId: id,
          orderIndex: i,
          sets: 3,
          reps: "10",
          trackingLevel: "none" as const,
        })),
        content: [],
        quizQuestions: [],
      },
    ],
  };
}

async function captureSession(athleteId: number, classId: number) {
  const [lesson] = await db.select().from(classLessons).where(eq(classLessons.classId, classId));
  const [week] = await db
    .select()
    .from(skillProgramWeeks)
    .where(eq(skillProgramWeeks.programId, lesson.skillProgramId!));
  const [day] = await db
    .select()
    .from(skillProgramDays)
    .where(eq(skillProgramDays.weekId, week.id));
  const [ex] = await db
    .select()
    .from(skillProgramExercises)
    .where(eq(skillProgramExercises.dayId, day.id));
  const [assignment] = await db
    .insert(skillAssignments)
    .values({
      skillProgramId: lesson.skillProgramId!,
      athleteId,
      coachId: athleteId,
      startDate: "2026-01-05",
    })
    .returning();
  const [log] = await db
    .insert(skillSessionLogs)
    .values({
      skillAssignmentId: assignment.id,
      skillProgramDayId: day.id,
      skillProgramExerciseId: ex.id,
      athleteId,
      trackingLevel: "mechanics",
      videoUrl: "/uploads/skill-videos/kept.mp4",
    })
    .returning();
  return { log, day, ex, lesson };
}

async function setup() {
  const coach = await makeCoach();
  const athlete = await makeAthlete();
  const a = await makeDrill(coach.id, "Tee work");
  const b = await makeDrill(coach.id, "Front toss");
  const cls = await storage.createClassWithStructure(coach.id, structure("Lesson one", [a.id, b.id]), false);
  const classId = (cls as any).id ?? (cls as any).classId ?? cls;
  const captured = await captureSession(athlete.id, classId);
  return { coach, athlete, a, b, classId, captured };
}

describe("editing a class preserves athlete history", () => {
  beforeEach(resetDatabase);

  it("keeps a captured session when only the lesson title changes", async () => {
    const { classId, captured } = await setup();
    await storage.updateClassStructure(
      classId,
      structure("Lesson one (revised)", [captured.ex.skillExerciseId, 0].slice(0, 1).concat([]) as any, captured.lesson.id) as any,
    );
    const rows = await db.select().from(skillSessionLogs).where(eq(skillSessionLogs.id, captured.log.id));
    expect(rows.length).toBe(1);
    expect(rows[0].videoUrl).toBe("/uploads/skill-videos/kept.mp4");
  });

  it("keeps it across an unchanged save, which the autosave fires constantly", async () => {
    const { classId, captured, a, b } = await setup();
    await storage.updateClassStructure(classId, structure("Lesson one", [a.id, b.id], captured.lesson.id) as any);
    await storage.updateClassStructure(classId, structure("Lesson one", [a.id, b.id], captured.lesson.id) as any);
    const rows = await db.select().from(skillSessionLogs).where(eq(skillSessionLogs.id, captured.log.id));
    expect(rows.length).toBe(1);
  });

  it("keeps the day row identity, which is what the logs hang off", async () => {
    const { classId, captured, a, b } = await setup();
    await storage.updateClassStructure(classId, structure("Renamed", [a.id, b.id], captured.lesson.id) as any);
    const [week] = await db
      .select()
      .from(skillProgramWeeks)
      .where(eq(skillProgramWeeks.programId, captured.lesson.skillProgramId!));
    const days = await db.select().from(skillProgramDays).where(eq(skillProgramDays.weekId, week.id));
    expect(days.length).toBe(1);
    expect(days[0].id).toBe(captured.day.id);
    expect(days[0].title).toBe("Renamed");
  });

  it("still applies the coach's actual edits to the drill list", async () => {
    const { classId, captured, a } = await setup();
    await storage.updateClassStructure(classId, structure("Lesson one", [a.id], captured.lesson.id) as any);
    const exercises = await db
      .select()
      .from(skillProgramExercises)
      .where(eq(skillProgramExercises.dayId, captured.day.id));
    expect(exercises.length).toBe(1);
    expect(exercises[0].skillExerciseId).toBe(a.id);
  });
});

// Class lessons matched drill rows by position while the sibling skill-program
// path matched them by drill identity. Positional reuse meant swapping a drill
// silently reattributed the athlete's captured sessions to the new drill.
describe("swapping a drill in a lesson does not relabel captured sessions", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("keeps the session attached to the drill it was captured for", async () => {
    const { a, b, classId, captured } = await setup();
    // Drill a is in slot one. Reorder so b leads.
    await storage.updateClassStructure(
      classId,
      structure("Lesson one", [b.id, a.id], captured.lesson.id) as any,
    );

    const after = await db.select().from(skillSessionLogs).where(eq(skillSessionLogs.id, captured.log.id));
    expect(after.length).toBe(1);
    const rows = await db
      .select()
      .from(skillProgramExercises)
      .where(eq(skillProgramExercises.dayId, captured.day.id));
    const linked = rows.find((r) => r.id === after[0].skillProgramExerciseId);
    expect(linked?.skillExerciseId).toBe(a.id);
  });
});

// Removing a lesson deletes its skill program, which cascades down to every
// enrolled athlete's captured sessions. The rows went; the video files did
// not, so the app reported the footage as gone while the bytes stayed in the
// uploads volume forever. That is athlete video, often a minor's.
describe("removing a lesson takes its media off disk", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("deletes the video file behind a removed lesson's captured session", async () => {
    const { coach, a, classId, captured } = await setup();
    const videoUrl = await makeUploadedFile(`removed-lesson-${Date.now()}.mp4`);
    await db
      .update(skillSessionLogs)
      .set({ videoUrl })
      .where(eq(skillSessionLogs.id, captured.log.id));
    expect(await uploadedFileExists(videoUrl)).toBe(true);

    // Save the class with no lessons at all -- the coach removed it.
    await storage.updateClassStructure(classId, { name: "Hitting", lessons: [] } as any);

    expect((await db.select().from(skillSessionLogs).where(eq(skillSessionLogs.id, captured.log.id))).length).toBe(0);
    expect(await uploadedFileExists(videoUrl)).toBe(false);
    expect(a.id).toBeGreaterThan(0);
    expect(coach.id).toBeGreaterThan(0);
  });
});
