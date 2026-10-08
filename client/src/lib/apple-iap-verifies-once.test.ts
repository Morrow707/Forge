import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* ONE VERIFY PER STOREKIT TRANSACTION.
 *
 * A direct purchase arrives twice -- purchase() returns the transaction and Transaction.updates
 * fires for the same one -- and both go through verifyAndFinish. The sandbox console on
 * 2026-10-05 showed every purchase verified, recorded and finished, then verified, recorded and
 * finished again one second later, the same transactionId both times.
 *
 * Scanned at the source rather than executed because this module registers a Capacitor plugin at
 * import time and the real path needs a device. What is asserted is the SHAPE the fix depends
 * on, and each assertion is a way it has a reason to be dismantled:
 *   - the coalescing map and the completed set exist and are keyed by transaction id;
 *   - a failure is NOT recorded as done, or the held-until-sign-in replay could never retry the
 *     same id after a 401, which is a bug this file already fixed once;
 *   - the entry is cleared when the attempt settles, or one failed verify would wedge that id
 *     for the life of the process.
 */
const src = readFileSync(join(process.cwd(), "client/src/lib/apple-iap.ts"), "utf8");

describe("a StoreKit transaction is verified once, however many paths deliver it", () => {
  it("coalesces concurrent verifies by transaction id", () => {
    expect(src).toContain("const verifyInFlight = new Map<string, Promise<void>>()");
    // The second caller awaits the first's promise instead of issuing its own request.
    expect(src).toMatch(/const running = verifyInFlight\.get\(id\);\s*\n\s*if \(running\) return running;/);
  });

  it("skips a transaction that already succeeded", () => {
    expect(src).toContain("const verifiedTransactionIds = new Set<string>()");
    expect(src).toMatch(/if \(verifiedTransactionIds\.has\(id\)\)/);
  });

  it("records only a SUCCESSFUL verify, so a 401 can still be retried after sign-in", () => {
    // .then() and not .finally(): a rejected attempt must leave the id absent from the set, or
    // flushAppleIapTransactionsHeldForSignIn would skip the very transactions it exists to
    // re-send. The held-until-sign-in path is the reason this matters.
    const add = src.indexOf("verifiedTransactionIds.add(id)");
    expect(add).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, add - 120), add);
    expect(before).toContain(".then(");
    expect(before).not.toContain(".catch(");
  });

  it("clears the in-flight entry whether the attempt succeeded or failed", () => {
    // .finally() here, the opposite of the line above: leaving a failed id in the map would wedge
    // it forever and no retry could ever start.
    const del = src.indexOf("verifyInFlight.delete(id)");
    expect(del).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, del - 120), del)).toContain(".finally(");
  });

  it("still finishes with StoreKit only after the server recorded it", () => {
    // The ordering the whole file is built on: a transaction is never finished before the grant
    // is real, or a failed verify would throw the receipt away.
    const body = src.slice(src.indexOf("async function verifyAndFinishOnce"));
    const recorded = body.indexOf("server recorded");
    expect(recorded).toBeGreaterThan(0);
    expect(body.indexOf("AppleIap.finishTransaction(", recorded)).toBeGreaterThan(recorded);
    // The ONE finish allowed before the grant is for a retired product (the server's 410,
    // RETIRED_APPLE_PRODUCT_IDS): nothing is ever granted for it and StoreKit would replay it
    // forever otherwise (2026-10-08). Any other early finish would throw a real receipt away.
    const before = body.slice(0, recorded);
    expect((before.match(/AppleIap\.finishTransaction\(/g) ?? []).length).toBe(1);
    const retiredBranch = before.indexOf("err.status === 410");
    expect(retiredBranch).toBeGreaterThan(0);
    expect(before.indexOf("AppleIap.finishTransaction(")).toBeGreaterThan(retiredBranch);
  });
});
