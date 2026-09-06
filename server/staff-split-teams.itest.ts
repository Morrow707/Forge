import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { coachAthletes, coachStaff, teamMembers, teams } from "@shared/schema";
import { makeAthlete, makeCoach, resetDatabase } from "./test-support/fixtures";

// Team membership outlived the staff link that justified it. Only the
// coach_staff row was deleted, so a departed coach's athletes stayed on the
// org's teams -- on its board, its leaderboard and its challenges -- between
// two accounts no longer connected at all.

describe("removing a staff coach clears the memberships that link created", () => {
  beforeEach(resetDatabase);

  it("takes the departing coach's athlete off the org's team", async () => {
    const primary = await makeCoach();
    const staff = await makeCoach();
    const theirAthlete = await makeAthlete({ name: "Theirs" });
    await db.insert(coachAthletes).values({ coachId: staff.id, athleteId: theirAthlete.id });
    await db.insert(coachStaff).values({ primaryCoachId: primary.id, staffCoachId: staff.id });
    const [team] = await db.insert(teams).values({ coachId: primary.id, name: "Varsity" }).returning();
    await db.insert(teamMembers).values({ teamId: team.id, athleteId: theirAthlete.id });

    await storage.removeCoachStaff(primary.id, staff.id);

    const left = await db.select().from(teamMembers).where(eq(teamMembers.teamId, team.id));
    expect(left.length).toBe(0);
  });

  it("keeps an athlete the primary coaches directly", async () => {
    const primary = await makeCoach();
    const staff = await makeCoach();
    const shared = await makeAthlete({ name: "Shared" });
    // On both rosters independently, so the membership never depended on
    // the staff link.
    await db.insert(coachAthletes).values({ coachId: primary.id, athleteId: shared.id });
    await db.insert(coachAthletes).values({ coachId: staff.id, athleteId: shared.id });
    await db.insert(coachStaff).values({ primaryCoachId: primary.id, staffCoachId: staff.id });
    const [team] = await db.insert(teams).values({ coachId: primary.id, name: "Varsity" }).returning();
    await db.insert(teamMembers).values({ teamId: team.id, athleteId: shared.id });

    await storage.removeCoachStaff(primary.id, staff.id);

    const left = await db.select().from(teamMembers).where(eq(teamMembers.teamId, team.id));
    expect(left.length).toBe(1);
  });

  it("also clears the other direction when a staff coach leaves", async () => {
    const primary = await makeCoach();
    const staff = await makeCoach();
    const primaryAthlete = await makeAthlete({ name: "Primary's" });
    await db.insert(coachAthletes).values({ coachId: primary.id, athleteId: primaryAthlete.id });
    await db.insert(coachStaff).values({ primaryCoachId: primary.id, staffCoachId: staff.id });
    const [staffTeam] = await db.insert(teams).values({ coachId: staff.id, name: "Skills" }).returning();
    await db.insert(teamMembers).values({ teamId: staffTeam.id, athleteId: primaryAthlete.id });

    await storage.leaveCoachStaff(staff.id);

    const left = await db.select().from(teamMembers).where(eq(teamMembers.teamId, staffTeam.id));
    expect(left.length).toBe(0);
  });
});
