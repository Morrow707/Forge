import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { notifications, users } from "@shared/schema";
import { storage } from "./storage";
import { db, resetDatabase } from "./test-support/fixtures";
import { addToRoster, loginAs, makeLoginableUser, startTestServer, type TestServer } from "./test-support/http-app";
import { waitForEmailTo } from "./test-support/wait-for-email";

// FULL PERSONALIZATION FOLLOWS THE PLAN THE PROGRAM HAS NOW (2026-11-18). Three things, driven
// through the real routes on real Postgres:
//   1. it is included from the band holding 50 athletes (41-60), not from 21;
//   2. what athletes see is decided when it is READ, so a program without it shows its free name,
//      logo and primary color and nothing it set while it had it, and a lapsed program does not
//      keep its look;
//   3. a coach is told, in the app and by email, when a band change starts or stops including it.
// The integration config runs with BILLING_ENFORCEMENT_ENABLED=true, so a coach with
// isBetaAccount false is a real customer here.

const BAND_WITHOUT = "21-40";
const BAND_WITH = "41-60";
const BAND_WITH_CAP = 60;
const NOW_INCLUDED = "Full Personalization is now included in your plan";

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
async function programOnBand(band: string) {
  const coach = await makeLoginableUser({ role: "coach", isBetaAccount: false, billingTier: band });
  const athlete = await makeLoginableUser({ role: "athlete" });
  await addToRoster(coach.id, athlete.id);
  // The look as a program that once had everything would have saved it.
  await db
    .update(users)
    .set({
      brandTeamName: "Cal Strength",
      brandPrimaryColor: "#003262",
      brandSecondaryColor: "#FDB515",
      brandMotto: "Earn it",
      brandWelcomeMessage: "Welcome to the program",
      brandSlug: `calstrength${slugSeq++}`,
      navLabelOverrides: { programs: "Blocks" },
      hiddenNavSections: ["library"],
    })
    .where(eq(users.id, coach.id));
  return { coach, athlete };
}

describe("where Full Personalization is included", () => {
  it("the 21-40 band shows the free look only; the gated fields stay stored", async () => {
    const { coach, athlete } = await programOnBand(BAND_WITHOUT);
    const client = await loginAs(server.baseUrl, athlete);
    const me = (await client.get("/api/branding/me")).body;
    expect(me.brandTeamName).toBe("Cal Strength");
    expect(me.brandPrimaryColor).toBe("#003262");
    expect(me.brandSecondaryColor).toBeNull();
    expect(me.brandMotto).toBeNull();
    expect(me.brandWelcomeMessage).toBeNull();
    expect(me.brandSlug).toBeNull();
    expect(me.navLabelOverrides).toEqual({});
    const [row] = await db.select().from(users).where(eq(users.id, coach.id));
    expect(row.brandMotto).toBe("Earn it");
  });

  it("the 41-60 band (the one holding 50 athletes) shows all of it", async () => {
    const { athlete } = await programOnBand(BAND_WITH);
    const client = await loginAs(server.baseUrl, athlete);
    const me = (await client.get("/api/branding/me")).body;
    expect(me.brandSecondaryColor).toBe("#FDB515");
    expect(me.brandMotto).toBe("Earn it");
    expect(me.navLabelOverrides).toEqual({ programs: "Blocks" });
  });

  it("the coach's own nav follows the plan too", async () => {
    const without = await programOnBand(BAND_WITHOUT);
    const withIt = await programOnBand(BAND_WITH);
    const a = await loginAs(server.baseUrl, without.coach);
    const b = await loginAs(server.baseUrl, withIt.coach);
    expect((await a.get("/api/coach/nav-prefs")).body.hiddenNavSections).toEqual([]);
    expect((await b.get("/api/coach/nav-prefs")).body.hiddenNavSections).toEqual(["library"]);
  });
});

describe("telling the coach", () => {
  it("moving from 21-40 to 41-60 writes a bell notification and sends an email", async () => {
    const { coach } = await programOnBand(BAND_WITHOUT);
    await storage.applyCoachSubscriptionBand(coach.id, BAND_WITH, BAND_WITH_CAP);
    // The announcement is called by billing.ts with the band it replaced; drive it the same way.
    const { announcePersonalizationChange } = await import("./personalization-included-notice");
    announcePersonalizationChange(coach.id, BAND_WITHOUT, BAND_WITH);
    await waitForEmailTo(coach.email, NOW_INCLUDED);
    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, coach.id), eq(notifications.title, NOW_INCLUDED)));
    expect(rows).toHaveLength(1);
  });

  it("the band write reports the band it replaced, which is what the announcement is keyed on", async () => {
    const { coach } = await programOnBand(BAND_WITHOUT);
    const applied = await storage.applyCoachSubscriptionBand(coach.id, BAND_WITH, BAND_WITH_CAP);
    expect(applied?.previousBillingTier).toBe(BAND_WITHOUT);
  });
});
