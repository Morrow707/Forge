import { describe, it, expect, beforeEach } from "vitest";
import { storage } from "./storage";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

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

  async function makeFootballAthletes(count: number) {
    for (let i = 0; i < count; i++) {
      await makeAthlete({ sport: "Football", age: 17, name: `Real Name ${i}` });
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
