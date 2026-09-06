import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { users, coachAthletes } from "@shared/schema";
import {
  makeAssignedProgram,
  makeAthlete,
  makeCoach,
  makeExercise,
  makeLoggedSetWithVideo,
  resetDatabase,
} from "./test-support/fixtures";
import { shiftIsoDate, todayInZone, utcToday } from "@shared/athlete-day";

// Training load is bucketed by calendar day, and which day a session falls
// in depends on whose calendar you use. These pin that it is the athlete's.

async function rosterAthlete(coachId: number, timeZone: string | null) {
  const athlete = await makeAthlete();
  if (timeZone) {
    await db.update(users).set({ timeZone }).where(eq(users.id, athlete.id));
  }
  await db.insert(coachAthletes).values({ coachId, athleteId: athlete.id });
  return athlete;
}

async function logLoadOn(opts: { coachId: number; athleteId: number; date: string }) {
  const exercise = await makeExercise(opts.coachId);
  const { assignment, day, programExercises } = await makeAssignedProgram({
    coachId: opts.coachId,
    athleteId: opts.athleteId,
    exerciseIds: [exercise.id],
  });
  await makeLoggedSetWithVideo({
    athleteId: opts.athleteId,
    assignmentId: assignment.id,
    programDayId: day.id,
    exerciseId: exercise.id,
    programExerciseId: programExercises[0].id,
    date: opts.date,
    videoUrl: null as any,
  });
}

describe("the acute window follows the athlete's day, not UTC", () => {
  beforeEach(resetDatabase);

  it("counts a session logged on the athlete's today", async () => {
    const coach = await makeCoach();
    const athlete = await rosterAthlete(coach.id, "America/Los_Angeles");
    const theirToday = todayInZone("America/Los_Angeles");
    await logLoadOn({ coachId: coach.id, athleteId: athlete.id, date: theirToday });

    const summary = await storage.getRosterAcwrSummary(coach.id);
    const row = summary.find((r) => r.athleteId === athlete.id);

    expect(row).toBeDefined();
    expect(row!.ratio).toBeGreaterThan(0);
  });

  it("excludes a session older than the chronic window", async () => {
    const coach = await makeCoach();
    const athlete = await rosterAthlete(coach.id, "America/Los_Angeles");
    const stale = shiftIsoDate(todayInZone("America/Los_Angeles"), -40);
    await logLoadOn({ coachId: coach.id, athleteId: athlete.id, date: stale });

    const summary = await storage.getRosterAcwrSummary(coach.id);
    expect(summary.find((r) => r.athleteId === athlete.id)).toBeUndefined();
  });

  it("gives two athletes in different zones their own windows", async () => {
    const coach = await makeCoach();
    const west = await rosterAthlete(coach.id, "Pacific/Auckland");
    const east = await rosterAthlete(coach.id, "America/Los_Angeles");
    // Each logs on the boundary of their OWN chronic window. Under a single
    // UTC boundary at least one of these lands outside it.
    for (const a of [
      { id: west.id, zone: "Pacific/Auckland" },
      { id: east.id, zone: "America/Los_Angeles" },
    ]) {
      await logLoadOn({
        coachId: coach.id,
        athleteId: a.id,
        date: shiftIsoDate(todayInZone(a.zone), -27),
      });
    }

    const summary = await storage.getRosterAcwrSummary(coach.id);
    expect(summary.map((r) => r.athleteId).sort()).toEqual([west.id, east.id].sort());
  });

  it("falls back to UTC for an athlete with no zone on file", async () => {
    const coach = await makeCoach();
    const athlete = await rosterAthlete(coach.id, null);
    await logLoadOn({ coachId: coach.id, athleteId: athlete.id, date: utcToday() });

    const summary = await storage.getRosterAcwrSummary(coach.id);
    expect(summary.find((r) => r.athleteId === athlete.id)).toBeDefined();
  });

  it("keeps the roster summary and the single-athlete history agreeing", async () => {
    const coach = await makeCoach();
    const athlete = await rosterAthlete(coach.id, "America/Los_Angeles");
    const theirToday = todayInZone("America/Los_Angeles");
    await logLoadOn({ coachId: coach.id, athleteId: athlete.id, date: theirToday });

    const summary = await storage.getRosterAcwrSummary(coach.id);
    const history = await storage.getAcwrHistoryForAthlete(athlete.id);
    const latest = history[history.length - 1];

    // Both read the same load through the same window, so the roster flag
    // and the athlete's own chart must not disagree about today.
    expect(latest?.date).toBe(theirToday);
    expect(summary.find((r) => r.athleteId === athlete.id)?.ratio).toBeCloseTo(latest.ratio ?? 0, 5);
  });
});
