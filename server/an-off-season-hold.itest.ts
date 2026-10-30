/**
 * THE OFF-SEASON HOLD, DRIVEN THROUGH THE REAL ROUTES.
 *
 * Scott, 2026-10-29: "what happens in the off season? They players will come back in a few
 * months, we need to build a database where the coach can put the player on hold, they don't get
 * charged for it, and all of the players data remains for the coach when they come back."
 *
 * Three claims, and not one of them is "a column can be written":
 *   1. the seat stops being billed,
 *   2. the coach keeps reading everything that athlete ever logged,
 *   3. the coach brings them back ALONE -- the practical win over today's removal, where
 *      sendFreeAgentRequest needs the athlete's acceptance and the coach code is theirs to type,
 *      so August is sixty athletes to chase.
 *
 * EVERY CASE ASSERTS ITS PREMISE FIRST, and that is not ceremony: without it a case would pass
 * for an athlete the route never looked at. CLAUDE.md records that shape as what made the
 * athlete-only retention scoping invisible for months.
 *
 * The decision is unit-tested in shared/roster-hold.test.ts (the five questions, called rather
 * than scanned) and the twenty-four `coach_athletes` call sites are held classified by
 * server/every-roster-read-is-hold-aware.test.ts -- including team narrowing on both writers,
 * which is asserted from the source there rather than driven here.
 *
 * SEVEN LOGINS FOR THE WHOLE FILE, AND FIVE COACHES RATHER THAN ONE. loginLimiter allows 15
 * attempts per IP per fifteen minutes and every client here connects from 127.0.0.1, so a login
 * inside each case spends that budget and the file starts failing with 429s that read as
 * authorization bugs -- which is exactly what the first run of this file did, on its last seven
 * cases. The coaches are split rather than shared because most of these cases assert an EXACT
 * billed count, and one coach holding every fixture athlete would turn each of those into an
 * arithmetic over other cases' athletes. So: coach A owns the one athlete the detail, assignment
 * and entitlement cases drive; coach B is the stated-headcount case; coach C is the cohort; coach
 * D exists to have a seat removed out from under it; coach E has a staff, so one athlete holds a
 * link to two coaches. `resetDatabase()` runs ONCE, and what the cases write -- the hold columns
 * -- is cleared between them instead. The seventh actor has no seat at all and is not comped: the
 * patch-safety case for a carve-out that widens access.
 *
 * NINE MUTATIONS, EACH CAUGHT BY THE RIGHT CASE, and the two that are worth keeping:
 *
 *   - Dropping `isNull(heldAt)` from getStaffRosterAthleteIds reds NINE cases, which is the
 *     measured version of that method's own comment ("would reproduce exactly what a REMOVAL
 *     does today"): the scope predicate carries the bill, the unhold, the camera and the cohort.
 *   - Making getRosterForCoach filter holds reds the roster-list case AND both assignment cases,
 *     and the assignment one fails on the SENTENCE rather than the status -- "expected 'Athlete
 *     not on your roster' to contain 'Jordan Reyes'". That is the design argument demonstrated:
 *     filtering the roster read would tell a coach that an athlete sitting on their own screen
 *     under "On hold" was not on their roster.
 *
 * AND ONE WAS NOT CAUGHT BY THE FIRST VERSION OF THIS FILE, which is why two of its cases exist:
 * removing assertSeatIsNotHeld from `createSkillAssignment` alone left all twenty green, because
 * nothing here drove the skill path. Likewise `holdAthlete` scoped to the acting coach's own link
 * instead of every staff link. Both are asserted from the source in the ratchet -- and a scan
 * over a decision can only see the words the decision is written with, never which way it goes
 * (the form-check-destination.ts lesson), so each got a case that drives it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { storage } from "./storage";
import { coachStaff, skillPrograms } from "@shared/schema";
import {
  resetDatabase,
  makeExercise,
  makeAssignedProgram,
  db,
  sql,
} from "./test-support/fixtures";
import {
  startTestServer,
  makeLoginableUser,
  loginAs,
  addToRoster,
  type TestClient,
  type TestServer,
} from "./test-support/http-app";

let server: TestServer;

// Coach A and the one athlete every per-athlete case drives.
let coachA: Awaited<ReturnType<typeof makeLoginableUser>>;
let athleteA: Awaited<ReturnType<typeof makeLoginableUser>>;
let coachAClient: TestClient;
let athleteAClient: TestClient;
let programId: number;
let skillProgramId: number;

// The stated-headcount case: a school that typed 30 at signup.
let athleteB: Awaited<ReturnType<typeof makeLoginableUser>>;
let coachBClient: TestClient;

// The cohort: two athletes on one coach, plus somebody who is not theirs.
let athleteC1: Awaited<ReturnType<typeof makeLoginableUser>>;
let athleteC2: Awaited<ReturnType<typeof makeLoginableUser>>;
let stranger: Awaited<ReturnType<typeof makeLoginableUser>>;
let coachCClient: TestClient;

// The seat that gets removed while parked, on its own coach so nothing else counts it.
let athleteD: Awaited<ReturnType<typeof makeLoginableUser>>;
let coachDClient: TestClient;

// A program with a staff, where one athlete holds a link to BOTH coaches.
let athleteE: Awaited<ReturnType<typeof makeLoginableUser>>;
let coachEClient: TestClient;

// Nobody's athlete, and NOT comped -- the patch-safety actor for the skills carve-out.
let noSeatClient: TestClient;

beforeAll(async () => {
  server = await startTestServer();
  await resetDatabase();

  // The coach code is set explicitly because nothing but the real signup route generates one, and
  // the re-join case below needs an athlete to be able to type it.
  coachA = await makeLoginableUser({
    role: "coach",
    name: "Coach Vance",
    plannedAthleteCount: 0,
    coachCode: "VANCE1",
  });
  // NOT COMPED, which the camera case needs and nothing else minds: `isBetaAccount` has defaulted
  // false since 2026-10-11, so this is the state a real school athlete is in, and a comped fixture
  // would answer true at the first gate and prove nothing about the tier. The assignment route
  // reads the coach's roster and the program, never the athlete's entitlements, so the cases that
  // drive it are unaffected.
  athleteA = await makeLoginableUser({
    role: "athlete",
    name: "Jordan Reyes",
    isBetaAccount: false,
  });
  await addToRoster(coachA.id, athleteA.id);
  const exercise = await makeExercise(coachA.id);
  const assigned = await makeAssignedProgram({
    coachId: coachA.id,
    athleteId: athleteA.id,
    exerciseIds: [exercise.id],
  });
  programId = assigned.program.id;
  const [skillProgram] = await db
    .insert(skillPrograms)
    .values({ coachId: coachA.id, name: "Off-season hitting" })
    .returning();
  skillProgramId = skillProgram.id;
  coachAClient = await loginAs(server.baseUrl, coachA);
  athleteAClient = await loginAs(server.baseUrl, athleteA);

  const coachB = await makeLoginableUser({ role: "coach", plannedAthleteCount: 30 });
  athleteB = await makeLoginableUser({ role: "athlete" });
  await addToRoster(coachB.id, athleteB.id);
  coachBClient = await loginAs(server.baseUrl, coachB);

  const coachC = await makeLoginableUser({ role: "coach", plannedAthleteCount: 0 });
  athleteC1 = await makeLoginableUser({ role: "athlete", name: "Sam Okafor" });
  athleteC2 = await makeLoginableUser({ role: "athlete", name: "Riley Nakamura" });
  stranger = await makeLoginableUser({ role: "athlete", name: "Not Theirs" });
  await addToRoster(coachC.id, athleteC1.id);
  await addToRoster(coachC.id, athleteC2.id);
  coachCClient = await loginAs(server.baseUrl, coachC);

  const coachD = await makeLoginableUser({ role: "coach", plannedAthleteCount: 0 });
  athleteD = await makeLoginableUser({ role: "athlete" });
  await addToRoster(coachD.id, athleteD.id);
  coachDClient = await loginAs(server.baseUrl, coachD);

  // TWO LINKS TO ONE ATHLETE, which is the ordinary state of a school with an assistant: both
  // coaches recruited from the same roster, so `coach_athletes` holds a row per coach. The staff
  // coach is not logged in -- the primary's own client is what drives the hold.
  const coachE = await makeLoginableUser({ role: "coach", plannedAthleteCount: 0 });
  const coachF = await makeLoginableUser({ role: "coach", plannedAthleteCount: 0 });
  await db.insert(coachStaff).values({ primaryCoachId: coachE.id, staffCoachId: coachF.id });
  athleteE = await makeLoginableUser({ role: "athlete", name: "Avery Lindqvist" });
  await addToRoster(coachE.id, athleteE.id);
  await addToRoster(coachF.id, athleteE.id);
  coachEClient = await loginAs(server.baseUrl, coachE);

  // `isBetaAccount: false` is the whole point of this actor and is why it is not `stranger`:
  // makeLoginableUser comps by default, and a comped account answers true at the FIRST
  // entitlement gate, so a beta fixture proves nothing about a tier. A Free Agent who never had
  // a coach is the population the skills gate was built for in 2026-09-19, and the carve-out for
  // a parked seat must not loosen it.
  const noSeat = await makeLoginableUser({ role: "athlete", isBetaAccount: false });
  noSeatClient = await loginAs(server.baseUrl, noSeat);
});

afterAll(async () => {
  await server.close();
});

/** Every seat back on the active roster. The hold columns are the only thing these cases write
 *  that a later case could read, and clearing them is what lets the actors (and their five
 *  logins) survive the whole file -- `resetDatabase()` would take the accounts with them. */
beforeEach(async () => {
  await db.execute(
    sql`UPDATE coach_athletes SET held_at = NULL, held_until = NULL, held_by_coach_id = NULL`,
  );
});

describe("a parked seat is not billed", () => {
  it("drops out of the billed count, and is reported as held beside the quote", async () => {
    // THE PREMISE: the seat is billed before anything is parked. Without it this case would pass
    // for a coach whose roster the count never saw.
    const before = await coachAClient.get("/api/coach/plan");
    expect(before.status).toBe(200);
    expect(before.body.rosterCount).toBe(1);
    expect(before.body.heldCount).toBe(0);
    expect(before.body.billedCount).toBe(1);

    const held = await coachAClient.post(`/api/coach/roster/${athleteA.id}/hold`, {
      heldUntil: "2026-08-15",
    });
    expect(held.status).toBe(204);

    const after = await coachAClient.get("/api/coach/plan");
    expect(after.body.rosterCount).toBe(0);
    expect(after.body.heldCount).toBe(1);
    expect(after.body.billedCount).toBe(0);
  });

  it("is billed again the moment the coach brings them back", async () => {
    await coachAClient.post(`/api/coach/roster/${athleteA.id}/hold`, { heldUntil: null });
    expect((await coachAClient.get("/api/coach/plan")).body.billedCount).toBe(0);

    const back = await coachAClient.post(`/api/coach/roster/${athleteA.id}/unhold`, {});
    expect(back.status).toBe(204);

    const after = await coachAClient.get("/api/coach/plan");
    expect(after.body.rosterCount).toBe(1);
    expect(after.body.heldCount).toBe(0);
    expect(after.body.billedCount).toBe(1);
  });

  it("does NOT lower a quote the school's own stated headcount already decides", async () => {
    // PINNED BECAUSE IT READS AS A BUG AND IS THE DESIGN. billedCount is the LARGER of the seats
    // held and the number the school typed at signup, so a program that said "about 30" and parks
    // its whole roster still bills the 30 band -- they are a 30-athlete program and they will be
    // back. The hold's money effect is real where the roster has outgrown the estimate, which is
    // the population coach-band-drift-job exists to measure; a school that wants the quote to fall
    // lowers its own number, the field directly above heldCount on that screen.
    expect((await coachBClient.get("/api/coach/plan")).body.billedCount).toBe(30);

    await coachBClient.post(`/api/coach/roster/${athleteB.id}/hold`, { heldUntil: null });

    const after = await coachBClient.get("/api/coach/plan");
    expect(after.body.rosterCount).toBe(0);
    expect(after.body.heldCount).toBe(1);
    expect(after.body.billedCount).toBe(30);
  });
});

describe("the coach keeps reading everything a parked athlete logged", () => {
  it("still opens their detail page, and it says the seat is parked", async () => {
    // THE PREMISE: the page opens before the hold, so a 200 after it is not a page that was
    // always reachable regardless.
    const before = await coachAClient.get(`/api/coach/roster/${athleteA.id}`);
    expect(before.status).toBe(200);
    expect(before.body.heldAt).toBeNull();

    await coachAClient.post(`/api/coach/roster/${athleteA.id}/hold`, { heldUntil: "2026-08-15" });

    // THE CLAIM. Every per-athlete coach route 404s through getRosterAthleteForCoach, so this one
    // 200 is what keeps a hold from being the removal it replaces.
    const after = await coachAClient.get(`/api/coach/roster/${athleteA.id}`);
    expect(after.status).toBe(200);
    expect(after.body.name).toBe("Jordan Reyes");
    expect(after.body.heldAt).not.toBeNull();
    expect(after.body.heldUntil).toBe("2026-08-15");
  });

  it("stays on the roster read as ONE list carrying the flag, never a second query", async () => {
    await coachAClient.post(`/api/coach/roster/${athleteA.id}/hold`, { heldUntil: "2026-08-15" });

    const roster = await coachAClient.get("/api/coach/roster");
    expect(roster.status).toBe(200);
    expect(roster.body).toHaveLength(1);
    expect(roster.body[0].id).toBe(athleteA.id);
    expect(roster.body[0].heldAt).not.toBeNull();
    expect(roster.body[0].heldUntil).toBe("2026-08-15");
  });

  it("stays in the coach's scope, which is what every other read resolves through", async () => {
    expect(await storage.athleteIsInCoachScope(coachA.id, athleteA.id)).toBe(true);

    await coachAClient.post(`/api/coach/roster/${athleteA.id}/hold`, { heldUntil: null });

    // The 2026-10-24 audit made a current roster seat part of being in scope, so this one
    // predicate carries the analytics, both leaderboards, exercise history, recent PRs, the
    // calendar and the training-history export through a hold with no edit of their own.
    expect(await storage.athleteIsInCoachScope(coachA.id, athleteA.id)).toBe(true);
    expect(await storage.athleteIdsInCoachScope(coachA.id)).toContain(athleteA.id);
  });
});

describe("nothing new lands on a parked seat", () => {
  const assignmentBody = () => ({
    programId,
    athletes: [{ athleteId: athleteA.id, correctivesEnabled: false }],
    startDate: "2026-09-01",
    durationWeeks: 1,
  });

  it("refuses the assignment, and the refusal names the HOLD rather than the roster", async () => {
    // THE PREMISE: this exact assignment succeeds while the seat is active. Re-assigning a program
    // an athlete already has is deliberate (running the same block again), so this is the ordinary
    // act rather than a contrived one.
    const allowed = await coachAClient.post("/api/coach/assignments", assignmentBody());
    expect(allowed.status).toBe(201);

    await coachAClient.post(`/api/coach/roster/${athleteA.id}/hold`, { heldUntil: "2026-08-15" });
    const refused = await coachAClient.post("/api/coach/assignments", assignmentBody());

    // THE SENTENCE IS THE POINT, not just the status. getRosterForCoach deliberately still
    // contains a parked athlete, so the route's own "Athlete not on your roster" check passes and
    // the refusal comes from assertSeatIsNotHeld -- which names the hold and the way out of it.
    // Had the roster read filtered holds instead, the coach would have been told an athlete
    // sitting on their own screen under "On hold" was not on their roster.
    expect(refused.status).toBe(400);
    expect(refused.body.message).toContain("Jordan Reyes");
    expect(refused.body.message).toContain("on hold");
    expect(refused.body.message).toContain("2026-08-15");
    expect(refused.body.message).not.toContain("not on your roster");
  });

  it("assigns again the moment they are back", async () => {
    await coachAClient.post(`/api/coach/roster/${athleteA.id}/hold`, { heldUntil: null });
    expect((await coachAClient.post("/api/coach/assignments", assignmentBody())).status).toBe(400);

    await coachAClient.post(`/api/coach/roster/${athleteA.id}/unhold`, {});
    expect((await coachAClient.post("/api/coach/assignments", assignmentBody())).status).toBe(201);
  });

  it("refuses a SKILL assignment too, which no scan over the source could settle", async () => {
    // THE SECOND WRITER, DRIVEN RATHER THAN READ. `every-roster-read-is-hold-aware.test.ts`
    // asserts from the source that both assignment writers call assertSeatIsNotHeld, and that is
    // the right guard for "a third writer added next year must call it" -- but a scan over a
    // decision can only see the words the decision is written with, never which way it goes
    // (form-check-destination.ts paid for that lesson). Proven by mutation: removing the call from
    // `createSkillAssignment` alone left every other case in this file green.
    const body = {
      skillProgramId,
      athletes: [{ athleteId: athleteA.id }],
      startDate: "2026-09-01",
      durationWeeks: 1,
    };

    // THE PREMISE: the skill assignment lands while the seat is active.
    expect((await coachAClient.post("/api/coach/skill-assignments", body)).status).toBe(201);

    await coachAClient.post(`/api/coach/roster/${athleteA.id}/hold`, { heldUntil: "2026-08-15" });
    const refused = await coachAClient.post("/api/coach/skill-assignments", body);
    expect(refused.status).toBe(400);
    expect(refused.body.message).toContain("Jordan Reyes");
    expect(refused.body.message).toContain("on hold");
    expect(refused.body.message).not.toContain("not on your roster");

    await coachAClient.post(`/api/coach/roster/${athleteA.id}/unhold`, {});
    expect((await coachAClient.post("/api/coach/skill-assignments", body)).status).toBe(201);
  });

  it("never refuses an athlete assigning their OWN program", async () => {
    // A parked athlete is a Free Agent who may still build and self-assign, and an athlete
    // self-assigning passes their own id as the coach -- so refusing them here would take away
    // the one thing the off season leaves them, for a reason that is about their coach.
    await coachAClient.post(`/api/coach/roster/${athleteA.id}/hold`, { heldUntil: null });

    // The coach is refused...
    await expect(storage.assertSeatIsNotHeld(athleteA.id, coachA.id)).rejects.toThrow(/on hold/);
    // ...and the athlete is not.
    await expect(storage.assertSeatIsNotHeld(athleteA.id, athleteA.id)).resolves.toBeUndefined();
  });

  it("leaves a 'not your athlete' refusal to the check that owns it", async () => {
    // Widening this to any seat it cannot find would turn every outsider into a sentence about a
    // hold, which is a wrong explanation rather than a missing one.
    await expect(storage.assertSeatIsNotHeld(stranger.id, coachA.id)).resolves.toBeUndefined();
  });
});

describe("the athlete's own plan decides their own features while they are parked", () => {
  it("closes the camera on the way out and opens it again on the way back", async () => {
    // QUESTION 4, and Scott's decision: in the off season they are training on their own, so the
    // camera follows their own tier like any uncoached athlete's. athleteA is deliberately not a
    // beta account -- see the fixture comment; a comped athlete would be allowed either way.

    // THE PREMISE: the coached branch grants it, with no tier on file at all.
    const before = await athleteAClient.get("/api/athlete/camera-access");
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ allowed: true, reason: "coached_athlete" });

    await coachAClient.post(`/api/coach/roster/${athleteA.id}/hold`, { heldUntil: null });
    const parked = await athleteAClient.get("/api/athlete/camera-access");
    expect(parked.body.allowed).toBe(false);
    expect(parked.body.reason).toBe("tier_excludes_camera");

    await coachAClient.post(`/api/coach/roster/${athleteA.id}/unhold`, {});
    const back = await athleteAClient.get("/api/athlete/camera-access");
    expect(back.body).toMatchObject({ allowed: true, reason: "coached_athlete" });
  });

  it("reads as uncoached to themselves while parked, which is one WHERE clause doing all of it", async () => {
    expect((await athleteAClient.get("/api/athlete/coaches")).body).toHaveLength(1);
    await coachAClient.post(`/api/coach/roster/${athleteA.id}/hold`, { heldUntil: null });
    // The client's useIsFreeAgent resolves through this exact route, so this is what flips
    // FreeAgentGate, the class catalog and every other client branch -- nothing is "activated".
    expect((await athleteAClient.get("/api/athlete/coaches")).body).toHaveLength(0);
    await coachAClient.post(`/api/coach/roster/${athleteA.id}/unhold`, {});
    expect((await athleteAClient.get("/api/athlete/coaches")).body).toHaveLength(1);
  });
});

describe("coming back", () => {
  it("is the coach's own act, where undoing a removal is the athlete's", async () => {
    // THE WHOLE REASON THE HOLD EXISTS. A removal needs the athlete to re-enter the coach code,
    // so a coach who removed sixty athletes in June has sixty people to chase in August; a hold
    // never ended their consent to this coach, so lifting it needs nobody's permission but the
    // program's.
    await coachAClient.post(`/api/coach/roster/${athleteA.id}/hold`, { heldUntil: null });
    expect(await storage.getCoachesForAthlete(athleteA.id)).toHaveLength(0);

    const back = await coachAClient.post(`/api/coach/roster/${athleteA.id}/unhold`, {});
    expect(back.status).toBe(204);
    expect(await storage.getCoachesForAthlete(athleteA.id)).toHaveLength(1);
  });

  it("is also what happens if the athlete types the coach code -- the hold is LIFTED, not doubled", async () => {
    // The row already exists, so an insert would collide on the coach/athlete pair index and
    // returning it unchanged would leave them parked after re-joining, with their camera still off
    // and nothing to explain it.
    await coachAClient.post(`/api/coach/roster/${athleteA.id}/hold`, { heldUntil: "2026-08-15" });
    expect(await storage.getCoachesForAthlete(athleteA.id)).toHaveLength(0);

    const joined = await athleteAClient.post("/api/auth/join-coach", {
      coachCode: coachA.coachCode,
    });
    expect(joined.status).toBe(200);

    expect(await storage.getCoachesForAthlete(athleteA.id)).toHaveLength(1);
    const seats = await storage.getCoachSeatsForAthlete(athleteA.id);
    expect(seats).toHaveLength(1);
    expect(seats[0].heldAt).toBeNull();
    expect(seats[0].heldUntil).toBeNull();
  });

  it("answers 404 for a seat that was never parked, so a stale tab reports nothing", async () => {
    const res = await coachAClient.post(`/api/coach/roster/${athleteA.id}/unhold`, {});
    expect(res.status).toBe(404);
  });
});

describe("a hold and a removal are both still available", () => {
  it("removes a parked seat outright, without bringing it back onto the bill first", async () => {
    // A hold is for an athlete coming back and a removal is for one who is not, so a coach who
    // parked a squad in June must be able to remove the five who graduated. That works because
    // athleteIsInCoachScope includes parked seats. On its own coach, since the seat does not come
    // back and every other case here counts its coach's roster exactly.
    await coachDClient.post(`/api/coach/roster/${athleteD.id}/hold`, { heldUntil: null });
    expect((await coachDClient.get("/api/coach/plan")).body.heldCount).toBe(1);

    const removed = await coachDClient.delete(`/api/coach/roster/${athleteD.id}`);
    expect(removed.status).toBe(204);
    expect(await storage.getCoachSeatsForAthlete(athleteD.id)).toHaveLength(0);
    expect((await coachDClient.get("/api/coach/plan")).body.heldCount).toBe(0);
  });
});

describe("a parked athlete reads the skill numbers they already recorded", () => {
  /**
   * Scott, 2026-10-30, against the one item left open when the hold shipped: "let's add that."
   *
   * The skills side asked athleteHasCoach(), which a parked seat answers false, so a parked
   * athlete on no paid tier lost the five skills READS along with the writes -- the sprint times
   * and mechanics scores their coach's program had already produced. The carve-out is the class
   * gate's, one surface over: held = Free Agent for anything they would BUY, coached for anything
   * the program already bought and GAVE them.
   *
   * THE GATE IS TESTED BY DRIVING IT WITH MADE-UP IDS, deliberately. A middleware that refuses
   * must refuse BEFORE anything about the resource is looked up, so a nonexistent assignment id
   * is the sharpest probe there is: a 403 proves the gate ran, and a 404 proves it let the request
   * through to the handler. Asserting "not 402" on the reads says the gate passed without the test
   * having to build a skill assignment to be passed about.
   */

  // The reads that answer 200 on their own. `skill-session-logs` is here with its query param
  // rather than bare: bare it answers 400 from its own handler, which would ALSO have proved the
  // gate passed -- but an assertion that reads "not 402" is satisfied by a route that is broken
  // for some third reason, and 200 with a real list is not.
  const READS_THAT_STAND_ALONE = [
    "/api/athlete/skill-exercises-with-history",
    "/api/athlete/skill-session-logs?skillProgramExerciseId=999999",
    "/api/athlete/leaderboard/skill-exercises",
  ];
  const READS_NEEDING_AN_ASSIGNMENT = [
    "/api/athlete/skill-day/999999/999999",
    "/api/athlete/skill-assignments/999999/days/999999/comments",
  ];
  const WRITES = [
    ["post", "/api/athlete/skill-session-logs"],
    ["post", "/api/athlete/skill-day/999999/999999/complete"],
    ["put", "/api/athlete/skill-day/999999/999999/999999/sets/1"],
    ["post", "/api/athlete/skill-assignments/999999/days/999999/comments"],
  ];

  const park = () => coachAClient.post(`/api/coach/roster/${athleteA.id}/hold`, { heldUntil: "2026-08-15" });

  it("keeps every read open, where before the hold they answered 402", async () => {
    // THE PREMISE: these all open while the seat is active, on the coached branch, with no tier.
    for (const path of READS_THAT_STAND_ALONE) {
      expect((await athleteAClient.get(path)).status).toBe(200);
    }

    await park();

    // THE CLAIM.
    for (const path of READS_THAT_STAND_ALONE) {
      const res = await athleteAClient.get(path);
      expect(res.status).toBe(200);
    }

    // AND THE LEADERBOARD NOW SAYS THE TRUE THING, which is the measured argument for putting a
    // comparative surface with the READS rather than the writes. getSpeedLeaderboardExercisesForAthlete
    // returns null for an athlete with no ACTIVE coach and athlete/leaderboard.tsx draws
    // <NoCoachCard /> on exactly that -- so letting a parked athlete through produces the sentence
    // the page was already built to produce. Refusing them with a 402 instead leaves `exercises`
    // undefined, the `=== null` branch unreached, and the page drawing an empty drill dropdown:
    // the refusal is strictly worse than the pass-through.
    const board = await athleteAClient.get("/api/athlete/leaderboard/skill-exercises");
    expect(board.body).toBeNull();
    for (const path of READS_NEEDING_AN_ASSIGNMENT) {
      // Not 402: whatever the handler then makes of a made-up id, the GATE passed it through.
      expect((await athleteAClient.get(path)).status).not.toBe(402);
    }
  });

  it("refuses every write, and names the hold rather than a plan", async () => {
    await park();
    for (const [verb, path] of WRITES) {
      const res =
        verb === "post"
          ? await athleteAClient.post(path, {})
          : await athleteAClient.put(path, {});
      // 403 AND NOT 404, which is what proves the gate ran before the resource was looked up --
      // every one of these ids is made up. Same argument as the checkout itests asserting 403
      // and not 503: a refusal about WHO is asking has to come first or it is decorative.
      expect(res.status).toBe(403);
      expect(res.body.heldSeat).toBe(true);
      expect(res.body.message).toMatch(/on hold/i);
      // NOT the paywall shape: the client draws a "See plans" button off freeAgentPaywall, and a
      // parked athlete is not short of a plan -- their coach parked them.
      expect(res.body.freeAgentPaywall).toBeUndefined();
      expect(res.body.message).not.toMatch(/AI Coach \+ Video|upgrade/i);
    }
  });

  it("says which of the two states they are in, so the screen can say it too", async () => {
    const before = await athleteAClient.get("/api/athlete/skills-access");
    expect(before.body).toMatchObject({ allowed: true, canRecord: true, reason: "coached_athlete" });

    await park();

    const parked = await athleteAClient.get("/api/athlete/skills-access");
    expect(parked.body).toMatchObject({
      allowed: true,
      canRecord: false,
      reason: "held_seat_history_only",
    });

    await coachAClient.post(`/api/coach/roster/${athleteA.id}/unhold`, {});
    const back = await athleteAClient.get("/api/athlete/skills-access");
    expect(back.body).toMatchObject({ allowed: true, canRecord: true, reason: "coached_athlete" });
  });

  it("gives a parked athlete who BOUGHT the plan all of it, recording included", async () => {
    // THE ORDERING, AND THE ONE THING NO SOURCE SCAN CAN SEE. skillsAccessFor asks whether they
    // have paid BEFORE it asks whether the seat is parked, so somebody paying for AI Coach +
    // Video keeps the whole skills side through the off season. Asking about the hold first would
    // take away what they bought -- the same ordering, and the same argument, as the All Classes
    // add-on being resolved ahead of the coach in classGateFor. A scan over the resolver can read
    // both checks and cannot tell which way the decision goes; this drives it.
    await park();
    expect((await athleteAClient.get("/api/athlete/skills-access")).body.canRecord).toBe(false);

    await storage.updateFreeAgentBilling(athleteA.id, { freeAgentTier: "ai_coach_video" });
    try {
      const paid = await athleteAClient.get("/api/athlete/skills-access");
      expect(paid.body).toMatchObject({ allowed: true, canRecord: true, reason: "entitled" });
      // And the writes really open, not just the flag.
      const res = await athleteAClient.post("/api/athlete/skill-day/999999/999999/complete", {});
      expect(res.status).not.toBe(403);
    } finally {
      // The tier is not hold state, so beforeEach does not clear it -- this case owns it.
      await storage.updateFreeAgentBilling(athleteA.id, { freeAgentTier: null });
    }
  });

  it("still refuses an athlete who never had a coach, with the paywall and not the hold", async () => {
    // The patch-safety case. A Free Agent on no tier is the population this gate was built for in
    // 2026-09-19 and nothing about the hold may loosen it -- this actor has no seat at all, so
    // `seats.length > 0` is false and they fall to tier_excludes_skills. Not comped, or beta
    // would answer true at the first gate and the case would prove nothing.
    const res = await noSeatClient.get("/api/athlete/skills-access");
    expect(res.body).toMatchObject({
      allowed: false,
      canRecord: false,
      reason: "tier_excludes_skills",
    });
    const refused = await noSeatClient.get("/api/athlete/skill-session-logs");
    expect(refused.status).toBe(402);
    expect(refused.body.freeAgentPaywall).toBe(true);
  });
});

describe("a staff is one program, so a hold parks every link to that athlete", () => {
  it("parks BOTH links, so neither the bill nor the athlete reads half-coached", async () => {
    // THE DECISION A SOURCE SCAN CANNOT SETTLE. `every-roster-read-is-hold-aware.test.ts` asserts
    // from the source that both writers scope with `inArray(coachAthletes.coachId, coachIds)` and
    // never a bare `eq`, which is the right guard against a third writer -- but it can only see
    // the words the decision is written with, not which way it goes. Writing one link instead
    // would leave the athlete billed and reading coached through the assistant's row, with the
    // primary's roster screen showing them under "On hold": a seat that is parked and charged at
    // the same time, and no screen anywhere able to show the contradiction.
    //
    // THE PREMISE: two links, one seat, one athlete who reads coached.
    const seatsBefore = await storage.getCoachSeatsForAthlete(athleteE.id);
    expect(seatsBefore).toHaveLength(2);
    expect((await coachEClient.get("/api/coach/plan")).body.billedCount).toBe(1);

    const held = await coachEClient.post(`/api/coach/roster/${athleteE.id}/hold`, {
      heldUntil: "2026-08-15",
    });
    expect(held.status).toBe(204);

    const seats = await storage.getCoachSeatsForAthlete(athleteE.id);
    expect(seats).toHaveLength(2);
    expect(seats.every((seat) => seat.heldAt != null)).toBe(true);
    expect((await coachEClient.get("/api/coach/plan")).body.billedCount).toBe(0);
    expect((await coachEClient.get("/api/coach/plan")).body.heldCount).toBe(1);
    // ZERO is the number that matters here, not one: getCoachesForAthlete answers one row per
    // LINK, so an athlete on a staffed program really does read two coaches -- both of them are
    // theirs. What decides every derived answer is empty against non-empty (athleteHasCoach and
    // the client's useIsFreeAgent both read it that way), and a hold has to empty it.
    expect(await storage.getCoachesForAthlete(athleteE.id)).toHaveLength(0);

    // And back the same way, both links at once.
    expect((await coachEClient.post(`/api/coach/roster/${athleteE.id}/unhold`, {})).status).toBe(
      204,
    );
    const back = await storage.getCoachSeatsForAthlete(athleteE.id);
    expect(back.every((seat) => seat.heldAt == null)).toBe(true);
    expect(await storage.getCoachesForAthlete(athleteE.id)).toHaveLength(2);
  });

  it("counts the athlete ONCE, parked or not, so two links are never two seats", async () => {
    // getHeldSeatsForCoach dedups by athlete and keeps a parked athlete only when NO link of
    // theirs is active, which is the same answer getCoachesForAthlete gives them. Without that,
    // an assistant parking their own link alone would put the athlete on both lists at once.
    expect((await coachEClient.get("/api/coach/plan")).body.rosterCount).toBe(1);
    await coachEClient.post(`/api/coach/roster/${athleteE.id}/hold`, { heldUntil: null });
    const plan = await coachEClient.get("/api/coach/plan");
    expect(plan.body.rosterCount).toBe(0);
    expect(plan.body.heldCount).toBe(1);
  });
});

describe("parking a cohort", () => {
  it("reports per athlete rather than failing the batch", async () => {
    // A coach selecting sixty may well have one in the selection they cannot reach, and refusing
    // the whole action for that is worse than saying which ones did not move -- the opposite trade
    // from assigning a program, which fails closed because a half-assigned program is a training
    // plan nobody has.
    expect((await coachCClient.get("/api/coach/plan")).body.billedCount).toBe(2);

    const res = await coachCClient.post("/api/coach/roster/hold", {
      athleteIds: [athleteC1.id, athleteC2.id, stranger.id],
      heldUntil: "2026-08-15",
    });
    expect(res.status).toBe(200);
    expect(res.body.held).toBe(2);
    expect(res.body.skipped).toBe(1);
    expect(res.body.skippedAthleteIds).toEqual([stranger.id]);

    const plan = await coachCClient.get("/api/coach/plan");
    expect(plan.body.rosterCount).toBe(0);
    expect(plan.body.heldCount).toBe(2);
  });

  it("brings a cohort back the same way", async () => {
    await coachCClient.post("/api/coach/roster/hold", {
      athleteIds: [athleteC1.id, athleteC2.id],
      heldUntil: null,
    });
    expect((await coachCClient.get("/api/coach/plan")).body.heldCount).toBe(2);

    const res = await coachCClient.post("/api/coach/roster/unhold", {
      athleteIds: [athleteC1.id, athleteC2.id],
    });
    expect(res.status).toBe(200);
    expect(res.body.broughtBack).toBe(2);
    expect((await coachCClient.get("/api/coach/plan")).body.billedCount).toBe(2);
  });

  it("refuses a request naming no athletes rather than parking the roster", async () => {
    expect((await coachCClient.post("/api/coach/roster/hold", { athleteIds: [] })).status).toBe(400);
    expect((await coachCClient.post("/api/coach/roster/hold", {})).status).toBe(400);
    expect((await coachCClient.get("/api/coach/plan")).body.heldCount).toBe(0);
  });

  it("refuses a return date that is not a date", async () => {
    const res = await coachCClient.post(`/api/coach/roster/${athleteC1.id}/hold`, {
      heldUntil: "next august",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain("YYYY-MM-DD");
    // And nothing was parked by the refused request.
    expect((await coachCClient.get("/api/coach/plan")).body.heldCount).toBe(0);
  });
});
