import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { coachAthletes, notifications, users } from "@shared/schema";
import { coachMonthlyCents } from "@shared/billing-tiers";
import { checkPersonalizationNotice } from "./personalization-included-notice";
import { db, makeAthlete, resetDatabase } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";
import { waitForEmailTo } from "./test-support/wait-for-email";

// A COACH PLAN IS $4 AN ATHLETE, AND 50 ATHLETES EARN FULL PERSONALIZATION (Scott, 2026-11-18:
// "Stripe is only charged per athlete", "41 doesn't earn an unlock, 50 earns an unlock").
// Driven through the real routes on real Postgres:
//   1. the roster earns it: 50 athletes on a paid plan do, 49 do not, 41 on the 41-60 band do not,
//      a typed headcount of 50 does not, and athletes on hold do not count;
//   2. what athletes see is decided when it is read, so a program without it shows its free name,
//      logo and primary color and nothing it set while it had it;
//   3. the coach is told once, in the app and by email, when the roster crosses the line;
//   4. the plan screen quotes $4 for each athlete, never a band's ceiling.
// The integration config runs with BILLING_ENFORCEMENT_ENABLED=true, so a coach with
// isBetaAccount false is a real customer here.

const PAID_BAND = "41-60";
const LINE = 50;
const BAND_FLOOR = 41;
const SMALL_ROSTER = 10;
const BOTH_NOTICES = 2;
const NO_CONTENT = 204;
/** $4 x 41, the exact bill. */
const FORTY_ONE_ATHLETES_CENTS = 16400;
const NOW_INCLUDED = "Full Personalization is now included in your plan";
const NO_LONGER = "Full Personalization is no longer included in your plan";

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

let slugSeq = 0;
async function program(opts: { athletes: number; band?: string | null; planned?: number }) {
  const coach = await makeLoginableUser({
    role: "coach",
    isBetaAccount: false,
    billingTier: opts.band === undefined ? PAID_BAND : opts.band,
    plannedAthleteCount: opts.planned ?? null,
  });
  const athlete = await makeLoginableUser({ role: "athlete" });
  await addToRoster(coach.id, athlete.id);
  const others = await Promise.all(Array.from({ length: opts.athletes - 1 }, () => makeAthlete()));
  if (others.length) {
    await db.insert(coachAthletes).values(others.map((a) => ({ coachId: coach.id, athleteId: a.id })));
  }
  await db
    .update(users)
    .set({
      brandTeamName: "Cal Strength",
      brandPrimaryColor: "#003262",
      brandSecondaryColor: "#FDB515",
      brandMotto: "Earn it",
      brandSlug: `calstrength${slugSeq++}`,
      navLabelOverrides: { programs: "Blocks" },
      hiddenNavSections: ["library"],
    })
    .where(eq(users.id, coach.id));
  return { coach, athlete, others };
}

async function brandingSeenBy(athlete: { email: string }) {
  const client = await loginAs(server.baseUrl, athlete);
  return (await client.get("/api/branding/me")).body;
}

describe("the roster earns Full Personalization", () => {
  it("50 athletes on a paid plan show all of it", async () => {
    const { athlete } = await program({ athletes: LINE });
    const me = await brandingSeenBy(athlete);
    expect(me.brandSecondaryColor).toBe("#FDB515");
    expect(me.brandMotto).toBe("Earn it");
    expect(me.navLabelOverrides).toEqual({ programs: "Blocks" });
  });

  it("49 athletes show the free look only, and the gated fields stay stored", async () => {
    const { coach, athlete } = await program({ athletes: LINE - 1 });
    const me = await brandingSeenBy(athlete);
    expect(me.brandTeamName).toBe("Cal Strength");
    expect(me.brandPrimaryColor).toBe("#003262");
    expect(me.brandSecondaryColor).toBeNull();
    expect(me.brandMotto).toBeNull();
    expect(me.brandSlug).toBeNull();
    expect(me.navLabelOverrides).toEqual({});
    const [row] = await db.select().from(users).where(eq(users.id, coach.id));
    expect(row.brandMotto).toBe("Earn it");
  });

  it("41 athletes on the 41-60 band do not earn it", async () => {
    const { athlete } = await program({ athletes: BAND_FLOOR, band: PAID_BAND });
    expect((await brandingSeenBy(athlete)).brandMotto).toBeNull();
  });

  it("a typed headcount of 50 earns nothing; the roster does", async () => {
    const { athlete } = await program({ athletes: SMALL_ROSTER, planned: LINE });
    expect((await brandingSeenBy(athlete)).brandMotto).toBeNull();
  });

  it("athletes on hold do not count", async () => {
    const { coach, athlete, others } = await program({ athletes: LINE });
    await db
      .update(coachAthletes)
      .set({ heldAt: new Date() })
      .where(and(eq(coachAthletes.coachId, coach.id), eq(coachAthletes.athleteId, others[0].id)));
    expect((await brandingSeenBy(athlete)).brandMotto).toBeNull();
  });

  it("50 athletes with no paid plan do not earn it", async () => {
    const { athlete } = await program({ athletes: LINE, band: null });
    expect((await brandingSeenBy(athlete)).brandMotto).toBeNull();
  });

  it("the coach's own nav follows the same rule", async () => {
    const under = await program({ athletes: LINE - 1 });
    const over = await program({ athletes: LINE });
    const a = await loginAs(server.baseUrl, under.coach);
    const b = await loginAs(server.baseUrl, over.coach);
    expect((await a.get("/api/coach/nav-prefs")).body.hiddenNavSections).toEqual([]);
    expect((await b.get("/api/coach/nav-prefs")).body.hiddenNavSections).toEqual(["library"]);
  });
});

describe("telling the coach", () => {
  it("records the first answer silently, then announces each crossing once", async () => {
    const { coach, others } = await program({ athletes: LINE - 1 });
    // First check: recorded, nothing sent.
    expect(await checkPersonalizationNotice(coach.id)).toBeNull();
    // The 50th athlete joins.
    const fiftieth = await makeAthlete();
    await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: fiftieth.id });
    expect(await checkPersonalizationNotice(coach.id)).toBe("now_included");
    await waitForEmailTo(coach.email, NOW_INCLUDED);
    expect(await checkPersonalizationNotice(coach.id)).toBeNull();
    // One leaves.
    await db.delete(coachAthletes).where(eq(coachAthletes.athleteId, others[0].id));
    expect(await checkPersonalizationNotice(coach.id)).toBe("no_longer_included");
    await waitForEmailTo(coach.email, NO_LONGER);
    const bell = await db.select().from(notifications).where(eq(notifications.userId, coach.id));
    expect(bell.map((n) => n.title)).toEqual(expect.arrayContaining([NOW_INCLUDED, NO_LONGER]));
    expect(bell).toHaveLength(BOTH_NOTICES);
  });

  it("removing an athlete through the real route crosses the line and tells the coach", async () => {
    const { coach, others } = await program({ athletes: LINE });
    await checkPersonalizationNotice(coach.id);
    const client = await loginAs(server.baseUrl, coach);
    expect((await client.delete(`/api/coach/roster/${others[0].id}`)).status).toBe(NO_CONTENT);
    await waitForEmailTo(coach.email, NO_LONGER);
  });
});

describe("the plan screen quotes $4 an athlete", () => {
  it("41 athletes cost $164, not the $240 of a 60-athlete ceiling", async () => {
    const { coach } = await program({ athletes: BAND_FLOOR });
    const client = await loginAs(server.baseUrl, coach);
    const plan = (await client.get("/api/coach/plan")).body;
    expect(plan.billedCount).toBe(BAND_FLOOR);
    expect(plan.band.monthlyPriceCents).toBe(coachMonthlyCents(BAND_FLOOR));
    expect(coachMonthlyCents(BAND_FLOOR)).toBe(FORTY_ONE_ATHLETES_CENTS);
  });
});
