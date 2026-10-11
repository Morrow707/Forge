import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A guardian invite link opened by somebody who is already signed in (a coach who is also the
 * parent, signed in on the phone they read email on) used to <Redirect> them to their own
 * dashboard with no word about the invite. The page now shows the invite and offers a sign-out
 * that keeps the URL, so the claim form renders in place once the session is gone.
 */
const src = readFileSync(
  path.resolve(__dirname, "../pages/guardian-claim.tsx"),
  "utf8",
);

describe("a guardian invite link opens while signed in", () => {
  it("never redirects a signed-in user away from the invite", () => {
    expect(src).not.toMatch(/<Redirect\b/);
    expect(src).not.toMatch(/from "wouter"/);
  });

  it("offers a sign-out that keeps the invite URL, on the signed-in branch", () => {
    const signedIn = src.slice(src.indexOf("if (!isLoading && user)"));
    expect(signedIn).toContain("logoutMutation.mutate()");
    expect(signedIn).toContain('data-testid="guardian-claim-signed-in"');
    // No navigation on the branch: the token lives in the URL and must survive the sign-out.
    expect(signedIn.slice(0, signedIn.indexOf("if (!token"))).not.toMatch(
      /setLocation|navigate\(|window\.location\.(assign|href|replace)/,
    );
  });

  it("loads the invite preview whether or not somebody is signed in", () => {
    const m = src.match(/enabled:\s*([^,\n]+),/);
    expect(m, "the preview query's enabled flag").toBeTruthy();
    expect(m![1]).not.toMatch(/!user/);
  });
});
