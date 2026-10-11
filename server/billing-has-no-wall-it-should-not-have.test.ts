import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * THREE WALLS THAT WERE IN THE WRONG PLACE WHEN BILLING WENT LIVE (2026-10-11).
 *
 * All three were inert for as long as `BILLING_LIVE` was off and all three became real the
 * night it was set, which is why no test and no session had ever met them. They are grouped
 * because they fail the same way: a guard that reads the wrong thing is invisible until the
 * switch above it turns on, and then it is visible only to the customer it strands.
 *
 *  1. A ROSTER CAP. Scott: "coaches should never have a roster cap as each athlete add on is $4
 *     no matter what." `subscriptions.seatCap`'s only writer ever set it to 15 for every coach
 *     regardless of the band they paid for, so a program paying for a thousand athletes was
 *     walled at fifteen while a coach with no row was unlimited.
 *  2. A TRIAL THAT NEVER ENDED. `hasAthletePaidForAiAccess` returned true for
 *     `status === "trialing"` with no expiry comparison, on a row written at every signup.
 *  3. COPY THAT SAID FORGE WAS IN BETA, on the server, where the beta scan could not see it.
 *     That one is pinned by shared/the-beta-is-over.test.ts, whose roots now include server/.
 *
 * Scans the source rather than calling the functions: two of the three are now ABSENCES, and
 * the only way to assert an absence is to look for it coming back.
 */

const SERVER = resolve(import.meta.dirname);
const read = (f: string) => readFileSync(resolve(SERVER, f), "utf8");
// LINE COMMENTS FIRST, THEN BLOCK -- the order is load-bearing. A `/*` inside a line comment
// (server/auth.ts: "see the /api/auth/mfa/* routes below") pairs with the next real `*/` if the
// block pass runs first, swallowing everything between and leaving a scan reading a fraction of
// the file while still passing. Taking line comments off first removes the fake opener with them.
const stripComments = (src: string) =>
  src.replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("a coach's roster has no cap", () => {
  const storage = stripComments(read("storage.ts"));
  const billing = stripComments(read("billing.ts"));
  const routes = stripComments(read("routes.ts"));

  it("has no seat-availability gate left to call", () => {
    for (const src of [storage, billing, routes]) {
      expect(src).not.toContain("hasRosterSeatAvailable");
    }
  });

  it("never writes a seat cap", () => {
    // The column stays (it is data a future plan shape could want); writing a number to it is
    // what made every coach a fifteen-athlete program.
    const writes = storage.match(/seatCap:\s*[^,\n]+/g) ?? [];
    expect(writes).toEqual(["seatCap: null"]);
  });

  it("carries no athlete cap on the entitlement object", () => {
    // athleteCapIncluded is the BAND's ceiling and must survive -- it is the Stripe quantity and
    // the price. What must not come back is a cap anybody enforces.
    expect(billing).not.toMatch(/\bathleteCap\b(?!Included)/);
    expect(billing).toContain("athleteCapIncluded");
  });

  it("tells no coach that their roster is full", () => {
    const page = stripComments(
      readFileSync(resolve(SERVER, "..", "client/src/pages/coach/billing.tsx"), "utf8"),
    );
    expect(page).not.toContain("atCap");
    expect(page).not.toMatch(/No one else\s+can join/);
    expect(routes).not.toContain("atCap");
  });

  it("still joins an athlete through the locked, de-duped path", () => {
    // The cap went; the advisory lock did not. coachAthletes has no unique index, so the lock is
    // what stops two concurrent joins inserting the same athlete twice.
    expect(storage).toContain("pg_advisory_xact_lock");
    expect(storage).toContain("claimRosterSeat");
  });
});

describe("a trial ends", () => {
  const routes = stripComments(read("routes.ts"));
  const paid = routes.slice(
    routes.indexOf("async function hasAthletePaidForAiAccess"),
    routes.indexOf("function tierGrants"),
  );

  it("is a window, not a status", () => {
    expect(paid).toContain('sub.status === "trialing"');
    // The comparison that was missing. Without it the status alone was a permanent grant.
    expect(paid).toContain("sub.trialEndsAt");
    expect(paid).toMatch(/trialEndsAt\s*!=\s*null/);
    expect(paid).toMatch(/trialEndsAt\.getTime\(\)\s*>\s*Date\.now\(\)/);
  });

  it("treats a missing end date as expired, because the status column defaults to trialing", () => {
    const schema = readFileSync(resolve(SERVER, "..", "shared/schema.ts"), "utf8");
    expect(schema).toContain('subscriptionStatusEnum("status").notNull().default("trialing")');
    // A null check that failed OPEN would reintroduce the hole for any row written without a
    // date, so the null test and the future test are both required above.
    expect(paid).not.toMatch(/trialEndsAt\s*==\s*null\s*\|\|/);
  });

  it("still writes an end date when it opens one", () => {
    const storage = stripComments(read("storage.ts"));
    expect(storage).toMatch(/trialEndsAt\s*=\s*new Date\(Date\.now\(\) \+ 14/);
  });
});
