import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* AN ADMIN OR GUARDIAN IS SOLD NOTHING, AND A PURCHASE MADE ON ANOTHER FORGE ACCOUNT WITH THE SAME
 * APPLE ID MUST NOT REPLAY AT EVERY LAUNCH (2026-11-23, Render log 20:11:57: ten 403s on the admin
 * account's cold start). The phone finishes a transaction on 409 and 410 only, so the branch that
 * refuses a role nothing is sold to has to answer 409 when another account already holds it. */
// Positive assertions only, so the raw source: the two-regex comment strip empties routes.ts (a
// "/*" inside a string pairs with a real "*/" thousands of lines on -- see CLAUDE.md).
const routes = readFileSync(join(__dirname, "routes.ts"), "utf8");

describe("the verify route's not-sold-to branch", () => {
  const start = routes.indexOf('app.post("/api/account/apple-iap/verify"');
  const handler = routes.slice(start, routes.indexOf("\n  app.", start + 10));
  const branchAt = handler.indexOf('user.role !== "athlete" && user.role !== "coach"');
  const branch = handler.slice(branchAt, handler.indexOf('"Nothing is sold to this account in the app."', branchAt));

  it("asks who holds the transaction and answers the finishable 409 when another account does", () => {
    expect(branchAt).toBeGreaterThan(0);
    expect(branch).toContain("accountsHoldingAppleTransaction");
    expect(branch).toMatch(/status\(409\)[\s\S]*alreadyBoundElsewhere: true/);
  });

  it("and the phone still finishes on exactly 409 and 410", () => {
    const iap = (readFileSync(join(__dirname, "..", "client", "src", "lib", "apple-iap.ts"), "utf8"));
    expect(iap).toMatch(/409/);
    expect(iap).toMatch(/410/);
  });
});
