import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { classLessons, skillAssignments, skillExercises } from "@shared/schema";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

// A priced lesson is an INDIVIDUAL purchase. Every athlete buys it for
// themselves; a coach buying it grants nothing to their roster, and no
// coach-side unlock opens it. manuallyUnlockLesson clears the unlock RULE
// only -- pacing, prerequisites, the quiz gate -- and its comment used to
// claim otherwise.

async function pricedClass(coachId: number) {
  const [drill] = await db
    .insert(skillExercises)
    .values({ coachId, name: "Tee", sports: ["baseball"], skillType: "Hitting" })
    .returning();
  const cls: any = await storage.createClassWithStructure(
    coachId,
    {
      name: "Paid Hitting",
      lessons: [
        {
          lessonNumber: 1,
          title: "Lesson 1",
          unlockRule: "immediate",
          priceCents: 4999,
          exercises: [{ skillExerciseId: drill.id, orderIndex: 0, sets: 3, reps: "10", trackingLevel: "none" }],
          content: [],
          quizQuestions: [],
        },
      ],
    } as any,
    true,
  );
  return cls;
}

describe("a priced lesson stays an individual purchase", () => {
  beforeEach(resetDatabase);

  it("a coach's unlock does not open it, and says so", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const cls = await pricedClass(coach.id);
    await storage.enrollAthleteInClass(coach.id, cls.id, athlete.id, "2026-09-14");

    const [lesson] = await db.select().from(classLessons).where(eq(classLessons.classId, cls.id));
    const enrollment = await storage.getClassEnrollmentForAthlete(athlete.id, cls.id);
    const result = await storage.manuallyUnlockLesson(enrollment!.id, lesson.id);

    // Nothing was scheduled, and the caller is told why rather than being
    // handed progress that still shows it locked for no visible reason.
    expect(result.blockedByPurchase).toBe(true);
    expect(result.newlyUnlocked).toEqual([]);
    expect((await db.select().from(skillAssignments).where(eq(skillAssignments.athleteId, athlete.id))).length).toBe(0);
  });

  it("the athlete's own purchase does open it", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const cls = await pricedClass(coach.id);
    await storage.enrollAthleteInClass(coach.id, cls.id, athlete.id, "2026-09-14");

    const [lesson] = await db.select().from(classLessons).where(eq(classLessons.classId, cls.id));
    const enrollment = await storage.getClassEnrollmentForAthlete(athlete.id, cls.id);
    await storage.markLessonPurchased(enrollment!.id, lesson.id);

    expect((await db.select().from(skillAssignments).where(eq(skillAssignments.athleteId, athlete.id))).length).toBe(1);
  });

  it("one athlete's purchase does not open it for another", async () => {
    const coach = await makeCoach();
    const buyer = await makeAthlete({ name: "Buyer" });
    const other = await makeAthlete({ name: "Other" });
    const cls = await pricedClass(coach.id);
    await storage.enrollAthleteInClass(coach.id, cls.id, buyer.id, "2026-09-14");
    await storage.enrollAthleteInClass(coach.id, cls.id, other.id, "2026-09-14");

    const [lesson] = await db.select().from(classLessons).where(eq(classLessons.classId, cls.id));
    const buyerEnrollment = await storage.getClassEnrollmentForAthlete(buyer.id, cls.id);
    await storage.markLessonPurchased(buyerEnrollment!.id, lesson.id);

    expect((await db.select().from(skillAssignments).where(eq(skillAssignments.athleteId, buyer.id))).length).toBe(1);
    expect((await db.select().from(skillAssignments).where(eq(skillAssignments.athleteId, other.id))).length).toBe(0);
  });
});
