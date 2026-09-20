import { beforeEach, describe, expect, it } from "vitest";
import { wellnessCheckins } from "@shared/schema";
import { db, makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";
import { addToRoster } from "./test-support/http-app";
import { onDbQuery } from "./db";
import { storage } from "./storage";

// getRecurringPainEscalations backs the coach's roster page and used to read each athlete's
// wellness history in its own statement -- one query per roster row, on the one list in the
// app that runs to hundreds. This holds the statement count flat as the roster grows, and
// checks the batched read reproduces the per-athlete one it replaced.

beforeEach(resetDatabase);

async function buildRoster(size: number) {
  const coach = await makeCoach();
  const athletes = [];
  for (let i = 0; i < size; i++) {
    // Adults and minors alternate, since the threshold differs (3 flags vs 2).
    const athlete = await makeAthlete({ dateOfBirth: i % 2 === 0 ? "1995-06-15" : "2012-06-15" });
    await addToRoster(coach.id, athlete.id);
    athletes.push(athlete);
    // Twenty check-ins so the newest-fourteen window matters: the oldest six carry a region
    // that must NOT count.
    await db.insert(wellnessCheckins).values(
      Array.from({ length: 20 }, (_, d) => ({
        athleteId: athlete.id,
        date: `2026-08-${String(d + 1).padStart(2, "0")}`,
        sleepHours: 7,
        soreness: 2,
        stress: 2,
        bodyPainMap: d < 6 ? ["stale-region"] : d % (i + 2) === 0 ? ["knee"] : d % 3 === 0 ? ["knee", "shoulder"] : [],
      })),
    );
  }
  return { coach, athletes };
}

async function countQueries(run: () => Promise<unknown>): Promise<number> {
  let count = 0;
  const stop = onDbQuery(() => count++);
  try {
    await run();
  } finally {
    stop();
  }
  return count;
}

describe("getRecurringPainEscalations", () => {
  it("issues the same number of statements for a roster of 3 and a roster of 12", async () => {
    const small = await buildRoster(3);
    const smallCount = await countQueries(() => storage.getRecurringPainEscalations(small.coach.id));
    await resetDatabase();
    const large = await buildRoster(12);
    const largeCount = await countQueries(() => storage.getRecurringPainEscalations(large.coach.id));
    expect(largeCount).toBe(smallCount);
  });

  it("flags exactly what the per-athlete history would have flagged", async () => {
    const { coach } = await buildRoster(6);
    const batched = await storage.getRecurringPainEscalations(coach.id);
    const roster = await storage.getRosterForCoach(coach.id);
    const expected: { athleteId: number; region: string; flags: number }[] = [];
    for (const athlete of roster) {
      const history = await storage.getWellnessHistoryForAthlete(athlete.id, 14);
      const counts = new Map<string, number>();
      for (const checkin of history) for (const part of checkin.bodyPainMap ?? []) counts.set(part, (counts.get(part) ?? 0) + 1);
      const full = await storage.getUser(athlete.id);
      const threshold = full?.dateOfBirth === "1995-06-15" ? 3 : 2;
      for (const [region, flags] of counts) if (flags >= threshold) expected.push({ athleteId: athlete.id, region, flags });
    }
    const strip = (rows: { athleteId: number; region: string; flags: number }[]) =>
      rows.map(({ athleteId, region, flags }) => ({ athleteId, region, flags })).sort((a, b) => a.athleteId - b.athleteId || a.region.localeCompare(b.region));
    expect(strip(batched)).toEqual(strip(expected));
    expect(batched.length).toBeGreaterThan(0);
    expect(batched.some((r) => r.region === "stale-region")).toBe(false);
  });
});
