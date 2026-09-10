import { describe, it, expect, beforeEach } from "vitest";
import { storage } from "./storage";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";
import { pool } from "./db";

/**
 * The Admin Query Engine returns individual-level rows, so the properties
 * that keep it de-identified are the whole point of it and belong under
 * test rather than in a comment.
 *
 * Three guarantees:
 *   1. No identity column ever appears in a row.
 *   2. A result set too small to be a group is returned empty, so filters
 *      cannot be narrowed down to a targeted lookup.
 *   3. Subject codes are stable inside one result and different between
 *      results, so two queries cannot be joined into a growing profile.
 */
describe("query engine anonymity", () => {
  let adminId: number;

  beforeEach(async () => {
    await resetDatabase();
    const admin = await makeCoach({ role: "admin", name: "Admin" });
    adminId = admin.id;
  });

  // Opted in explicitly, and NOT by changing the fixture's default. Consent defaults to off and
  // research-consent.itest.ts exists to prove it, so flipping the shared fixture to make this
  // file pass would have broken that one -- and would have left every other suite quietly
  // testing the consent gate instead of whatever it was written for.
  async function makeFootballAthletes(count: number) {
    for (let i = 0; i < count; i++) {
      await makeAthlete({
        sport: "Football",
        age: 17,
        name: `Real Name ${i}`,
        researchDataConsent: true,
      });
    }
  }

  it("returns no rows at all for a cohort below the minimum", async () => {
    // Four is not a group. Returning these rows would let an admin narrow
    // filters until one athlete matched and read their whole health row.
    await makeFootballAthletes(4);
    const rows = await storage.queryAthletesAdvanced(adminId, {
      lookbackDays: 30,
      sport: ["Football"],
    } as any);
    expect(rows).toEqual([]);
  });

  it("leaves out an athlete who has not opted in to data collection", async () => {
    // One consent rule, both surfaces (Scott, 2026-09-10). An athlete who never answered is not
    // counted, which is what opt-in means -- so a cohort of five where two never opted in is a
    // cohort of three, and three is below the floor.
    await makeFootballAthletes(3);
    for (let i = 0; i < 2; i++) {
      await makeAthlete({
        sport: "Football",
        age: 17,
        name: `No Consent ${i}`,
        researchDataConsent: false,
      });
    }
    const rows = await storage.queryAthletesAdvanced(adminId, {
      lookbackDays: 30,
      sport: ["Football"],
    } as any);
    expect(rows).toEqual([]);
  });

  it("counts only the opted-in athletes toward the minimum", async () => {
    await makeFootballAthletes(5);
    await makeAthlete({
      sport: "Football",
      age: 17,
      name: "No Consent",
      researchDataConsent: false,
    });
    const rows = await storage.queryAthletesAdvanced(adminId, {
      lookbackDays: 30,
      sport: ["Football"],
    } as any);
    expect(rows).toHaveLength(5);
  });

  it("returns rows once the cohort reaches the minimum", async () => {
    await makeFootballAthletes(5);
    const rows = await storage.queryAthletesAdvanced(adminId, {
      lookbackDays: 30,
      sport: ["Football"],
    } as any);
    expect(rows).toHaveLength(5);
  });

  it("never includes an identity column or a database id", async () => {
    await makeFootballAthletes(5);
    const [row] = await storage.queryAthletesAdvanced(adminId, {
      lookbackDays: 30,
      sport: ["Football"],
    } as any);

    // athleteId is the one that matters: /api/admin/users/:id turns it
    // straight back into a name, email and date of birth.
    for (const forbidden of ["athleteId", "id", "userId", "name", "email", "dateOfBirth", "team"]) {
      expect(row).not.toHaveProperty(forbidden);
    }
    expect(row).toHaveProperty("subjectCode");
  });

  it("gives every athlete a distinct code within one result", async () => {
    await makeFootballAthletes(6);
    const rows = await storage.queryAthletesAdvanced(adminId, {
      lookbackDays: 30,
      sport: ["Football"],
    } as any);
    const codes = rows.map((r) => r.subjectCode);
    expect(new Set(codes).size).toBe(rows.length);
  });

  it("gives the same athlete different codes across two queries", async () => {
    // Without this, an admin could run one query for a broad cohort and
    // another for a narrow one and intersect the codes to isolate people.
    await makeFootballAthletes(6);
    const filters = { lookbackDays: 30, sport: ["Football"] } as any;
    const first = await storage.queryAthletesAdvanced(adminId, filters);
    const second = await storage.queryAthletesAdvanced(adminId, filters);

    expect(first).toHaveLength(6);
    expect(second).toHaveLength(6);
    const overlap = new Set(first.map((r) => r.subjectCode));
    for (const row of second) {
      expect(overlap.has(row.subjectCode)).toBe(false);
    }
  });

  it("excludes athletes who opted out of tracking", async () => {
    await makeFootballAthletes(5);
    for (let i = 0; i < 3; i++) {
      await makeAthlete({ sport: "Football", age: 17, trackingOptOut: true });
    }
    const rows = await storage.queryAthletesAdvanced(adminId, {
      lookbackDays: 30,
      sport: ["Football"],
    } as any);
    expect(rows).toHaveLength(5);
  });
});

describe("query budget", () => {
  let adminId: number;

  beforeEach(async () => {
    await resetDatabase();
    const admin = await makeCoach({ role: "admin", name: "Admin" });
    adminId = admin.id;
    for (let i = 0; i < 5; i++) {
      await makeAthlete({ sport: "Football", age: 17, researchDataConsent: true });
    }
  });

  const filters = { lookbackDays: 30, sport: ["Football"] } as any;

  it("allows ordinary use and refuses once the daily budget is spent", async () => {
    // The budget exists for differencing, which needs many probes at one
    // narrow group. Answering a real question takes a handful, so the limit
    // sits well above normal use and only bites on the unusual case.
    for (let i = 0; i < 50; i++) {
      await storage.queryAthletesAdvanced(adminId, filters);
    }
    await expect(storage.queryAthletesAdvanced(adminId, filters)).rejects.toThrow(
      /query budget reached/i,
    );
  });

  it("tells the admin when capacity returns rather than just refusing", async () => {
    for (let i = 0; i < 50; i++) {
      await storage.queryAthletesAdvanced(adminId, filters);
    }
    // Captured rather than asserted inside a catch: a bare throw in the try
    // block lands in its own catch and the assertions never run.
    const err = await storage
      .queryAthletesAdvanced(adminId, filters)
      .then(() => null)
      .catch((e) => e);
    expect(err).not.toBeNull();
    expect(err.name).toBe("CohortQueryBudgetExceeded");
    expect(err.budget.limit).toBe(50);
    expect(err.budget.retryAfterMinutes).toBeGreaterThan(0);
  });

  it("budgets each admin separately", async () => {
    const other = await makeCoach({ role: "admin", name: "Other Admin" });
    for (let i = 0; i < 50; i++) {
      await storage.queryAthletesAdvanced(adminId, filters);
    }
    // One admin exhausting their budget must not lock out everyone else.
    await expect(storage.queryAthletesAdvanced(other.id, filters)).resolves.toHaveLength(5);
  });

  it("does not count queries that have aged out of the window", async () => {
    for (let i = 0; i < 50; i++) {
      await storage.queryAthletesAdvanced(adminId, filters);
    }
    await pool.query("UPDATE aggregate_data_access_log SET viewed_at = now() - interval '25 hours'");
    await expect(storage.queryAthletesAdvanced(adminId, filters)).resolves.toHaveLength(5);
  });
});
