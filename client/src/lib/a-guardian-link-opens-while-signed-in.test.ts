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
  it("never redirects a signed-in user away from the invite before they act", () => {
    // No <Redirect>: a render-time redirect is what bounced the parent. Navigation after an ACT
    // (a claim succeeding, a guardian tapping through to their dashboard) is allowed and
    // required -- see the two cases below.
    expect(src).not.toMatch(/<Redirect\b/);
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

  it("a successful claim leaves for the guardian dashboard (fixed 2026-10-15)", () => {
    // Removing the <Redirect> on 10-11 also removed the only thing that carried a JUST-CLAIMED
    // guardian off this page: the claim succeeded, the page re-rendered into the signed-in card
    // or -- once the consumed token's preview 404'd -- "Link not valid", over a claim that had
    // worked (Scott, screenshot: "It did work but."). The navigation belongs in onSuccess.
    const onSuccess = src.slice(src.indexOf("onSuccess: ({ nativeToken"));
    const body = onSuccess.slice(0, onSuccess.indexOf("\n    },"));
    expect(body).toContain('qc.setQueryData(["/api/auth/me"], claimedUser);');
    expect(body).toContain('setLocation("/guardian");');
    expect(body.indexOf("setQueryData")).toBeLessThan(body.indexOf('setLocation("/guardian")'));
  });

  it("a signed-in GUARDIAN is sent to their dashboard, never told to sign out", () => {
    const guardianAt = src.indexOf('if (!isLoading && user?.role === "guardian")');
    const signedInAt = src.indexOf("if (!isLoading && user)");
    expect(guardianAt).toBeGreaterThan(-1);
    // Checked BEFORE the generic signed-in branch, or a guardian re-opening their own link meets
    // the sign-out card.
    expect(guardianAt).toBeLessThan(signedInAt);
    const branch = src.slice(guardianAt, signedInAt);
    expect(branch).toContain('data-testid="guardian-claim-already-guardian"');
    expect(branch).toContain('setLocation("/guardian")');
    expect(branch).not.toContain("logoutMutation");
  });

  it("the invalid-link copy names the athlete's own resend, not only a coach", () => {
    // A Free Agent minor has no coach; the resend lives on their account page.
    expect(src).toContain("The athlete can send a new one");
    expect(src).not.toContain("ask the athlete's coach or");
  });

  it("loads the invite preview whether or not somebody is signed in", () => {
    const m = src.match(/enabled:\s*([^,\n]+),/);
    expect(m, "the preview query's enabled flag").toBeTruthy();
    expect(m![1]).not.toMatch(/!user/);
  });
});
