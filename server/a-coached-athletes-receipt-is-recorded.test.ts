import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A COACHED ATHLETE'S APPLE RECEIPT REPLAYED AT EVERY LAUNCH, FOREVER, WHILE APPLE CHARGED.
 *
 * POST /api/account/apple-iap/verify -- the route the app actually calls -- answered 403 "A
 * coached athlete's plan is their program's". A true sentence and the wrong act. StoreKit takes
 * the money BEFORE the server is asked, and verifyAndFinishOnce finishes a transaction on exactly
 * two statuses: 410 (retired product) and 409 (bound to another Forge account), the two refusals
 * that can never become a grant. A 403 fell through to the bare `throw`, so the transaction was
 * never finished and StoreKit re-sent it at every app launch indefinitely.
 *
 * Reachable with nobody doing anything odd: buy a tier as a Free Agent, then join a program -- a
 * coach adds you by code, or an intake import claims you. The next renewal or cold-start replay
 * meets it.
 *
 * FINISHING IT WOULD HAVE BEEN THE WRONG FIX, and that is why this is a grant instead of a third
 * finishable status: unlike 410 and 409 this refusal is TEMPORARY. Leave the program and the
 * subscription is grantable again, so finishing it discards a subscription somebody is still
 * paying for. CLAUDE.md had already settled the identical shape for an assistant coach's add-on
 * receipt: "the only honest thing left to do is grant what was paid for, to the row that can
 * carry it."
 *
 * Found by the 2026-10-15 audit panel, which reported it against the WRONG route (the
 * requireFreeAgent-guarded /api/athlete/apple-iap/verify, which nothing calls). The consequence
 * was right and the mechanism was one route over, which is why the claim was checked rather than
 * taken.
 */

const ROUTES = readFileSync(resolve(import.meta.dirname, "routes.ts"), "utf8");
const CLIENT = readFileSync(
  resolve(import.meta.dirname, "../client/src/lib/apple-iap.ts"),
  "utf8",
);

const accountVerify = (() => {
  const at = ROUTES.indexOf('app.post("/api/account/apple-iap/verify"');
  return ROUTES.slice(at, ROUTES.indexOf("\n  });", at));
})();

describe("the route the app actually calls", () => {
  it("is the account route, not the athlete one", () => {
    // The whole reason the panel's report had to be checked. If this ever flips, the
    // requireFreeAgent guard on the athlete route becomes live and this bug comes back.
    expect(CLIENT).toContain('"/api/account/apple-iap/verify"');
    expect(CLIENT).not.toContain('"/api/athlete/apple-iap/verify"');
  });

  it("no longer refuses a coached athlete", () => {
    expect(accountVerify).not.toMatch(/return res\.status\(403\)[\s\S]{0,120}plan is their program/);
    expect(accountVerify).toContain("const coachedAthlete =");
  });

  it("records the purchase and answers success, so the phone finishes it", () => {
    expect(accountVerify).toContain("programCoversThis: true");
    expect(accountVerify).toContain('"apple_iap.coached_athlete_purchase"');
    // Only they can stop an App Store subscription, so it is said rather than done.
    expect(accountVerify).toContain("alsoCancelInAppStore: true");
    expect(accountVerify).toContain("console.warn(");
  });

  it("still refuses a role nothing is sold to at all", () => {
    // A guardian or admin has no product in the app, and a role is not something that changes
    // under somebody mid-subscription the way a coach link does.
    expect(accountVerify).toContain('user.role !== "athlete" && user.role !== "coach"');
  });
});

describe("the two statuses the phone may finish on, and no third", () => {
  const finish = (() => {
    // The DECLARATION, not the first mention -- indexOf finds the call site above it, whose
    // body ends at a different brace and made this slice read a fraction of the function.
    const at = CLIENT.indexOf("async function verifyAndFinishOnce");
    return CLIENT.slice(at, CLIENT.indexOf("\n}", at));
  })();

  it("finishes on 409 and 410 only", () => {
    expect(finish).toMatch(/err\.status === 409/);
    expect(finish).toMatch(/err\.status === 410/);
    // A third finishable status is how a temporary refusal silently throws away a live
    // subscription. The fix for one is a grant on the server, never a finish on the phone.
    const statuses = [...finish.matchAll(/err\.status === (\d{3})/g)].map((m) => m[1]).sort();
    expect(statuses).toEqual(["401", "409", "410"]);
  });

  it("and 401 is neither finished nor discarded, which is the third behaviour", () => {
    // A cold-start replay before the session is known. This branch logs and falls through to the
    // same `throw` as any other refusal -- deliberately, so the transaction stays open and
    // StoreKit re-offers it; build 613's hold-and-re-send after sign-in is the caller's job.
    // Asserted as "does not finish" rather than by naming the holder, since the holding happens
    // one level up and this is the property that matters here.
    const branch = finish.slice(finish.indexOf("err.status === 401"));
    const next = branch.indexOf("} else if");
    expect(branch.slice(0, next)).not.toContain("finishTransaction");
  });
});

describe("why recording it grants nothing", () => {
  it("every athlete gate returns on the coached branch before the tier is read", () => {
    // This is the safety property the fix rests on: users.freeAgentTier sits inert on a coached
    // athlete's row, and stops being inert the day they leave the program -- which is the right
    // outcome for money they paid. If a gate ever starts reading the tier first, recording a
    // coached athlete's purchase becomes a free-access hole and this case says so.
    for (const fn of ["cameraAccessFor", "skillsAccessFor"]) {
      const at = ROUTES.indexOf(`async function ${fn}(`);
      expect(at, fn).toBeGreaterThan(-1);
      const body = ROUTES.slice(at, ROUTES.indexOf("\n}", at));
      const coached = body.indexOf("athleteHasCoach");
      const tier = body.indexOf("hasAthletePaidForAiAccess");
      expect(coached, `${fn}: no coached branch`).toBeGreaterThan(-1);
      expect(tier, `${fn}: no tier read`).toBeGreaterThan(-1);
      expect(coached, `${fn}: the tier is read before the coached branch`).toBeLessThan(tier);
    }
  });
});
