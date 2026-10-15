import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* A ROSTER THAT GROWS WAS NEVER RE-BILLED, AND THE PLAN PAGE BILLED THE TYPED NUMBER.
 *
 * Two findings from the ten-dimension billing sweep, both confirmed by grep and by reading the
 * route, and both costing Forge rather than a customer -- which is why one ships as a fix and
 * the other ships as a measurement.
 *
 * 1. syncCoachSubscriptionBand has exactly ONE caller: PUT /api/coach/plan, a page a coach must
 *    choose to visit and re-save a number on. The roster moves on its own, so a program that
 *    signed up expecting 5 athletes and grew to 50 keeps paying the 0-5 band indefinitely.
 *
 * 2. That one caller passed the TYPED number straight to Stripe. The checkout route has always
 *    used getBilledAthleteCountForCoach -- max(planned, roster) -- so the two halves of one
 *    question answered it differently, and the difference favoured whoever typed the smaller
 *    number. A coach could type 1 and keep two hundred athletes on the cheapest band.
 */
const ROOT = join(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const routes = read("server/routes.ts");
const job = read("server/coach-band-drift-job.ts");
const index = read("server/index.ts");

describe("the plan route bills the larger of typed and roster", () => {
  it("hands Stripe the billed count, never the raw typed number", () => {
    const fn = routes.slice(routes.indexOf('app.put("/api/coach/plan"'));
    const body = fn.slice(0, fn.indexOf("\n  });"));
    expect(body).toContain("getBilledAthleteCountForCoach(user.id)");
    expect(body).toContain("syncCoachSubscriptionBand(user.id, billedAfterChange)");
    // The regression itself: the typed value reaching Stripe directly.
    expect(body).not.toContain("syncCoachSubscriptionBand(user.id, parsed.data.expectedAthletes)");
  });

  it("records the number before reading the billed count, so the read sees it", () => {
    // setPlannedAthleteCount must run first or getBilledAthleteCountForCoach returns the OLD
    // max and the sync lags a save behind -- which would look like it worked for anyone
    // growing, and under-bill anyone correcting a number downward.
    const fn = routes.slice(routes.indexOf('app.put("/api/coach/plan"'));
    const body = fn.slice(0, fn.indexOf("\n  });"));
    expect(body.indexOf("setPlannedAthleteCount")).toBeLessThan(body.indexOf("getBilledAthleteCountForCoach"));
  });

  it("agrees with the checkout route, which asks the same question", () => {
    // The two were allowed to disagree and the disagreement was the bug. Both derive seats from
    // the same storage method now.
    const checkout = routes.slice(routes.indexOf('"/api/billing/checkout/coach"'));
    expect(checkout.slice(0, 1800)).toContain("getBilledAthleteCountForCoach(user.id)");
  });
});

describe("the drift sweep measures before it ever moves money", () => {
  it("reports and changes nothing unless the switch is set", () => {
    // The shape this repo uses wherever it must act on a number nobody has seen in the wild:
    // ship the measurement, read it, then arm the correction. An unattended nightly job that
    // prorates real schools' cards, written in one sitting, is how a program is billed wrongly
    // overnight with nobody watching.
    expect(job).toContain('process.env.COACH_BAND_DRIFT_REBILL === "true"');
    const guard = job.indexOf("if (!rebillArmed) continue;");
    const sync = job.indexOf("syncCoachSubscriptionBand(row.userId, billed)");
    expect(guard).toBeGreaterThan(-1);
    expect(sync).toBeGreaterThan(guard);  // the only call site sits behind the guard
  });

  it("logs every drifted program whether or not it is armed", () => {
    // Reporting IS the product while the switch is off. A sweep that found drift and said
    // nothing would be indistinguishable from one that found none.
    const logAt = job.indexOf("Coach band drift: coach");
    expect(logAt).toBeGreaterThan(-1);
    expect(logAt).toBeLessThan(job.indexOf("if (!rebillArmed) continue;"));
  });

  it("names a program by id and never by anything a person is recognised by", () => {
    // The admin anonymity rule: an operational log says what an account IS, never who holds it.
    expect(job).not.toMatch(/\.email\b/);
    expect(job).not.toMatch(/\.name\b/);
  });

  it("only looks at accounts that can actually drift", () => {
    // An unpaid coach has no quantity to be wrong; an Apple-billed one cannot be re-quantified
    // by this server at all. Examining them would produce drift reports nobody can act on.
    expect(job).toContain('eq(subscriptions.accountType, "coach")');
    expect(job).toContain("isNotNull(subscriptions.stripeSubscriptionId)");
    expect(job).toContain('inArray(subscriptions.status, ["active", "trialing", "past_due"])');
  });

  it("is a sweep rather than a hook on the join, and says why", () => {
    // The roster is written in more than one place and storage.ts cannot import billing.ts, so a
    // hook means billing logic on every join path -- and the next path added silently misses it.
    expect(job).toContain("claimRosterSeat");
    expect(job).toContain("linkAthleteToCoach");
  });

  it("is registered at startup, on an hour clear of the other sweeps", () => {
    expect(index).toContain("startCoachBandDriftJob()");
    expect(job).toContain('scheduleDailyJob("coach-band-drift-sweep", 11');
    // 09:00 and 10:00 are the two video sweeps; they are staggered so they do not contend for
    // the same connections, and this keeps that spacing.
    expect(read("server/video-retention-job.ts")).toContain('"video-retention-cap-sweep", 9');
  });

  it("never lets a failure take the sweep down", () => {
    expect(job).toContain('reportJobFailure("coach-band-drift-sweep", err)');
    // And one program's Stripe failure does not stop the rest being examined.
    const loopBody = job.slice(job.indexOf("for (const row of rows)"));
    expect(loopBody).toContain("catch (err)");
    expect(loopBody).toContain("failed++");
  });
});

/* AND IT RE-BILLS AT THE JOIN NOW, NOT ONLY NIGHTLY (2026-10-15).
 *
 * The sweep above is the backstop and stays report-only until somebody arms it. What the audit
 * panel's finding was actually about is that syncCoachSubscriptionBand had ONE caller -- the
 * coach's own plan page -- so a program that typed 10 at signup and then had 40 athletes join
 * was billed for 10 until a human happened to open that screen. $4 a head is the whole pricing
 * model.
 *
 * At the JOIN rather than at 11:00 UTC: a seat claim is something a person just did, so the
 * charge moves while somebody is watching and the coach sees the new band immediately.
 */
describe("the band follows a seat the moment it is taken", () => {
  const auth = readFileSync(join(import.meta.dirname, "auth.ts"), "utf8");
  const billing = readFileSync(join(import.meta.dirname, "billing.ts"), "utf8");

  it("every roster claim re-bills", () => {
    const claims = auth.match(/storage\.claimRosterSeat\(/g) ?? [];
    const rebills = auth.match(/rebillCoachBandAfterJoin\(/g) ?? [];
    // One per claim: the signup path and the invite-code path.
    expect(claims.length).toBeGreaterThanOrEqual(2);
    expect(rebills).toHaveLength(claims.length);
  });

  it("asks for the BILLED count, the same rule the plan page and the sweep use", () => {
    const fn = billing.slice(billing.indexOf("export async function rebillCoachBandAfterJoin("));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toMatch(/const billed = await storage\.getBilledAthleteCountForCoach\(coachId\);/);
    expect(body).toMatch(/syncCoachSubscriptionBand\(coachId, billed\)/);
  });

  it("never fails the join", () => {
    // An athlete's signup must not break because Stripe refused a quantity change.
    const fn = billing.slice(billing.indexOf("export async function rebillCoachBandAfterJoin("));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toMatch(/try \{/);
    expect(body).toMatch(/catch \(err\)/);
    expect(body).toMatch(/Promise<void>/);
  });

  it("records only the saves that moved money", () => {
    const fn = billing.slice(billing.indexOf("export async function rebillCoachBandAfterJoin("));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    // Every `reason` is an ordinary no-op (no plan, no subscription, same band); an audit row
    // per join would bury the ones that charged somebody.
    expect(body).toMatch(/if \(result\.synced\)/);
    expect(body).toMatch(/coach\.plan\.rebilled_on_join/);
  });
});
