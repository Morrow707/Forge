import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { coachAthletes, coachStaff, users } from "@shared/schema";
import { makeCoach, makeAthlete, resetDatabase } from "./test-support/fixtures";

const addToRoster = (coachId: number, athleteId: number) =>
  db.insert(coachAthletes).values({ coachId, athleteId });

/**
 * A PROMOTED COACH RAN A ROSTER AND WAS NEVER ASKED FOR THE INSTITUTIONAL SERVICE AGREEMENT.
 *
 * The rule read `plannedAthleteCount || billingTier` -- what the school SAID, or what they PAID.
 * Both are statements, and three ordinary paths produce a primary coach with neither:
 *
 *   - storage.setUserRole, an admin's "Change role" on More -> Users, promotes an athlete to
 *     coach and writes no plan at all.
 *   - an assistant who signed up with a staff invite code is deliberately given no plan of their
 *     own (see "A school picks its plan at signup"), and becomes primary the moment they leave.
 *   - a coach can clear their own stated number through PUT /api/coach/plan.
 *
 * Each then builds a roster and the documents page draws nothing: a legal surface failing
 * silently, the same shape as a correction wired only to the path nobody takes.
 *
 * Found by the 2026-10-14 audit panel. The roster is consulted LAST and only when both columns
 * are absent, which keeps the two existing behaviours exactly as they were.
 */
describe("who is asked for the Institutional Service Agreement", () => {
  beforeEach(resetDatabase);

  it("asks a coach who has athletes but typed no number and bought no band", async () => {
    const coach = await makeCoach();
    await db
      .update(users)
      .set({ plannedAthleteCount: null, billingTier: null })
      .where(eq(users.id, coach.id));
    // Nothing stated, nothing paid, nobody on the roster: no program yet, nothing owed.
    expect((await storage.getInstitutionalAgreementStatus(coach.id)).required).toBe(false);

    const athlete = await makeAthlete();
    await addToRoster(coach.id, athlete.id);
    const status = await storage.getInstitutionalAgreementStatus(coach.id);
    expect(status.required).toBe(true);
    // And the in-app signing flow is offered, since nothing is on file -- which is the whole
    // point: being asked has to come with a way to answer.
    expect(status.canSignInApp).toBe(true);
    expect(status.onFile).toBe(false);
  });

  it("asks on ONE athlete, because the agreement is about handling a program's athletes at all", async () => {
    const coach = await makeCoach();
    await db.update(users).set({ plannedAthleteCount: null, billingTier: null }).where(eq(users.id, coach.id));
    await addToRoster(coach.id, (await makeAthlete()).id);
    expect((await storage.getInstitutionalAgreementStatus(coach.id)).required).toBe(true);
  });

  it("still asks a school that stated a number and has added nobody yet", async () => {
    // The behaviour that was already right and must not change: a stated headcount is the
    // program declaring itself, and the agreement is owed before the first athlete arrives.
    const coach = await makeCoach();
    await db.update(users).set({ plannedAthleteCount: 30, billingTier: null }).where(eq(users.id, coach.id));
    expect((await storage.getInstitutionalAgreementStatus(coach.id)).required).toBe(true);
  });

  it("still asks an org an admin put on a band with no headcount typed", async () => {
    const coach = await makeCoach();
    await db
      .update(users)
      .set({ plannedAthleteCount: null, billingTier: "band_21_40" })
      .where(eq(users.id, coach.id));
    expect((await storage.getInstitutionalAgreementStatus(coach.id)).required).toBe(true);
  });

  it("asks nothing of an individual coach with no plan, no band and no roster", async () => {
    // A coach filming their own training. This is the one state that stays silent, and it has to:
    // there is no institution, so there is no institutional agreement to sign.
    const coach = await makeCoach();
    await db.update(users).set({ plannedAthleteCount: null, billingTier: null }).where(eq(users.id, coach.id));
    const status = await storage.getInstitutionalAgreementStatus(coach.id);
    expect(status.required).toBe(false);
    expect(status.canSignInApp).toBe(false);
  });

  it("leaves a staff coach reading the primary's, never signing their own", async () => {
    // Signing and uploading are the primary's acts. A staff coach with athletes visible to them
    // must NOT start being asked by this change -- the roster they can see is the program's.
    const primary = await makeCoach();
    const staff = await makeCoach();
    await db.update(users).set({ plannedAthleteCount: null, billingTier: null }).where(eq(users.id, staff.id));
    await db.insert(coachStaff).values({ primaryCoachId: primary.id, staffCoachId: staff.id });
    await addToRoster(primary.id, (await makeAthlete()).id);

    const status = await storage.getInstitutionalAgreementStatus(staff.id);
    expect(status.required).toBe(false);
    expect(status.canSignInApp).toBe(false);
  });
});
