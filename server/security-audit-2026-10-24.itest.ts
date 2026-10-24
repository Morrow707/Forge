import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { and, eq } from "drizzle-orm";
import {
  coachAthletes,
  coachStaff,
  consentRecords,
  guardianLinks,
  referenceClips,
  researchSubjects,
  teamChallenges,
  teamMembers,
  teams,
  unattachedVideoUploads,
  users,
} from "@shared/schema";
import { storage } from "./storage";
import {
  makeAssignedProgram,
  makeExercise,
  makeLoggedSetWithVideo,
  makeUploadedFile,
  resetDatabase,
  uploadedFileExists,
} from "./test-support/fixtures";
import {
  TEST_PASSWORD,
  TestClient,
  addToRoster,
  loginAs,
  makeLoginableUser,
  startTestServer,
  type TestServer,
} from "./test-support/http-app";

/**
 * THE 2026-10-24 SECURITY AUDIT, DRIVEN THROUGH THE REAL ROUTES.
 *
 * Every case here is a finding that was verified in the code before it was fixed, and the shape
 * of each case is the attack: a former coach reading a former athlete, a narrowed coach widening
 * their own team, a coach deciding what the documents give to the guardian, a filename becoming a
 * playable link. The report these came from is the session's audit; the fixes are named in each
 * case's comment. Runs on real Postgres because every one of them is a WHERE clause.
 */

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(resetDatabase);

const ADULT_DOB = "1995-06-15";
function dobYearsAgo(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}
const UNDER_13_DOB = dobYearsAgo(10);
const TEEN_DOB = dobYearsAgo(15);

async function makeTeam(coachId: number, name: string, code: string, memberIds: number[]) {
  const [team] = await db.insert(teams).values({ coachId, name, code }).returning();
  if (memberIds.length) await db.insert(teamMembers).values(memberIds.map((athleteId) => ({ teamId: team.id, athleteId })));
  return team;
}

describe("a guardian's withdrawal ends the research participation too", () => {
  it("clears the flag, removes the mirror row, and the WITHDRAWN record does not count as a disclosure", async () => {
    const guardian = await makeLoginableUser({ role: "guardian", name: "Pat Parent" });
    const minor = await makeLoginableUser({ role: "athlete", name: "Kid Athlete", dateOfBirth: TEEN_DOB });
    await db.insert(guardianLinks).values({ athleteId: minor.id, guardianId: guardian.id });
    // Consent as relayed by a coach -- the record the old withdrawal never touched, because it
    // filtered on givenByUserId = guardian.
    const coach = await makeLoginableUser({ role: "coach" });
    await addToRoster(coach.id, minor.id);
    await storage.setResearchDataConsent({ athleteId: minor.id, granted: true, grantedByUserId: coach.id, relayedFrom: "Pat Parent" });
    const before = await storage.getUser(minor.id);
    expect(before?.researchDataConsent).toBe(true);
    expect(before?.researchSubjectId).toBeTruthy();

    const result = await storage.withdrawGuardianConsent({ guardianId: guardian.id, athleteId: minor.id });
    expect(result.ok).toBe(true);

    const after = await storage.getUser(minor.id);
    expect(after?.researchDataConsent).toBe(false);
    const mirror = await db.select().from(researchSubjects).where(eq(researchSubjects.subjectId, before!.researchSubjectId!));
    expect(mirror).toHaveLength(0);
    // And nothing retains the athlete after deletion on the strength of the withdrawal text.
    const { retainSubjectAfterDeletion } = await import("./research-mirror");
    expect(await retainSubjectAfterDeletion(minor.id)).toBe(false);
    const research = await db
      .select()
      .from(consentRecords)
      .where(and(eq(consentRecords.userId, minor.id), eq(consentRecords.consentType, "research_data_use")));
    expect(research.some((r) => r.documentText.startsWith("WITHDRAWN "))).toBe(true);
  });
});

describe("a former athlete is a former athlete", () => {
  it("drops off the assignment list, cannot be posted to, and never carried secrets while on it", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const athlete = await makeLoginableUser({
      role: "athlete",
      name: "Riley Rostered",
      mfaBackupCodeHashes: ["not-for-the-coach"],
    });
    await addToRoster(coach.id, athlete.id);
    const exercise = await makeExercise(coach.id);
    const { assignment, day } = await makeAssignedProgram({ coachId: coach.id, athleteId: athlete.id, exerciseIds: [exercise.id] });
    const client = await loginAs(server.baseUrl, coach);

    const onRoster = await client.get("/api/coach/assignments");
    expect(onRoster.status).toBe(200);
    expect(onRoster.body).toHaveLength(1);
    const row = onRoster.body[0].athlete;
    expect(row.name).toBe("Riley Rostered");
    // The projection: what the screens read, and none of what they must never hold.
    for (const secret of ["calendarToken", "mfaBackupCodeHashes", "mfaSecret", "researchSubjectId", "passwordHash", "agreedToTermsText", "phone", "bodyModel"]) {
      expect(row, secret).not.toHaveProperty(secret);
    }

    await storage.removeAthleteFromCoach(coach.id, athlete.id);
    const afterRemoval = await client.get("/api/coach/assignments");
    expect(afterRemoval.body).toHaveLength(0);
    const skillList = await client.get("/api/coach/skill-assignments");
    expect(skillList.body).toHaveLength(0);
    const post = await client.post(`/api/coach/assignments/${assignment.id}/days/${day.id}/comments`, { body: "still here?" });
    expect(post.status).toBe(404);
    const prs = await client.get("/api/coach/recent-prs");
    expect(prs.status).toBe(200);
    expect(JSON.stringify(prs.body)).not.toContain("Riley Rostered");
  });
});

describe("a narrowed staff coach cannot widen their own scope", () => {
  it("bulk-adding the staff roster onto a team they made adds nobody outside their scope", async () => {
    const primary = await makeLoginableUser({ role: "coach", name: "Primary" });
    const staff = await makeLoginableUser({ role: "coach", name: "Staff" });
    await db.insert(coachStaff).values({ primaryCoachId: primary.id, staffCoachId: staff.id });
    const varsityAthlete = await makeLoginableUser({ role: "athlete", name: "Varsity One" });
    const jvAthlete = await makeLoginableUser({ role: "athlete", name: "Jay Vee" });
    await db.insert(coachAthletes).values([
      { coachId: primary.id, athleteId: varsityAthlete.id },
      { coachId: primary.id, athleteId: jvAthlete.id },
    ]);
    const varsity = await makeTeam(primary.id, "Varsity", "VARS01", [varsityAthlete.id]);
    await makeTeam(primary.id, "JV", "JVJV01", [jvAthlete.id]);
    const primaryClient = await loginAs(server.baseUrl, primary);
    expect((await primaryClient.put(`/api/coach/teams/${varsity.id}/coaches`, { coachIds: [staff.id] })).status).toBe(200);

    const staffClient = await loginAs(server.baseUrl, staff);
    const own = await staffClient.post("/api/coach/teams", { name: "Mine" });
    expect(own.status).toBe(201);
    const bulk = await staffClient.post(`/api/coach/teams/${own.body.id}/members/bulk`, { athleteIds: [jvAthlete.id, varsityAthlete.id] });
    expect(bulk.status).toBe(201);
    expect(bulk.body.added).toBe(1);
    const roster = await staffClient.get("/api/coach/roster");
    expect(roster.body.map((a: any) => a.name)).toEqual(["Varsity One"]);
    expect((await staffClient.get(`/api/coach/roster/${jvAthlete.id}`)).status).toBe(404);
    // The waiver route follows the same scope now.
    expect((await staffClient.get(`/api/waivers/${jvAthlete.id}`)).status).toBe(403);
  });
});

describe("the switches the documents give to the guardian", () => {
  it("a coach can turn tracking off for an under-13 and cannot turn it on", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const child = await makeLoginableUser({ role: "athlete", dateOfBirth: UNDER_13_DOB, trackingOptOut: true });
    await addToRoster(coach.id, child.id);
    const client = await loginAs(server.baseUrl, coach);
    const on = await client.post(`/api/coach/roster/${child.id}/tracking-opt-out`, { trackingOptOut: false });
    expect(on.status).toBe(403);
    expect((await storage.getUser(child.id))?.trackingOptOut).toBe(true);
    const off = await client.post(`/api/coach/roster/${child.id}/tracking-opt-out`, { trackingOptOut: true });
    expect(off.status).toBe(200);
    // A teen's switch is still the coach's to flip either way, as before.
    const teen = await makeLoginableUser({ role: "athlete", dateOfBirth: TEEN_DOB, trackingOptOut: true });
    await addToRoster(coach.id, teen.id);
    expect((await client.post(`/api/coach/roster/${teen.id}/tracking-opt-out`, { trackingOptOut: false })).status).toBe(200);
  });

  it("a coach relays research consent only for a minor whose guardian is not on Forge", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const adult = await makeLoginableUser({ role: "athlete", dateOfBirth: ADULT_DOB });
    const linkedMinor = await makeLoginableUser({ role: "athlete", dateOfBirth: TEEN_DOB });
    const unlinkedMinor = await makeLoginableUser({ role: "athlete", dateOfBirth: TEEN_DOB });
    const guardian = await makeLoginableUser({ role: "guardian" });
    await db.insert(guardianLinks).values({ athleteId: linkedMinor.id, guardianId: guardian.id });
    for (const a of [adult, linkedMinor, unlinkedMinor]) await addToRoster(coach.id, a.id);
    const client = await loginAs(server.baseUrl, coach);
    const body = { granted: true, relayedFrom: "Somebody" };
    expect((await client.put(`/api/coach/roster/${adult.id}/research-consent`, body)).status).toBe(403);
    expect((await client.put(`/api/coach/roster/${linkedMinor.id}/research-consent`, body)).status).toBe(403);
    expect((await client.put(`/api/coach/roster/${unlinkedMinor.id}/research-consent`, body)).status).toBe(200);
    // Turning it off is never refused.
    expect((await client.put(`/api/coach/roster/${adult.id}/research-consent`, { granted: false, relayedFrom: "Somebody" })).status).toBe(200);
  });
});

describe("a filename is not a permission", () => {
  it("a coach cannot copy another athlete's clip into their reference library", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const mine = await makeLoginableUser({ role: "athlete", name: "Mine" });
    const other = await makeLoginableUser({ role: "athlete", name: "Other" });
    await addToRoster(coach.id, mine.id);
    const mineClip = await makeUploadedFile(`mine-${Date.now()}.mp4`);
    const otherClip = await makeUploadedFile(`other-${Date.now()}.mp4`);
    await storage.recordUploadedFile(mineClip, mine.id);
    await storage.recordUploadedFile(otherClip, other.id);
    const client = await loginAs(server.baseUrl, coach);
    const stolen = await client.post("/api/coach/reference-clips/from-athlete", {
      athleteId: mine.id,
      videoUrl: otherClip,
      title: "Not theirs",
      movement: "squat",
    });
    expect(stolen.status).toBe(403);
    const own = await client.post("/api/coach/reference-clips/from-athlete", {
      athleteId: mine.id,
      videoUrl: mineClip,
      title: "Theirs",
      movement: "squat",
    });
    expect(own.status).toBe(201);
  });

  it("attaching somebody else's upload is refused and leaves no unattached record", async () => {
    const athlete = await makeLoginableUser({ role: "athlete" });
    const other = await makeLoginableUser({ role: "athlete" });
    const coach = await makeLoginableUser({ role: "coach" });
    await addToRoster(coach.id, athlete.id);
    const exercise = await makeExercise(coach.id);
    const { assignment, day, programExercises } = await makeAssignedProgram({ coachId: coach.id, athleteId: athlete.id, exerciseIds: [exercise.id] });
    const theirs = await makeUploadedFile(`theirs-${Date.now()}.mp4`);
    await storage.recordUploadedFile(theirs, other.id);
    const client = await loginAs(server.baseUrl, athlete);
    const res = await client.post("/api/athlete/log/attach-video", {
      videoUrl: theirs,
      assignmentId: assignment.id,
      programDayId: day.id,
      date: "2026-01-05",
      programExerciseId: programExercises[0].id,
      setNumber: 1,
    });
    expect(res.status).toBe(403);
    const rows = await db.select().from(unattachedVideoUploads).where(eq(unattachedVideoUploads.athleteId, athlete.id));
    expect(rows).toHaveLength(0);
  });

  it("a video on a day comment is refused once tracking is off", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const athlete = await makeLoginableUser({ role: "athlete", trackingOptOut: true });
    await addToRoster(coach.id, athlete.id);
    const exercise = await makeExercise(coach.id);
    const { assignment, day } = await makeAssignedProgram({ coachId: coach.id, athleteId: athlete.id, exerciseIds: [exercise.id] });
    const clip = await makeUploadedFile(`comment-${Date.now()}.mp4`);
    await storage.recordUploadedFile(clip, athlete.id);
    const client = await loginAs(server.baseUrl, athlete);
    const withVideo = await client.post(`/api/athlete/assignments/${assignment.id}/days/${day.id}/comments`, { body: "look", videoUrl: clip });
    expect(withVideo.status).toBe(403);
    const plain = await client.post(`/api/athlete/assignments/${assignment.id}/days/${day.id}/comments`, { body: "just words" });
    expect(plain.status).toBe(201);
  });
});

describe("what other people are shown", () => {
  it("an unrelated admin gets neither the waiver file nor the athlete's name", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const athlete = await makeLoginableUser({ role: "athlete", name: "Named Person" });
    const client = await loginAs(server.baseUrl, admin);
    const res = await client.get(`/api/waivers/${athlete.id}`);
    expect(res.status).toBe(200);
    expect(res.body.athleteName).toBeNull();
  });

  it("Squad Quests shows teammates as the leaderboard does: first name, last initial, no id", async () => {
    const coach = await makeLoginableUser({ role: "coach" });
    const me = await makeLoginableUser({ role: "athlete", name: "Sam Viewer" });
    const mate = await makeLoginableUser({ role: "athlete", name: "Taylor Teammate" });
    await addToRoster(coach.id, me.id);
    await addToRoster(coach.id, mate.id);
    const team = await makeTeam(coach.id, "Squad", "SQUAD1", [me.id, mate.id]);
    await db.insert(teamChallenges).values({
      teamId: team.id,
      title: "Reps",
      metric: "total_reps",
      targetValue: 1000,
      startDate: "2026-01-01",
      endDate: "2027-01-01",
    });
    const client = await loginAs(server.baseUrl, me);
    const res = await client.get("/api/athlete/team-challenges");
    expect(res.status).toBe(200);
    const per = res.body[0].progress.perAthlete as { name: string; isYou: boolean }[];
    expect(per.map((p) => p.name).sort()).toEqual(["Sam Viewer", "Taylor T."]);
    expect(per.find((p) => p.isYou)?.name).toBe("Sam Viewer");
    expect(JSON.stringify(per)).not.toContain("athleteId");
  });

  it("the detector-training list carries consenting adults only", async () => {
    const admin = await makeLoginableUser({ role: "admin" });
    const coach = await makeLoginableUser({ role: "coach" });
    const exercise = await makeExercise(coach.id);
    async function filmed(overrides: Record<string, unknown>) {
      const a = await makeLoginableUser({ role: "athlete", dateOfBirth: ADULT_DOB, ...overrides });
      await addToRoster(coach.id, a.id);
      const { assignment, day, programExercises } = await makeAssignedProgram({ coachId: coach.id, athleteId: a.id, exerciseIds: [exercise.id] });
      const clip = await makeUploadedFile(`clip-${a.id}.mp4`);
      await makeLoggedSetWithVideo({
        athleteId: a.id,
        assignmentId: assignment.id,
        programDayId: day.id,
        exerciseId: exercise.id,
        programExerciseId: programExercises[0].id,
        date: "2026-01-05",
        videoUrl: clip,
      });
      return clip;
    }
    const consentingAdult = await filmed({ researchDataConsent: true });
    const consentingMinor = await filmed({ researchDataConsent: true, dateOfBirth: TEEN_DOB });
    const optedOut = await filmed({ researchDataConsent: true, trackingOptOut: true });
    const noConsent = await filmed({ researchDataConsent: false });
    const client = await loginAs(server.baseUrl, admin);
    const res = await client.get("/api/admin/detector-training-clips");
    expect(res.status).toBe(200);
    const urls = (res.body.clips as { videoUrl: string }[]).map((c) => c.videoUrl.split("?")[0]);
    expect(urls).toEqual([consentingAdult]);
    for (const excluded of [consentingMinor, optedOut, noConsent]) expect(urls).not.toContain(excluded);
  });
});

describe("the adult's own switch and the guardian's last two controls", () => {
  it("an adult turns camera tracking off in their account, which withdraws the release; a minor cannot", async () => {
    const adult = await makeLoginableUser({ role: "athlete", dateOfBirth: ADULT_DOB, trackingOptOut: false });
    expect((await storage.recordBiometricRelease(adult.id)).ok).toBe(true);
    expect(await storage.hasBiometricConsent(adult.id)).toBe(true);
    const client = await loginAs(server.baseUrl, adult);
    expect((await client.post("/api/athlete/tracking-opt-out", { trackingOptOut: false })).status).toBe(400);
    const off = await client.post("/api/athlete/tracking-opt-out", { trackingOptOut: true });
    expect(off.status).toBe(200);
    expect((await storage.getUser(adult.id))?.trackingOptOut).toBe(true);
    expect(await storage.hasBiometricConsent(adult.id)).toBe(false);

    const minor = await makeLoginableUser({ role: "athlete", dateOfBirth: TEEN_DOB, trackingOptOut: false });
    const minorClient = await loginAs(server.baseUrl, minor);
    expect((await minorClient.post("/api/athlete/tracking-opt-out", { trackingOptOut: true })).status).toBe(403);
  });

  it("a guardian deletes the child's account, and the copies of their footage go with it", async () => {
    const guardian = await makeLoginableUser({ role: "guardian" });
    const child = await makeLoginableUser({ role: "athlete", name: "Casey Child", dateOfBirth: TEEN_DOB });
    const coach = await makeLoginableUser({ role: "coach" });
    await db.insert(guardianLinks).values({ athleteId: child.id, guardianId: guardian.id });
    await addToRoster(coach.id, child.id);
    // A reference clip the coach copied from the child: outside every deletion path until now.
    const copy = await makeUploadedFile(`refcopy-${Date.now()}.mp4`);
    await storage.createReferenceClip({ coachId: coach.id, title: "Copied", videoUrl: copy, source: "from_athlete", sourceAthleteId: child.id });

    const client = await loginAs(server.baseUrl, guardian);
    const wrongPassword = await client.post(`/api/guardian/athletes/${child.id}/delete-account`, {
      password: "not-it",
      confirmAthleteName: "Casey Child",
    });
    expect(wrongPassword.status).toBe(400);
    const wrongName = await client.post(`/api/guardian/athletes/${child.id}/delete-account`, {
      password: TEST_PASSWORD,
      confirmAthleteName: "Someone Else",
    });
    expect(wrongName.status).toBe(400);
    expect(await storage.getUser(child.id)).toBeTruthy();

    const gone = await client.post(`/api/guardian/athletes/${child.id}/delete-account`, {
      password: TEST_PASSWORD,
      confirmAthleteName: "casey child",
    });
    expect(gone.status).toBe(200);
    expect(await storage.getUser(child.id)).toBeUndefined();
    expect(await uploadedFileExists(copy)).toBe(false);
    expect(await db.select().from(referenceClips).where(eq(referenceClips.videoUrl, copy))).toHaveLength(0);
    // The guardian's own account is untouched and holds the record of the act.
    const stillHere = await db.select().from(users).where(eq(users.id, guardian.id));
    expect(stillHere).toHaveLength(1);
    const record = await db
      .select()
      .from(consentRecords)
      .where(and(eq(consentRecords.userId, guardian.id), eq(consentRecords.consentType, "guardian_coppa_consent")));
    expect(record.some((r) => r.documentText.includes("deleted the linked athlete account"))).toBe(true);
  });

  it("an unlinked guardian cannot delete anybody", async () => {
    const guardian = await makeLoginableUser({ role: "guardian" });
    const someoneElsesChild = await makeLoginableUser({ role: "athlete", dateOfBirth: TEEN_DOB });
    const other = await makeLoginableUser({ role: "athlete", dateOfBirth: TEEN_DOB });
    await db.insert(guardianLinks).values({ athleteId: other.id, guardianId: guardian.id });
    const client = await loginAs(server.baseUrl, guardian);
    const res = await client.post(`/api/guardian/athletes/${someoneElsesChild.id}/delete-account`, {
      password: TEST_PASSWORD,
      confirmAthleteName: someoneElsesChild.name,
    });
    expect(res.status).toBe(404);
    expect(await storage.getUser(someoneElsesChild.id)).toBeTruthy();
  });
});
