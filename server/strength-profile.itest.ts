import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { exercises, users, workoutLogs, workoutSetEntries } from "@shared/schema";
import { NORM_MIN_COHORT } from "@shared/cohort-norms";
import {
  resetDatabase,
  makeExercise,
  makeAssignedProgram,
} from "./test-support/fixtures";
import {
  startTestServer,
  makeLoginableUser,
  addToRoster,
  loginAs,
  type TestServer,
  type TestClient,
} from "./test-support/http-app";

/**
 * THE STRENGTH PROFILE'S THREE RULES, PROVED AGAINST A REAL DATABASE.
 *
 * Scott set all three on 2026-09-21 and each one is invisible once broken -- every failure
 * mode here produces a NUMBER, not an error, and a wrong percentile looks exactly like a right
 * one:
 *
 *  1. **Forge-official exercises only.** A coach's own lift is not a standard anybody can be
 *     measured against.
 *  2. **Hand-logged weight and reps only.** Never a camera number: everything the camera
 *     produces is uncalibrated, and a score built on it inherits that caveat.
 *  3. **A percentile, never a rank, and never under the cohort floor.** A rank identifies;
 *     this platform has already learned once what a leaderboard gives away.
 */
describe("the strength profile", () => {
  let server: TestServer;
  let athlete: TestClient;
  let coach: TestClient;
  let stranger: TestClient;
  let athleteId: number;
  let coachId: number;
  let forgeSquat: number;
  let coachSquat: number;
  let ids: { assignmentId: number; programDayId: number };

  beforeAll(async () => {
    server = await startTestServer();
    await resetDatabase();
    const adminUser = await makeLoginableUser({ role: "admin" });
    const coachUser = await makeLoginableUser({ role: "coach" });
    // ADULTS on purpose. The under-18 gate makes a minor's account inert until a guardian
    // claims it, which would 403 every request here and answer a question this file is not
    // asking -- the same reason makeLoginableUser defaults to an adult.
    const athleteUser = await makeLoginableUser({
      role: "athlete",
      dateOfBirth: "2004-05-01",
      bodyWeightLbs: 180,
    });
    const strangerUser = await makeLoginableUser({ role: "coach" });
    await addToRoster(coachUser.id, athleteUser.id);
    coachId = coachUser.id;
    athleteId = athleteUser.id;

    // A Forge-official exercise (admin-authored, flagged) and a coach's own, same muscle group.
    const forge = await makeExercise(adminUser.id, { name: "Back Squat", muscleGroup: "Quads" });
    await db.update(exercises).set({ isForgeOfficial: true }).where(eq(exercises.id, forge.id));
    const own = await makeExercise(coachUser.id, { name: "Heavy Squat Variation", muscleGroup: "Quads" });
    forgeSquat = forge.id;
    coachSquat = own.id;

    const assigned = await makeAssignedProgram({
      coachId: coachUser.id,
      athleteId: athleteUser.id,
      exerciseIds: [forge.id, own.id],
    });
    ids = { assignmentId: assigned.assignment.id, programDayId: assigned.day.id };

    coach = await loginAs(server.baseUrl, coachUser);
    athlete = await loginAs(server.baseUrl, athleteUser);
    stranger = await loginAs(server.baseUrl, strangerUser);
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    await db.delete(workoutLogs);
  });

  // workout_logs is unique on (assignment, day, date) -- one session per day, which is right.
  // Each synthetic set therefore gets its own date rather than sharing one.
  let dayCounter = 0;
  function nextDate(): string {
    dayCounter += 1;
    const d = new Date(Date.UTC(2026, 0, 1));
    d.setUTCDate(d.getUTCDate() + dayCounter);
    return d.toISOString().slice(0, 10);
  }

  /** Writes one logged set directly, so a test can control exactly what the scorer sees. */
  async function logSet(opts: {
    exerciseId: number;
    weightLbs: number | null;
    reps: number | null;
    forAthlete?: number;
    /** Only the bodyweight-at-the-time tests care; everything else takes the next free day. */
    date?: string;
  }) {
    const { workoutLogEntries } = await import("@shared/schema");
    const [log] = await db
      .insert(workoutLogs)
      .values({
        assignmentId: ids.assignmentId,
        programDayId: ids.programDayId,
        athleteId: opts.forAthlete ?? athleteId,
        date: opts.date ?? nextDate(),
        completed: true,
      })
      .returning();
    const [entry] = await db
      .insert(workoutLogEntries)
      .values({ workoutLogId: log.id, exerciseId: opts.exerciseId, weightMode: "numeric" })
      .returning();
    await db.insert(workoutSetEntries).values({
      logEntryId: entry.id,
      setNumber: 1,
      reps: String(opts.reps ?? ""),
      weight: String(opts.weightLbs ?? ""),
      weightUnit: "lbs",
      weightLbs: opts.weightLbs,
      repsCount: opts.reps,
    });
  }

  it("scores a Forge exercise and ignores the coach's own", async () => {
    // RULE 1. Both are tagged Quads and the coach's is heavier, so if it were counted it would
    // win -- which is exactly how this would go unnoticed.
    await logSet({ exerciseId: forgeSquat, weightLbs: 225, reps: 5 });
    await logSet({ exerciseId: coachSquat, weightLbs: 405, reps: 5 });

    const res = await athlete.get("/api/athlete/strength-profile");
    expect(res.status).toBe(200);
    const quads = (res.body.groups as { group: string; exerciseName: string | null }[]).find(
      (g) => g.group === "Quads",
    );
    expect(quads?.exerciseName).toBe("Back Squat");
  });

  it("ignores a set with no logged weight or reps", async () => {
    // RULE 2. A camera-only capture writes its own columns and leaves these null; it must not
    // reach the score at all.
    await logSet({ exerciseId: forgeSquat, weightLbs: null, reps: null });
    const res = await athlete.get("/api/athlete/strength-profile");
    const quads = (res.body.groups as { group: string; ratio: number | null }[]).find(
      (g) => g.group === "Quads",
    );
    expect(quads?.ratio).toBeNull();
  });

  it("refuses to turn a set of thirty into a maximal claim", async () => {
    await logSet({ exerciseId: forgeSquat, weightLbs: 135, reps: 30 });
    const res = await athlete.get("/api/athlete/strength-profile");
    const quads = (res.body.groups as { group: string; ratio: number | null }[]).find(
      (g) => g.group === "Quads",
    );
    expect(quads?.ratio).toBeNull();
  });

  it("picks the best ESTIMATED max, not the heaviest bar", async () => {
    // 225x5 estimates to ~262; 245x1 is 245. The heavier bar is the worse lift, and ranking by
    // raw weight would always choose it.
    await logSet({ exerciseId: forgeSquat, weightLbs: 245, reps: 1 });
    await logSet({ exerciseId: forgeSquat, weightLbs: 225, reps: 5 });
    const res = await athlete.get("/api/athlete/strength-profile");
    const quads = (res.body.groups as { group: string; ratio: number | null; reps: number | null }[])
      .find((g) => g.group === "Quads");
    expect(quads?.reps).toBe(5);
  });

  it("gives no percentile under the cohort floor", async () => {
    // RULE 3. One athlete is not a distribution. The honest answer is nothing, which is the
    // same answer the existing cohort norms give.
    await logSet({ exerciseId: forgeSquat, weightLbs: 225, reps: 5 });
    const res = await athlete.get("/api/athlete/strength-profile");
    const quads = (res.body.groups as { group: string; percentile: number | null }[]).find(
      (g) => g.group === "Quads",
    );
    expect(quads?.percentile).toBeNull();
    expect(res.body.cohortSize).toBeLessThan(NORM_MIN_COHORT);
  });

  it("gives a percentile once the cohort is real, and never a rank or a name", async () => {
    await logSet({ exerciseId: forgeSquat, weightLbs: 315, reps: 5 });
    // Enough same-age peers, all weaker, so the athlete should land near the top.
    for (let i = 0; i < NORM_MIN_COHORT + 2; i++) {
      const peer = await makeLoginableUser({
        role: "athlete",
        dateOfBirth: "2004-06-01",
        bodyWeightLbs: 180,
      });
      await logSet({ exerciseId: forgeSquat, weightLbs: 100 + i, reps: 5, forAthlete: peer.id });
    }

    const res = await athlete.get("/api/athlete/strength-profile");
    const quads = (res.body.groups as { group: string; percentile: number | null }[]).find(
      (g) => g.group === "Quads",
    );
    expect(quads?.percentile).not.toBeNull();
    expect(quads!.percentile!).toBeGreaterThan(90);

    // Nothing that resolves to a person, and no ordinal position.
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/"name"/);
    expect(body).not.toMatch(/"rank"/);
    expect(body).not.toMatch(/@example\.test/);
  });

  it("leaves an opted-out athlete out of the distribution", async () => {
    await logSet({ exerciseId: forgeSquat, weightLbs: 225, reps: 5 });
    const optedOut = await makeLoginableUser({
      role: "athlete",
      dateOfBirth: "2004-06-01",
      bodyWeightLbs: 180,
      trackingOptOut: true,
    });
    await logSet({ exerciseId: forgeSquat, weightLbs: 500, reps: 5, forAthlete: optedOut.id });

    const res = await athlete.get("/api/athlete/strength-profile");
    // Their 500 never enters the comparison; with the cohort still under the floor there is no
    // percentile at all, which is the point -- they were not counted.
    expect(res.body.cohortSize).toBeLessThan(NORM_MIN_COHORT);
  });

  it("says nothing without a bodyweight rather than assuming one", async () => {
    // A score computed against a guessed bodyweight looks exactly like a real one.
    await db.update(users).set({ bodyWeightLbs: null }).where(eq(users.id, athleteId));
    await logSet({ exerciseId: forgeSquat, weightLbs: 225, reps: 5 });
    const res = await athlete.get("/api/athlete/strength-profile");
    expect((res.body.groups as { percentile: number | null }[]).every((g) => g.percentile == null)).toBe(true);
    await db.update(users).set({ bodyWeightLbs: 180 }).where(eq(users.id, athleteId));
  });

  it("lets the athlete's own coach read it, and nobody else's", async () => {
    await logSet({ exerciseId: forgeSquat, weightLbs: 225, reps: 5 });
    expect((await coach.get(`/api/coach/roster/${athleteId}/strength-profile`)).status).toBe(200);
    expect((await stranger.get(`/api/coach/roster/${athleteId}/strength-profile`)).status).toBe(404);
  });

  it("narrows to the athlete's own gender when asked, and still needs the floor", async () => {
    // A 17-year-old male seeing all 17-year-olds, then choosing males. The filter must
    // actually change the pool: the females logged here are stronger, so if the filter were
    // ignored the male athlete's percentile would be LOWER, not higher.
    await logSet({ exerciseId: forgeSquat, weightLbs: 300, reps: 5 });
    for (let i = 0; i < NORM_MIN_COHORT + 2; i++) {
      const male = await makeLoginableUser({
        role: "athlete",
        dateOfBirth: "2004-06-01",
        bodyWeightLbs: 180,
        gender: "male",
      });
      await logSet({ exerciseId: forgeSquat, weightLbs: 100 + i, reps: 5, forAthlete: male.id });
      const female = await makeLoginableUser({
        role: "athlete",
        dateOfBirth: "2004-06-01",
        bodyWeightLbs: 180,
        gender: "female",
      });
      await logSet({ exerciseId: forgeSquat, weightLbs: 400 + i, reps: 5, forAthlete: female.id });
    }
    await db.update(users).set({ gender: "male" }).where(eq(users.id, athleteId));

    const broad = await athlete.get("/api/athlete/strength-profile");
    const narrowed = await athlete.get("/api/athlete/strength-profile?gender=true");
    const quadsOf = (body: any) =>
      (body.groups as { group: string; percentile: number | null }[]).find((g) => g.group === "Quads");

    // Against everyone the strong females drag this athlete down; against males alone they are
    // near the top. Different pools, different answers -- which is the filter working.
    expect(quadsOf(broad.body)!.percentile!).toBeLessThan(quadsOf(narrowed.body)!.percentile!);
    expect(narrowed.body.cohortSize).toBeLessThan(broad.body.cohortSize);
    expect(narrowed.body.cohortLabel).toContain("male");
  });

  it("drops a filter the athlete cannot satisfy instead of emptying the cohort", async () => {
    // Somebody with no sport on file asking to narrow by sport would otherwise get "not
    // enough athletes" forever, with nothing to say why.
    await db.update(users).set({ sport: null }).where(eq(users.id, athleteId));
    await logSet({ exerciseId: forgeSquat, weightLbs: 225, reps: 5 });
    const res = await athlete.get("/api/athlete/strength-profile?sport=true");
    expect(res.status).toBe(200);
    expect(res.body.available.sport).toBe(false);
    expect(res.body.cohortLabel).not.toContain("null");
  });

  it("never narrows by a gender answer that is a privacy choice", async () => {
    // A cohort of athletes who chose "prefer not to say" is a group defined by that choice.
    // Measuring somebody against it would turn the choice into a category.
    await db.update(users).set({ gender: "prefer_not_to_say" }).where(eq(users.id, athleteId));
    await logSet({ exerciseId: forgeSquat, weightLbs: 225, reps: 5 });
    const res = await athlete.get("/api/athlete/strength-profile?gender=true");
    expect(res.body.available.gender).toBe(false);
    expect(res.body.cohortLabel).not.toContain("prefer_not_to_say");
    await db.update(users).set({ gender: "male" }).where(eq(users.id, athleteId));
  });

  it("refuses an unauthenticated caller", async () => {
    expect([401, 403]).toContain(
      (await fetch(`${server.baseUrl}/api/athlete/strength-profile`)).status,
    );
  });

  /**
   * A SCORE IS A RATIO, SO THE DENOMINATOR HAS TO BE FROM THE SAME DAY AS THE NUMERATOR.
   *
   * body_metrics has always been a dated weight log; the score simply was not reading it, so a
   * lift from eight months ago was divided by today's weight. The error is largest for exactly
   * the population this feature is for -- a teenager can put on twenty pounds in a season.
   */
  describe("bodyweight at the time of the lift", () => {
    it("scores against the weight logged on or before the lift, not today's", async () => {
      const { bodyMetrics } = await import("@shared/schema");
      await db.delete(bodyMetrics).where(eq(bodyMetrics.athleteId, athleteId));
      // Profile says 180 today; the athlete was 150 when they lifted.
      await db.insert(bodyMetrics).values({
        athleteId,
        date: "2026-03-01",
        weight: 150,
        weightUnit: "lbs",
      });
      await logSet({ exerciseId: forgeSquat, weightLbs: 300, reps: 1, date: "2026-03-10" });

      const res = await athlete.get("/api/athlete/strength-profile");
      const quads = res.body.groups.find((g: any) => g.group === "Quads");
      // A single IS the max -- estimatedOneRepMax does not extrapolate one rep -- so the
      // ratio is 300 over the weight ON THE DAY, 150, not over today's 180.
      expect(quads.ratio).toBeCloseTo(300 / 150, 2);
      expect(quads.bodyweightThenLbs).toBeCloseTo(150, 1);

      await db.delete(bodyMetrics).where(eq(bodyMetrics.athleteId, athleteId));
    });

    it("converts a weight logged in kilos before using it as the denominator", async () => {
      const { bodyMetrics } = await import("@shared/schema");
      await db.delete(bodyMetrics).where(eq(bodyMetrics.athleteId, athleteId));
      await db.insert(bodyMetrics).values({
        athleteId,
        date: "2026-03-01",
        weight: 68,
        weightUnit: "kg",
      });
      await logSet({ exerciseId: forgeSquat, weightLbs: 300, reps: 1, date: "2026-03-10" });

      const res = await athlete.get("/api/athlete/strength-profile");
      const quads = res.body.groups.find((g: any) => g.group === "Quads");
      expect(quads.bodyweightThenLbs).toBeCloseTo(68 * 2.20462, 1);

      await db.delete(bodyMetrics).where(eq(bodyMetrics.athleteId, athleteId));
    });

    it("falls back to the profile weight when nothing was logged that early", async () => {
      const { bodyMetrics } = await import("@shared/schema");
      await db.delete(bodyMetrics).where(eq(bodyMetrics.athleteId, athleteId));
      // The only entry is AFTER the lift, so it cannot be used -- an athlete who weighed in
      // last week tells you nothing about what they weighed last year.
      await db.insert(bodyMetrics).values({
        athleteId,
        date: "2026-06-01",
        weight: 150,
        weightUnit: "lbs",
      });
      await logSet({ exerciseId: forgeSquat, weightLbs: 300, reps: 1, date: "2026-03-10" });

      const res = await athlete.get("/api/athlete/strength-profile");
      const quads = res.body.groups.find((g: any) => g.group === "Quads");
      // The fallback is the number the score used before any of this existed, so an athlete
      // who has never weighed in sees exactly what they saw yesterday.
      expect(quads.ratio).toBeCloseTo(300 / 180, 2);

      await db.delete(bodyMetrics).where(eq(bodyMetrics.athleteId, athleteId));
    });

    it("picks the best RATIO, which is not always the heaviest lift", async () => {
      const { bodyMetrics } = await import("@shared/schema");
      await db.delete(bodyMetrics).where(eq(bodyMetrics.athleteId, athleteId));
      await db.insert(bodyMetrics).values([
        { athleteId, date: "2026-02-01", weight: 150, weightUnit: "lbs" },
        { athleteId, date: "2026-05-01", weight: 200, weightUnit: "lbs" },
      ]);
      // Lighter bar at a much lighter bodyweight beats a heavier bar at 200.
      await logSet({ exerciseId: forgeSquat, weightLbs: 270, reps: 1, date: "2026-02-10" });
      await logSet({ exerciseId: forgeSquat, weightLbs: 300, reps: 1, date: "2026-05-10" });

      const res = await athlete.get("/api/athlete/strength-profile");
      const quads = res.body.groups.find((g: any) => g.group === "Quads");
      expect(quads.weightLbs).toBe(270);
      expect(quads.ratio).toBeCloseTo(270 / 150, 2);

      await db.delete(bodyMetrics).where(eq(bodyMetrics.athleteId, athleteId));
    });
  });

  /** The readback behind tapping a muscle on the body map. */
  describe("the muscle-group history", () => {
    it("lists the Forge sets and leaves the coach's own exercise out", async () => {
      await logSet({ exerciseId: forgeSquat, weightLbs: 225, reps: 5, date: "2026-04-01" });
      await logSet({ exerciseId: coachSquat, weightLbs: 315, reps: 5, date: "2026-04-02" });

      const res = await athlete.get("/api/athlete/muscle-history?group=Quads");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].exerciseName).toBe("Back Squat");
      expect(res.body[0].reps).toBe(5);
      expect(res.body[0].weightLbs).toBe(225);
    });

    it("hands back the as-logged weight and unit, so a kilo set never round-trips", async () => {
      const { workoutLogEntries } = await import("@shared/schema");
      const [log] = await db
        .insert(workoutLogs)
        .values({
          assignmentId: ids.assignmentId,
          programDayId: ids.programDayId,
          athleteId,
          date: "2026-04-05",
          completed: true,
        })
        .returning();
      const [entry] = await db
        .insert(workoutLogEntries)
        .values({ workoutLogId: log.id, exerciseId: forgeSquat, weightMode: "numeric" })
        .returning();
      await db.insert(workoutSetEntries).values({
        logEntryId: entry.id,
        setNumber: 1,
        reps: "3",
        weight: "100",
        weightUnit: "kg",
        weightLbs: 100 * 2.20462,
        repsCount: 3,
      });

      const res = await athlete.get("/api/athlete/muscle-history?group=Quads");
      expect(res.body[0].loggedUnit).toBe("kg");
      expect(res.body[0].loggedWeight).toBe(100);
    });

    it("applies the since floor on the server", async () => {
      await logSet({ exerciseId: forgeSquat, weightLbs: 225, reps: 5, date: "2026-01-15" });
      await logSet({ exerciseId: forgeSquat, weightLbs: 235, reps: 5, date: "2026-07-15" });

      const all = await athlete.get("/api/athlete/muscle-history?group=Quads");
      expect(all.body).toHaveLength(2);
      const recent = await athlete.get("/api/athlete/muscle-history?group=Quads&since=2026-06-01");
      expect(recent.body).toHaveLength(1);
      expect(recent.body[0].date).toBe("2026-07-15");
    });

    it("lets the athlete's own coach read it, and nobody else's", async () => {
      await logSet({ exerciseId: forgeSquat, weightLbs: 225, reps: 5, date: "2026-04-01" });
      const mine = await coach.get(`/api/coach/roster/${athleteId}/muscle-history?group=Quads`);
      expect(mine.status).toBe(200);
      expect(mine.body).toHaveLength(1);
      const theirs = await stranger.get(`/api/coach/roster/${athleteId}/muscle-history?group=Quads`);
      expect(theirs.status).toBe(404);
    });

    it("returns nothing for a group that is not scorable rather than guessing", async () => {
      const res = await athlete.get("/api/athlete/muscle-history?group=NotAMuscle");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });
});