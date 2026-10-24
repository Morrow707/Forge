import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { storage } from "./storage";
import { testOutbox } from "./email";
import { resetDatabase, makeCoach } from "./test-support/fixtures";
import { startTestServer, type TestServer } from "./test-support/http-app";
import { waitForEmailTo } from "./test-support/wait-for-email";

/** THE WELCOME EMAIL A COACH-PROVISIONED ATHLETE GETS, DRIVEN THROUGH THE REAL CLAIM ROUTE.
 *
 * Found 2026-10-24. `buildWelcomeEmail(user, coachName)` decides coached-or-not from a NULLABLE
 * DISPLAY NAME, and the claim handler passed `null` -- while `coachId` sat destructured two lines
 * above it and `claimRosterSeat(provisional.coachId, user.id)` had already put the athlete on that
 * coach's roster. So every athlete who arrived the way a school actually onboards one got the FREE
 * AGENT body, which is wrong in four sentences and right in none:
 *
 *   "You're training on your own for now"                      -- they are on a roster
 *   "Build your own programs by hand"                          -- FreeAgentGate refuses them that
 *   "the AI coach, the camera and the skills library are paid   -- the camera and skills are
 *    upgrades you can add whenever you want them"                 already free to them, and the AI
 *                                                                 coach is not purchasable AT ANY
 *                                                                 PRICE (requireFreeAgent)
 *   "If you join a coach later using their invite code"        -- they just did
 *
 * and it omitted the one thing the coached branch exists to say, that whatever their coach assigns
 * appears on their calendar automatically.
 *
 * WHY A UNIT TEST COULD NOT CATCH IT. `welcome-email-promises-only-what-you-have.test.ts` is
 * thorough about the pure function and exercises exactly the three argument pairs somebody chose
 * to pass it -- coach/null, athlete/"Marcus Delacroix", athlete/null. The bug was never in the
 * function; it was in which pair the claim route handed it. So this drives the real route and
 * reads the real outbox.
 */
describe("the welcome email a coach-provisioned athlete receives", () => {
  let server: TestServer;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(async () => {
    await server.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    testOutbox.length = 0;
  });

  /** The real onboarding path: a coach adds a provisional athlete, hands over the claim link,
   *  and the athlete -- signed out -- fills it in. */
  async function claimAsProvisionalAthlete(coachName: string) {
    const coach = await makeCoach({ name: coachName });
    const [slot] = await storage.createProvisionalAthletes(coach.id, [{ name: "Tatum Okafor" }]);
    expect(slot.claimCode).toBeTruthy();

    const email = `tatum-${slot.claimCode.toLowerCase()}@example.test`;
    const res = await fetch(`${server.baseUrl}/api/claim/${slot.claimCode}/signup`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forge-device-id": "claim-device" },
      body: JSON.stringify({
        email,
        password: "Forge#2026",
        dateOfBirth: "1999-04-12",
        // The coach's intake sheet left these blank, so the claim form asks for them -- see
        // claimProvisionalAthleteSchema's "only required if the coach's intake didn't already
        // capture one" fields.
        sport: "Football",
        position: "Wide Receiver",
        heightIn: 73,
        bodyWeightLbs: 185,
        agreedToTerms: true,
      }),
    });
    expect(res.status, await res.text().catch(() => "")).toBe(201);

    // WAITED FOR, NOT READ. The claim handler calls `sendEmail(...)` without awaiting it --
    // deliberate, so a mail outage can never fail a signup -- and `sendEmail` pushes to the
    // outbox only after `await import("./storage")` and a branding query, because this send
    // passes `brandForUserId`. Reading the outbox the instant the 201 lands therefore races the
    // push, and this file is what proved it: red on six consecutive CI runs, reproduced locally
    // about one run in three, and ONLY ever on the first of these four cases -- the one call
    // where that dynamic import is a real module load rather than a cache hit.
    //
    // waitForEmailTo still THROWS when no email is sent, so the thing this test was written to
    // catch is not weakened; see server/test-support/wait-for-email.ts.
    const welcome = await waitForEmailTo(email, "Welcome to Forge");
    return { coach, email, html: String(welcome.html) };
  }

  it("names the coach whose roster they are already on", async () => {
    const { html } = await claimAsProvisionalAthlete("Marcus Delacroix");
    expect(html).toContain("Marcus Delacroix");
    // The one true thing the coached branch exists to say, and the thing the Free Agent body
    // omitted entirely.
    expect(html).toMatch(/calendar/i);
  });

  it("never offers them a purchase they are not allowed to make", async () => {
    /* The repo's "a change that alters what the app CLAIMS about money" class. A coached athlete
     * already has the camera and the skills library for free (cameraAccessFor / skillsAccessFor
     * return on the coached branch), and the AI coach is refused to them at any price --
     * /api/billing/checkout/free-agent-tier carries requireFreeAgent, so an athlete who followed
     * that sentence would reach a refusal. */
    const { html } = await claimAsProvisionalAthlete("Marcus Delacroix");
    expect(html).not.toMatch(/paid upgrades?/i);
  });

  it("never tells a rostered athlete they are on their own, or to go and find a coach", async () => {
    const { html } = await claimAsProvisionalAthlete("Marcus Delacroix");
    expect(html).not.toMatch(/on your own/i);
    expect(html).not.toMatch(/join a coach later/i);
    expect(html).not.toMatch(/invite code/i);
  });

  it("really is on the coach's roster when the email is built, which is what makes it wrong", async () => {
    /* The premise, asserted rather than assumed: if the claim ever stopped joining the roster, the
     * Free Agent body would become the CORRECT one and every case above would be arguing for the
     * wrong thing. */
    const { coach, email } = await claimAsProvisionalAthlete("Marcus Delacroix");
    const athlete = await storage.getUserByEmail(email);
    expect(athlete).toBeTruthy();
    const coaches = await storage.getCoachesForAthlete(athlete!.id);
    expect(coaches.map((c) => c.id)).toContain(coach.id);
  });
});
