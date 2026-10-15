import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * EVERY WRITER OF users.addOnTerms GOES THROUGH ONE LOCKED READ-MODIFY-WRITE.
 *
 * The runtime proof is two-add-on-writes-never-lose-one.itest.ts, which races the real methods
 * against real Postgres. This is the ratchet beside it, and it earns its place for a reason the
 * itest cannot cover: a NEW writer added later is not in that file's cases, and the failure it
 * reintroduces is invisible -- a term lost in a millisecond window is an add-on whose
 * subscription id nothing can ever find again.
 *
 * So the assertion DISCOVERS the writers from the source rather than holding a list, which is the
 * direction this repo keeps having to relearn (the public legal-doc set, the upload directories,
 * the email-builder glob): every `addOnTerms` write must sit inside the helper, and the ones that
 * may not are named with a reason.
 */

const SERVER = resolve(import.meta.dirname);
const storage = readFileSync(resolve(SERVER, "storage.ts"), "utf8");
// Line comments first, then block -- see a-typed-number-buys-nothing.test.ts' note on why the
// other order silently swallows most of the file.
const stripped = storage.replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const helper = (() => {
  const at = stripped.indexOf("async function mutateAddOnsAtomically");
  return at < 0 ? "" : stripped.slice(at, stripped.indexOf("\n}\n", at));
})();

/** Each method that writes addOnTerms, as its own body. */
function bodyOf(name: string) {
  const at = stripped.indexOf(`async ${name}(`);
  if (at < 0) return "";
  return stripped.slice(at, stripped.indexOf("\n  },", at));
}

const WRITERS = [
  "addFreeAgentAddOn",
  "addCoachBillingAddOn",
  "scheduleAddOnRemoval",
  "restoreAddOn",
  "revokeAddOnAfterRefund",
  "updateFreeAgentBilling",
  "updateCoachBilling",
];

describe("the lock itself", () => {
  it("reads the row FOR UPDATE inside the same transaction that writes it", () => {
    expect(helper).not.toBe("");
    expect(helper).toContain("db.transaction(");
    expect(helper).toContain('.for("update")');
    // The write has to be on the transaction's own handle; a `db.update` in here would take a
    // second connection and write outside the lock it just took.
    expect(helper).toMatch(/await tx\s*\n\s*\.update\(users\)/);
    expect(helper).not.toMatch(/\bawait db\s*\n?\s*\.update\(/);
  });

  it("does not read through the per-request memo", () => {
    // getUser is memoised (server/request-cache.ts). A memo filled before the lock was taken is
    // exactly the stale read this exists to stop, so the row is selected directly.
    expect(helper).not.toContain("getUser");
  });

  it("writes nothing when the decision says not applicable", () => {
    // Returning null is how a writer says "no such account" or "that add-on is not owned", which
    // is the same null those methods returned before the lock existed.
    expect(helper).toContain("if (!decided) return null;");
  });
});

describe("every addOnTerms write is inside it", () => {
  it("discovers the writers from the source, so a new one cannot slip past", () => {
    // Every occurrence of a write to the column, found in the file rather than listed here. The
    // helper's own `set` is the one that performs them all.
    const writes = [...stripped.matchAll(/addOnTerms:/g)].length;
    expect(writes).toBeGreaterThan(0);
    // Each writer named below must be a real method, or this file is asserting about nothing.
    for (const name of WRITERS) {
      expect(bodyOf(name), name).not.toBe("");
    }
    // And no method OUTSIDE that list may write the column. The scan is over the whole file, so
    // a new writer added anywhere fails here until it is named and locked.
    const offenders = WRITERS.reduce((rest, name) => rest.replace(bodyOf(name), ""), stripped)
      .split("\n")
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => /addOnTerms:\s*(nextAddOnTerms|terms|save|decided)/.test(line));
    expect(offenders).toEqual([]);
  });

  for (const name of WRITERS) {
    it(`${name} takes the lock`, () => {
      const body = bodyOf(name);
      expect(body).toContain("mutateAddOnsAtomically(");
      // And does not ALSO do its own read-modify-write beside it, which is the half-migration
      // that would look right and race exactly as before.
      expect(body).not.toMatch(/await this\.getUser\(/);
    });
  }

  it("leaves the no-add-on patches unlocked, which is why the admin saves branch", () => {
    // updateFreeAgentBilling is also how the Stripe and Apple paths write users.freeAgentTier --
    // the hot path every purchase takes. Only the admin panel sends the owned array, so only
    // that branch locks; taking the lock on every tier write would put a row lock on the one
    // statement a purchase cannot afford to queue behind.
    for (const name of ["updateFreeAgentBilling", "updateCoachBilling"]) {
      const body = bodyOf(name);
      expect(body, name).toMatch(/} else \{/);
      expect(body, name).toMatch(/await db\s*\n\s*\.update\(users\)\s*\n\s*\.set\(patch\)/);
    }
  });
});
