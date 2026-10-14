import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* ONE PAID APP STORE SUBSCRIPTION COULD ENTITLE ANY NUMBER OF FORGE ACCOUNTS.
 *
 * Found 2026-10-14 by the billing sweep and confirmed two ways: the schema does not make
 * subscriptions.appleOriginalTransactionId unique, and nothing in the verify path checks whether
 * the transaction being presented already belongs to somebody else.
 *
 * IT IS NOT EVEN AN ATTACK, which is what makes it worth measuring. The app HOLDS a StoreKit
 * transaction that arrives before a session is known and re-sends it after sign-in
 * (flushAppleIapTransactionsHeldForSignIn, build 613 -- its own console line reads "signed in,
 * re-sending 6 held transaction(s)"). So one phone signing into a second Forge account -- a
 * coach's own account and their child's is the obvious pair -- presents the same genuine
 * transaction, Apple's verifier confirms it is real, and the second account is granted the tier.
 *
 * ** DETECTION ONLY. NOTHING IS REFUSED. ** This is the riskiest finding in the sweep to get
 * wrong: the purchase path is confirmed working on real money, and the phone does NOT finish a
 * transaction the server refuses (build 611's zombie bug), so a refusal that is wrong -- or that
 * returns a status the client does not treat as final -- replays at every launch forever. Arming
 * it needs a new status contract on both halves, which is a change to make against evidence
 * rather than a guess. Same posture as the coach-band drift sweep and as every camera diagnostic
 * in this repo, which land with appliedCorrection: false and a note to read them on a real take.
 */
const ROOT = join(import.meta.dirname, "..");
const storage = readFileSync(join(ROOT, "server/storage.ts"), "utf8");
const schema = readFileSync(join(ROOT, "shared/schema.ts"), "utf8");

describe("the sharing is detected and recorded", () => {
  it("reads both places an Apple transaction can be recorded", () => {
    const fn = storage.slice(storage.indexOf("async accountsHoldingAppleTransaction("));
    const body = fn.slice(0, fn.indexOf("\n  },"));
    expect(body).toContain("subscriptions.appleOriginalTransactionId");   // a TIER
    expect(body).toContain("users.addOnTerms");                           // an ADD-ON
  });

  it("excludes the account being granted, so a re-verify is never flagged", () => {
    // Restore-purchases and the held-transaction replay both re-present the SAME transaction to
    // the SAME account, constantly and legitimately. Flagging that would make the warning
    // meaningless noise and bury the real case.
    const fn = storage.slice(storage.indexOf("async accountsHoldingAppleTransaction("));
    const body = fn.slice(0, fn.indexOf("\n  },"));
    expect(body).toContain("exceptUserId");
    expect(body).toMatch(/!==\s*exceptUserId/);
  });

  it("warns on the grant path, before anything is written, for either scope", () => {
    const fn = storage.slice(storage.indexOf("async applyAppleIapVerification("));
    const body = fn.slice(0, fn.indexOf("\n  },"));
    const warnAt = body.indexOf("accountsHoldingAppleTransaction");
    const coachBranch = body.indexOf('if (scope === "coach")');
    expect(warnAt).toBeGreaterThan(-1);
    // Above the coach branch means above BOTH branches -- a coach add-on and an athlete tier are
    // equally shareable and a check in one scope only would be half a check.
    expect(warnAt).toBeLessThan(coachBranch);
  });

  it("warns rather than logs, because this is revenue leaving", () => {
    const fn = storage.slice(storage.indexOf("async applyAppleIapVerification("));
    const body = fn.slice(0, fn.indexOf("\n  },"));
    expect(body).toContain("console.warn");
  });

  it("grants anyway, and the code says so", () => {
    // The assertion that matters most: this must NOT have quietly become a refusal. A wrong
    // refusal here is a transaction the phone replays forever on an account that paid.
    const fn = storage.slice(storage.indexOf("async applyAppleIapVerification("));
    const head = fn.slice(0, fn.indexOf('if (scope === "coach")'));
    expect(head).not.toMatch(/return \{ ok: false/);
    expect(head).toContain("granted anyway");
  });
});

describe("the reason it is detection and not enforcement is written down", () => {
  it("names the zombie-transaction rule that makes a refusal risky", () => {
    const fn = storage.slice(storage.indexOf("WHICH OTHER ACCOUNTS ALREADY HOLD THIS APPLE TRANSACTION"));
    // Whitespace-collapsed before matching: the comment wraps, so a raw regex fails on the
    // newline and the leading ` * ` of the next line. Asserting against formatting rather than
    // content is the same brittleness as the character-window assertion this sweep already
    // rewrote -- it fails for a reflow and passes for a deletion.
    const comment = fn.slice(0, fn.indexOf("async accountsHoldingAppleTransaction(")).replace(/\s*\*\s*/g, " ").replace(/\s+/g, " ");
    expect(comment).toMatch(/phone does NOT finish a transaction the server refuses/);
    expect(comment).toMatch(/build 611/);
  });

  it("records that the column is not unique, which is the root of it", () => {
    // If somebody later adds a UNIQUE constraint, the grant starts throwing on a legitimate
    // second verify instead of warning -- so the state of this column is part of the finding.
    const line = schema.slice(schema.indexOf('appleOriginalTransactionId: text("apple_original_transaction_id")'));
    expect(line.slice(0, 120)).not.toContain(".unique()");
  });
});
