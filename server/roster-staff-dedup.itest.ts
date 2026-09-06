import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { coachAthletes, coachStaff } from "@shared/schema";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

// getRosterForCoach returns one row per coach-athlete LINK, and a staff has
// several coaches. An athlete both coaches already had on their own roster
// before they formed a staff therefore came back twice: listed twice on the
// roster page, and counted twice in anything built on that list.

describe("a shared athlete appears once on a staff roster", () => {
  beforeEach(resetDatabase);

  it("does not list the athlete twice when two coaches join one staff", async () => {
    const primary = await makeCoach();
    const staff = await makeCoach();
    const athlete = await makeAthlete({ name: "Shared Athlete" });

    // Both coaches had this athlete before the staff existed.
    await db.insert(coachAthletes).values({ coachId: primary.id, athleteId: athlete.id });
    await db.insert(coachAthletes).values({ coachId: staff.id, athleteId: athlete.id });
    await db.insert(coachStaff).values({ primaryCoachId: primary.id, staffCoachId: staff.id });

    const roster = await storage.getRosterForCoach(primary.id);
    expect(roster.filter((r) => r.id === athlete.id).length).toBe(1);
    expect(roster.length).toBe(1);
  });

  it("still lists two genuinely different athletes", async () => {
    const primary = await makeCoach();
    const staff = await makeCoach();
    const a = await makeAthlete({ name: "A" });
    const b = await makeAthlete({ name: "B" });
    await db.insert(coachAthletes).values({ coachId: primary.id, athleteId: a.id });
    await db.insert(coachAthletes).values({ coachId: staff.id, athleteId: b.id });
    await db.insert(coachStaff).values({ primaryCoachId: primary.id, staffCoachId: staff.id });

    const roster = await storage.getRosterForCoach(primary.id);
    expect(roster.length).toBe(2);
  });
});
