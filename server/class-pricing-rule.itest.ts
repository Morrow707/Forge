import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { classes, classLessons, skillExercises } from "@shared/schema";
import { storage } from "./storage";
import { resetDatabase, makeCoach } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";

/** The one pricing rule (2026-10-04, shared/class-pricing-rule.ts): chapter one of a Forge
 * class is free to any athlete; the rest come with the All Classes add-on. A Free Agent
 * without it sees later chapters as locked_tier and cannot read them, nothing of theirs lands
 * on the calendar; a beta account or one that bought it, and a coached athlete, see the same
 * class open. The gate is the route, not the screen. */

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

async function forgeClass(ownerId: number) {
  const [drill] = await db.insert(skillExercises).values({ coachId: ownerId, name: "Tee", sports: ["baseball"], skillType: "Hitting" }).returning();
  const exercises = [{ skillExerciseId: drill.id, orderIndex: 0, sets: 3, reps: "10", trackingLevel: "none" }];
  const cls = (await storage.createClassWithStructure(
    ownerId,
    {
      name: "Rule",
      lessons: [1, 2, 3].map((n) => ({
        lessonNumber: n,
        title: `Chapter ${n}`,
        unlockRule: "immediate",
        exercises,
        content: [{ body: `Chapter ${n} text.` }],
        quizQuestions: [],
      })),
    } as any,
    true,
  )) as any;
  await db.update(classes).set({ isDraft: false }).where(eq(classes.id, cls.id));
  const lessons = (await db.select().from(classLessons).where(eq(classLessons.classId, cls.id))).sort((a, b) => a.lessonNumber - b.lessonNumber);
  return { cls, lessons };
}

describe("the one pricing rule", () => {
  it("opens chapter one to a Free Agent without All Classes and locks the rest as locked_tier", async () => {
    const admin = await makeCoach({ role: "admin" });
    const { cls, lessons } = await forgeClass(admin.id);
    // Not a beta account: beta opens every add-on, All Classes included, which is the point.
    const freeAgent = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
    await storage.enrollSelfInClass(freeAgent.id, cls.id, "2026-09-14", true);
    const fa = await loginAs(server.baseUrl, freeAgent);

    const progress = await fa.get(`/api/athlete/classes/${cls.id}/progress`);
    expect(progress.status).toBe(200);
    const states = progress.body.lessons.map((l: any) => [l.lessonNumber, l.state]);
    expect(states[0]).toEqual([1, "active"]);
    expect(states[1]).toEqual([2, "locked_tier"]);
    expect(states[2]).toEqual([3, "locked_tier"]);
    // The title still shows (a syllabus); the content does not.
    expect(progress.body.lessons[1].title).toBe("Chapter 2");
    expect((await fa.get(`/api/athlete/classes/${cls.id}/lessons/${lessons[0].id}/content`)).status).toBe(200);
    expect((await fa.get(`/api/athlete/classes/${cls.id}/lessons/${lessons[1].id}/content`)).status).toBe(404);
    // Nothing after chapter one reached the calendar.
    expect(progress.body.lessons.filter((l: any) => l.skillAssignmentId != null).map((l: any) => l.lessonNumber)).toEqual([1]);
    // Continue points at chapter one, and the catalog says the plan does not open the rest.
    const mine = await fa.get("/api/athlete/my-classes");
    expect(mine.body[0].next).toEqual({ lessonId: lessons[0].id, startAt: "reading" });
    const catalog = await fa.get("/api/athlete/classes");
    expect(catalog.body.find((c: any) => c.id === cls.id).fullAccess).toBe(false);

    // Bought (as the webhook or a verified receipt would write it): every chapter opens.
    await storage.addFreeAgentAddOn(freeAgent.id, "all_classes");
    const after = await fa.get(`/api/athlete/classes/${cls.id}/progress`);
    expect(after.body.lessons.map((l: any) => l.state)).toEqual(["active", "active", "active"]);
    expect((await fa.get(`/api/athlete/classes/${cls.id}/lessons/${lessons[2].id}/content`)).status).toBe(200);
  });

  it("refuses the add-on checkout to a coached athlete, whose classes come from their coach", async () => {
    const coach = await makeCoach();
    const athlete = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
    await addToRoster(coach.id, athlete.id);
    const c = await loginAs(server.baseUrl, athlete);
    const res = await c.post("/api/billing/checkout/free-agent-add-on", { addOnId: "all_classes" });
    expect([400, 403]).toContain(res.status);
  });

  it("opens every chapter to a coached athlete, and every chapter stays unpriced", async () => {
    const admin = await makeCoach({ role: "admin" });
    const { cls, lessons } = await forgeClass(admin.id);
    const coach = await makeCoach();
    const athlete = await makeLoginableUser({ role: "athlete" });
    await addToRoster(coach.id, athlete.id);
    await storage.enrollAthleteInClass(coach.id, cls.id, athlete.id, "2026-09-14");
    const c = await loginAs(server.baseUrl, athlete);
    const progress = await c.get(`/api/athlete/classes/${cls.id}/progress`);
    expect(progress.body.lessons.map((l: any) => l.state)).toEqual(["active", "active", "active"]);
    expect((await c.get(`/api/athlete/classes/${cls.id}/lessons/${lessons[2].id}/content`)).status).toBe(200);
    expect(progress.body.lessons.every((l: any) => l.priceCents == null)).toBe(true);
  });
});
