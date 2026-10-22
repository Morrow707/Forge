/**
 * TWO THINGS FROM 2026-10-22, BOTH ABOUT A PROFILE WRITE, BOTH NEEDING A REAL POSTGRES.
 *
 * 1. AN EMPTY PROFILE PATCH ANSWERS RATHER THAN HANGING. Every field on `updateProfileSchema` is
 *    optional, so `{}` is a body the validator accepts -- and `db.update(users).set({})` throws
 *    "No values to set" inside drizzle, which escapes past the route handler and leaves the
 *    request hanging instead of answering. The same defect with the same symptom already cost
 *    this repo once, in updateCoachBranding on 2026-10-11, when a coach without Full
 *    Personalization saved only the gated fields; CLAUDE.md records it and the fix was the same
 *    (an empty patch is a read). This is its twin one table over, and it was unreachable from
 *    edit-my-profile-dialog.tsx -- which always resends the full field set -- which is exactly
 *    why it sat undetected: the path that IS taken looks like it worked.
 *
 * 2. A FILMING ROLE'S HEIGHT SURVIVES SIGNUP. server/auth.ts wrote
 *    `heightIn: role === "athlete" ? heightIn : null`, DISCARDING a height a coach or admin
 *    supplied -- two of the three roles in ROLES_THAT_FILM_THEIR_OWN_TRAINING, and height is the
 *    heaviest voter in the camera's scale blend. It is why the admin account carried no height
 *    for weeks, and why the first one to arrive moved eight numbers at once and left an RDL
 *    reading +12% against the bar sensor with no code change between sessions.
 *
 * BOTH NEED A DATABASE. The first because the throw is drizzle's, so mocked storage has nothing
 * to throw and a unit test passes against the broken version; the second because it asserts the
 * stored ROW after the real signup route ran, not what the handler intended to write.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "@shared/schema";
import { storage } from "./storage";
import { resetDatabase, makeAthlete } from "./test-support/fixtures";
import { startTestServer, TestClient, type TestServer } from "./test-support/http-app";

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(async () => {
  await resetDatabase();
});

describe("an empty profile patch is a read", () => {
  it("returns the row unchanged instead of throwing", async () => {
    const athlete = await makeAthlete({ heightIn: 70, bodyWeightLbs: 180 });
    const row = await storage.updateUserProfile(athlete.id, {} as any);
    expect(row).toBeTruthy();
    expect(row.id).toBe(athlete.id);
    // Unchanged is the only correct answer to "change nothing".
    expect(row.heightIn).toBe(70);
    expect(row.bodyWeightLbs).toBe(180);
  });

  it("still writes a non-empty patch", async () => {
    // The guard must not swallow a real update, the way a too-eager early return would.
    const athlete = await makeAthlete({ heightIn: 70 });
    const row = await storage.updateUserProfile(athlete.id, { heightIn: 75 } as any);
    expect(row.heightIn).toBe(75);
    expect((await storage.getUser(athlete.id))?.heightIn).toBe(75);
  });
});

describe("a filming role's height survives signup", () => {
  function coachSignupBody(over: Record<string, unknown> = {}) {
    return {
      email: `coach-${Math.random().toString(36).slice(2)}@example.test`,
      password: "correct-horse-battery-staple-9",
      name: "Head Coach",
      role: "coach",
      dateOfBirth: "1985-04-02",
      agreedToTerms: true,
      expectedAthletes: 34,
      ...over,
    };
  }

  it("KEEPS a height a coach supplied at signup", async () => {
    // signupSchema's heightIn is role-blind, so this body has always been accepted; the server
    // threw the value away on the way to the insert. Driven through the real route because the
    // discard was in the handler, not in storage.
    const body = coachSignupBody({ heightIn: 75, bodyWeightLbs: 210 });
    const res = await new TestClient(server.baseUrl).post("/api/auth/signup", body);
    expect(res.status).toBe(201);
    const row = await db.query.users.findFirst({ where: eq(users.email, body.email) });
    expect(row!.heightIn).toBe(75);
    expect(row!.bodyWeightLbs).toBe(210);
  });

  it("leaves a coach who supplied none at null, and does not require one", async () => {
    // The requirement stays athlete-only on purpose: a coach signing up for a program is not
    // blocked for want of a height they may never film with. Only the DISCARD was the bug.
    const body = coachSignupBody();
    const res = await new TestClient(server.baseUrl).post("/api/auth/signup", body);
    expect(res.status).toBe(201);
    const row = await db.query.users.findFirst({ where: eq(users.email, body.email) });
    expect(row!.heightIn).toBeNull();
  });

  it("still REQUIRES height and weight of an athlete", async () => {
    // The other direction, so the fix cannot be read as loosening the athlete rule.
    const res = await new TestClient(server.baseUrl).post("/api/auth/signup", {
      email: `athlete-${Math.random().toString(36).slice(2)}@example.test`,
      password: "correct-horse-battery-staple-9",
      name: "Adult Athlete",
      role: "athlete",
      dateOfBirth: "1995-06-15",
      sport: "Football",
      position: "WR",
      agreedToTerms: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Height and weight are required.");
  });
});
