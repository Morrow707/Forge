import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import {
  coachAthletes,
  workoutLogEntries,
  workoutLogs,
  workoutSetEntries,
} from "@shared/schema";
import {
  makeAssignedProgram,
  makeAthlete,
  makeCoach,
  makeExercise,
  resetDatabase,
} from "./test-support/fixtures";
import { shiftIsoDate, todayInZone } from "@shared/athlete-day";
import { computeAcwrRisk } from "@shared/load";

// A block can pair a squat in pounds with a kettlebell swing in kilograms --
// the schema supports it and the logging screen offers it per exercise. What
// the analytics did with that was add the two numbers together.

const LBS_PER_KG = 2.20462;

async function logMixedSession(opts: {
  coachId: number;
  athleteId: number;
  date: string;
  sets: { reps: number; weight: number; unit: "lbs" | "kg" }[];
}) {
  const exercise = await makeExercise(opts.coachId);
  const { assignment, day, programExercises } = await makeAssignedProgram({
    coachId: opts.coachId,
    athleteId: opts.athleteId,
    exerciseIds: [exercise.id],
  });
  const [log] = await db
    .insert(workoutLogs)
    .values({
      assignmentId: assignment.id,
      programDayId: day.id,
      athleteId: opts.athleteId,
      date: opts.date,
      completed: true,
    })
    .returning();

  for (const s of opts.sets) {
    // One entry per set so each carries its own unit, which is the shape a
    // mixed block actually produces (the unit lives on the entry).
    const [entry] = await db
      .insert(workoutLogEntries)
      .values({
        workoutLogId: log.id,
        programExerciseId: programExercises[0].id,
        exerciseId: exercise.id,
        weightMode: "numeric",
      })
      .returning();
    await db.insert(workoutSetEntries).values({
      logEntryId: entry.id,
      setNumber: 1,
      reps: String(s.reps),
      weight: String(s.weight),
      weightUnit: s.unit,
      // Written by normalizeSetLoad on the real save path; set here because
      // these rows are inserted directly.
      repsCount: s.reps,
      weightLbs: s.unit === "kg" ? s.weight * LBS_PER_KG : s.weight,
    });
  }
  return { exercise, assignment, day };
}

describe("load sums convert before adding, not after", () => {
  beforeEach(resetDatabase);

  it("computes the risk ratio off converted load when a window mixes units", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: athlete.id });
    const today = todayInZone(null);

    // A uniform unit error cancels out of an acute:chronic ratio -- it is
    // scale-invariant -- so only a window that MIXES units exposes this.
    // That is also the realistic case: an athlete who switched units, or a
    // block pairing a barbell lift in lbs with a kettlebell in kg.
    await logMixedSession({
      coachId: coach.id,
      athleteId: athlete.id,
      date: shiftIsoDate(today, -20),
      sets: [{ reps: 5, weight: 100, unit: "kg" }],
    });
    await logMixedSession({
      coachId: coach.id,
      athleteId: athlete.id,
      date: today,
      sets: [{ reps: 5, weight: 100, unit: "lbs" }],
    });

    const acute = 5 * 100;
    const chronicTotal = acute + 5 * 100 * LBS_PER_KG;
    const { ratio } = computeAcwrRisk(acute, chronicTotal / 4);

    const summary = await storage.getRosterAcwrSummary(coach.id);
    const row = summary.find((r) => r.athleteId === athlete.id);

    expect(row?.ratio).toBeCloseTo(ratio!, 4);
    // Treating the kilogram set as pounds would put the ratio at 2.0.
    expect(row?.ratio).not.toBeCloseTo(2, 2);
  });

  it("adds a mixed block in one unit for the session volume", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: athlete.id });
    const today = todayInZone(null);

    await logMixedSession({
      coachId: coach.id,
      athleteId: athlete.id,
      date: today,
      sets: [
        { reps: 5, weight: 100, unit: "lbs" },
        { reps: 5, weight: 100, unit: "kg" },
      ],
    });

    const sessions = await storage.getRecentSessionsForAthlete(coach.id, athlete.id);
    const session = sessions.find((s) => s.date === today);

    // 5*100 + 5*220.462, not 5*100 + 5*100.
    expect(session?.totalVolume).toBeCloseTo(5 * 100 + 5 * 100 * LBS_PER_KG, 2);
  });

  it("gives the daily load series the converted total", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const today = todayInZone(null);
    await logMixedSession({
      coachId: coach.id,
      athleteId: athlete.id,
      date: today,
      sets: [{ reps: 10, weight: 50, unit: "kg" }],
    });

    const series = await storage.getDailyLoadSeriesForAthlete(athlete.id, today);
    expect(series.find((p) => p.date === today)?.load).toBeCloseTo(10 * 50 * LBS_PER_KG, 2);
  });

  it("skips a bodyweight set rather than counting it as zero load", async () => {
    const coach = await makeCoach();
    const athlete = await makeAthlete();
    const today = todayInZone(null);
    const { exercise, assignment, day } = await logMixedSession({
      coachId: coach.id,
      athleteId: athlete.id,
      date: today,
      sets: [{ reps: 5, weight: 100, unit: "lbs" }],
    });
    const [log] = await db
      .select()
      .from(workoutLogs)
      .where(eq(workoutLogs.athleteId, athlete.id));
    const [entry] = await db
      .insert(workoutLogEntries)
      .values({
        workoutLogId: log.id,
        exerciseId: exercise.id,
        weightMode: "bodyweight",
      })
      .returning();
    await db.insert(workoutSetEntries).values({
      logEntryId: entry.id,
      setNumber: 1,
      reps: "20",
      repsCount: 20,
      weightLbs: null,
    });

    const series = await storage.getDailyLoadSeriesForAthlete(athlete.id, today);
    // The weighted set only. A bodyweight set did not lift zero pounds; it
    // lifted an amount the schema does not record.
    expect(series.find((p) => p.date === today)?.load).toBeCloseTo(5 * 100, 2);
    expect(assignment.id).toBeGreaterThan(0);
    expect(day.id).toBeGreaterThan(0);
  });
});
