import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { athleteHeights, bodyMetrics, coachAthletes, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { resetDatabase } from "./test-support/fixtures";
import {
  loginAs,
  makeLoginableUser,
  startTestServer,
  type TestClient,
  type TestServer,
} from "./test-support/http-app";
import { fetchAnvilStateInputs } from "./anvil-state-source";
import { assembleAnvilState } from "@shared/anvil-athlete-state";
import { dayContextFrom, weekBeside, besideLine } from "@shared/anvil-day-context";
import { isPresent } from "@shared/anvil-inputs";
import { MIN_GROWTH_SPAN_DAYS } from "@shared/anvil-growth";
import { storage } from "./storage";

/**
 * THE DATED HEIGHT, END TO END: THE ROUTES, THE SERIES, AND THE RATE ON A COACH'S WEEK.
 *
 * `shared/anvil-growth.ts` has been unit-tested and correct since 2026-11-07 and had NO PRODUCTION
 * CALLER, because Forge collected no dated height: `users.height_in` is one current value. That is
 * the exact shape this repo keeps paying for -- `strength-profile.itest.ts` setting
 * `isForgeOfficial: true` on its own fixture row and so being structurally unable to notice that
 * nothing in the real library was ever flagged. **A test that supplies the input it is meant to be
 * checking for cannot fail for the input being absent.** So this file supplies none of it: every
 * height below is written through the real route, and every read comes back through the real SQL.
 *
 * Four properties are only true end to end:
 *   - THE SERIES REACHES THE RATE. The query, the inches-to-centimetres conversion and the module's
 *     own window all have to line up, and a unit mistake here reads as a growth spurt.
 *   - A CORRECTION IS AN UPSERT, not a second row. The unique index is the enforcement and the
 *     storage method's `onConflictDoUpdate` is what uses it; a plain insert throws instead.
 *   - A COACH'S WRITE IS ROSTER-SCOPED, which no unit test can establish.
 *   - THE ROW DIES WITH THE ACCOUNT. The cascade is declared in `shared/schema.ts` and declared is
 *     not present: `reconcile-schema.ts` is additive-only, so a REFERENCES clause inside
 *     `CREATE TABLE IF NOT EXISTS` never reaches a database that already has the table. This table
 *     is new everywhere today, which is precisely when that is worth asserting.
 */

let server: TestServer;
let athlete: Awaited<ReturnType<typeof makeLoginableUser>>;
let athleteClient: TestClient;
let coach: Awaited<ReturnType<typeof makeLoginableUser>>;
let coachClient: TestClient;
let outsiderCoach: Awaited<ReturnType<typeof makeLoginableUser>>;
let outsiderClient: TestClient;

/** An ISO day `n` days before `TODAY`, so no case depends on when it runs. */
const TODAY = "2026-11-08";
function daysBefore(n: number): string {
  const t = Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();
  athlete = await makeLoginableUser({ role: "athlete", name: "Dated Height Athlete" } as never);
  coach = await makeLoginableUser({ role: "coach", name: "Tape Measure Coach" } as never);
  outsiderCoach = await makeLoginableUser({ role: "coach", name: "Another Program" } as never);
  athleteClient = await loginAs(server.baseUrl, athlete);
  coachClient = await loginAs(server.baseUrl, coach);
  outsiderClient = await loginAs(server.baseUrl, outsiderCoach);
  await db.insert(coachAthletes).values([{ coachId: coach.id, athleteId: athlete.id }]);
});

afterAll(async () => {
  await server.close();
});

beforeEach(async () => {
  await db.delete(athleteHeights);
});

describe("a dated height reaches the Anvil's growth signal", () => {
  it("records a height through the athlete's own route and reads it back", async () => {
    const posted = await athleteClient.request("POST", "/api/athlete/heights", {
      body: { date: daysBefore(0), heightIn: 70.5 },
    });
    expect(posted.status).toBe(201);

    const read = await athleteClient.request("GET", "/api/athlete/heights");
    expect(read.status).toBe(200);
    expect(read.body).toHaveLength(1);
    expect(read.body[0].heightIn).toBeCloseTo(70.5, 4);
    expect(read.body[0].date).toBe(daysBefore(0));
  });

  it("corrects rather than duplicates a second answer on one day", async () => {
    const day = daysBefore(0);
    await athleteClient.request("POST", "/api/athlete/heights", { body: { date: day, heightIn: 68 } });
    const fix = await athleteClient.request("POST", "/api/athlete/heights", {
      body: { date: day, heightIn: 58 },
    });
    expect(fix.status).toBe(201);

    const rows = await db.select().from(athleteHeights).where(eq(athleteHeights.athleteId, athlete.id));
    expect(rows, "a second answer on one day must correct the first, not sit beside it").toHaveLength(1);
    expect(rows[0].heightIn).toBeCloseTo(58, 4);
  });

  it("refuses both halves of a missing digit, with the sentence that names the fix", async () => {
    for (const heightIn of [7, 700]) {
      const res = await athleteClient.request("POST", "/api/athlete/heights", {
        body: { date: daysBefore(0), heightIn },
      });
      expect(res.status, `${heightIn} inches should be refused`).toBe(400);
      expect(res.body.message).toMatch(/inches/i);
    }
    const rows = await db.select().from(athleteHeights);
    expect(rows).toHaveLength(0);
  });

  it("lets an athlete delete their own row and nobody else's", async () => {
    await athleteClient.request("POST", "/api/athlete/heights", {
      body: { date: daysBefore(0), heightIn: 70 },
    });
    const [row] = await db.select().from(athleteHeights);

    const stranger = await makeLoginableUser({ role: "athlete", name: "Not Theirs" } as never);
    const strangerClient = await loginAs(server.baseUrl, stranger);
    const refused = await strangerClient.request("DELETE", `/api/athlete/heights/${row.id}`);
    // 204 either way -- the delete is scoped in the WHERE clause, so the assertion is on the ROW.
    expect(refused.status).toBe(204);
    expect(await db.select().from(athleteHeights)).toHaveLength(1);

    const mine = await athleteClient.request("DELETE", `/api/athlete/heights/${row.id}`);
    expect(mine.status).toBe(204);
    expect(await db.select().from(athleteHeights)).toHaveLength(0);
  });

  it("lets the athlete's own coach record one, and refuses a coach from another program", async () => {
    const mine = await coachClient.request("POST", `/api/coach/roster/${athlete.id}/heights`, {
      body: { date: daysBefore(0), heightIn: 71 },
    });
    expect(mine.status).toBe(201);

    const theirs = await outsiderClient.request("POST", `/api/coach/roster/${athlete.id}/heights`, {
      body: { date: daysBefore(1), heightIn: 71 },
    });
    expect(theirs.status).toBe(404);
    expect(JSON.stringify(theirs.body), "a refusal must not name the athlete").not.toContain(
      "Dated Height Athlete",
    );

    const seen = await outsiderClient.request("GET", `/api/coach/roster/${athlete.id}/heights`);
    expect(seen.status).toBe(404);
    expect(await db.select().from(athleteHeights)).toHaveLength(1);
  });

  it("turns two heights four months apart into a rate on the coach's week", async () => {
    // THE PREMISE FIRST: with no heights the signal is an absence somebody can act on. Without
    // this the case below would pass for an athlete the signal never looked at, which is the shape
    // that made the athlete-only retention scoping invisible for months.
    const before = await fetchAnvilStateInputs(athlete.id, daysBefore(0), daysBefore(0));
    const emptyState = assembleAnvilState(before.get(daysBefore(0))!);
    expect(isPresent(emptyState.readings.growth_velocity)).toBe(false);
    expect(
      emptyState.fixableAbsences.find((f) => f.signalId === "growth_velocity")?.absent,
    ).toBe("needs_two_dated_heights");

    // 153 days apart, which clears the module's minimum span.
    const span = MIN_GROWTH_SPAN_DAYS + 33;
    await athleteClient.request("POST", "/api/athlete/heights", {
      body: { date: daysBefore(span), heightIn: 70 },
    });
    await athleteClient.request("POST", "/api/athlete/heights", {
      body: { date: daysBefore(0), heightIn: 71 },
    });

    const inputs = await fetchAnvilStateInputs(athlete.id, daysBefore(0), daysBefore(0));
    const input = inputs.get(daysBefore(0))!;
    expect(input.datedHeightsCm).toHaveLength(2);
    // INCHES IN, CENTIMETRES OUT. A unit slip here reads as a growth spurt, so the conversion is
    // asserted on the value rather than trusted.
    expect(input.datedHeightsCm[0].cm).toBeCloseTo(70 * 2.54, 3);

    const state = assembleAnvilState(input);
    const reading = state.readings.growth_velocity;
    expect(isPresent(reading)).toBe(true);
    if (!isPresent(reading)) return;
    // One inch over `span` days, annualised.
    expect(reading.value as number).toBeCloseTo((2.54 / span) * 365.25, 3);

    // AND IT REACHES A READER, once per athlete rather than on a morning's line.
    const context = dayContextFrom(state);
    const week = weekBeside([context]);
    expect(week.map((b) => b.signalId)).toEqual(["growth_velocity"]);
    expect(week[0].unit).toBe("cm/yr");
    expect(besideLine(context), "a week-shaped reading is not a morning field").not.toContain(
      "growth velocity",
    );
  });

  it("gives each day of a week only the heights measured by then", async () => {
    // A MULTI-DAY RANGE, which is how a coach's week is fetched -- and the only shape in which the
    // in-memory filter does any work. The query is `lte(date, to)`, so on a SINGLE-day range the
    // SQL already excludes a later answer and the filter is redundant; the first version of this
    // case was written that way and a mutation that deleted the filter passed it. Across a week,
    // every day would otherwise be handed the whole series and the earliest morning would carry a
    // rate ending on a measurement nobody had taken yet.
    const span = MIN_GROWTH_SPAN_DAYS + 33;
    await athleteClient.request("POST", "/api/athlete/heights", {
      body: { date: daysBefore(span), heightIn: 70 },
    });
    await athleteClient.request("POST", "/api/athlete/heights", {
      body: { date: daysBefore(2), heightIn: 71 },
    });

    const inputs = await fetchAnvilStateInputs(athlete.id, daysBefore(6), daysBefore(0));
    const early = inputs.get(daysBefore(5))!;
    const late = inputs.get(daysBefore(0))!;

    expect(early.datedHeightsCm, "a day before the second answer has one measurement").toHaveLength(1);
    expect(late.datedHeightsCm).toHaveLength(2);
    expect(isPresent(assembleAnvilState(early).readings.growth_velocity)).toBe(false);
    expect(isPresent(assembleAnvilState(late).readings.growth_velocity)).toBe(true);
  });

  it("does not move users.heightIn, which is what the camera's ruler divides by", async () => {
    const [was] = await db.select({ h: users.heightIn }).from(users).where(eq(users.id, athlete.id));
    await athleteClient.request("POST", "/api/athlete/heights", {
      body: { date: daysBefore(0), heightIn: 71.5 },
    });
    await coachClient.request("POST", `/api/coach/roster/${athlete.id}/heights`, {
      body: { date: daysBefore(1), heightIn: 71 },
    });
    const [now] = await db.select({ h: users.heightIn }).from(users).where(eq(users.id, athlete.id));
    expect(
      now.h,
      "A dated height wrote the profile column. That is a second writer of a fact that has one, " +
        "and it is the heaviest lever on the camera's scale -- so every past take would re-scale " +
        "from a screen that says nothing about the camera.",
    ).toBe(was.h);
  });

  it("keeps the weigh-in's own column required, which is why these are two tables", async () => {
    // The reason `athlete_heights` is not a column on `body_metrics`: a height-only row would need
    // `weight` nullable, and `bodyweightAtLiftSql` reads the most recent weigh-in as the strength
    // percentile's DENOMINATOR -- a null there removes that athlete's percentile silently.
    await athleteClient.request("POST", "/api/athlete/heights", {
      body: { date: daysBefore(0), heightIn: 70 },
    });
    expect(await db.select().from(bodyMetrics)).toHaveLength(0);
    const weighIns = await storage.getBodyMetricsForAthlete(athlete.id);
    expect(weighIns).toHaveLength(0);
  });

  it("takes the row with the account, through the real cascade", async () => {
    const doomed = await makeLoginableUser({ role: "athlete", name: "Leaving Soon" } as never);
    const client = await loginAs(server.baseUrl, doomed);
    await client.request("POST", "/api/athlete/heights", {
      body: { date: daysBefore(0), heightIn: 69 },
    });
    expect(
      await db.select().from(athleteHeights).where(eq(athleteHeights.athleteId, doomed.id)),
    ).toHaveLength(1);

    await db.delete(users).where(eq(users.id, doomed.id));
    expect(
      await db.select().from(athleteHeights).where(eq(athleteHeights.athleteId, doomed.id)),
      "the row outlived the account -- the declared cascade is not present on this database",
    ).toHaveLength(0);
  });
});
