import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const pending = read("client/src/pages/guardian-pending.tsx");
const dashboard = read("client/src/pages/guardian-dashboard.tsx");
const routes = read("server/routes.ts");

/** The minor hold is released by someone else, somewhere else. */
describe("the screen a held minor waits on", () => {
  it("keeps checking whether the hold has lifted", () => {
    // /api/auth/me is fetched at sign-in and nothing tells this screen when a parent finishes
    // claiming in their own inbox on their own device. Without a re-check the screen's own
    // promise -- "as soon as they finish, everything here unlocks for you" -- was false, and the
    // way out was force-quitting the app.
    expect(pending).toMatch(/invalidateQueries\(\{ queryKey: \["\/api\/auth\/me"\] \}\)/);
    expect(pending).toMatch(/setInterval\(recheck/);
    expect(pending).toMatch(/addEventListener\("focus", recheck\)/);
  });

  it("leaves the athlete a way to act and a way out", () => {
    // A hold with no action is indistinguishable from a broken app, and nobody should be stuck
    // in an account they cannot leave.
    expect(pending).toContain("/api/account/guardian-invite/resend");
    expect(pending).toMatch(/logoutMutation\.mutate\(\)/);
  });

  it("is matched by an allowlist that cannot trap the person it holds", () => {
    // The gate fails closed, so anything needed to CLEAR it has to be reachable through it.
    for (const escape of [
      '"/api/auth/"',
      '"/api/account/backfill-date-of-birth"',
      '"/api/account/guardian-invite/resend"',
      '"/api/account/delete"',
    ]) {
      expect(routes, escape).toContain(escape);
    }
  });
});

/** A parent reading their child's record has to be able to tell "nothing here" from "we
 * couldn't load it". */
describe("the guardian dashboard's failed reads", () => {
  it("never renders a failed request as an endless spinner", () => {
    expect(dashboard).toMatch(/athletesFailed \?/);
    expect(dashboard).toMatch(/videosFailed \?/);
    expect(dashboard).toMatch(/function LoadFailed/);
  });

  it("says a failure is not an empty record", () => {
    // The videos card promises "every video on this athlete's record". An empty list is a
    // claim a parent would act on, so a read that did not arrive must not look like one.
    expect(dashboard).toContain("This isn't a sign that there's nothing here.");
  });

  it("offers a retry rather than requiring a reload", () => {
    expect(dashboard).toMatch(/refetchAthletes\(\)/);
    expect(dashboard).toMatch(/refetchVideos\(\)/);
  });
});
