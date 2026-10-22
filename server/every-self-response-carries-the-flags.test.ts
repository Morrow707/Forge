/**
 * A RESPONSE CARRYING THE CALLER'S OWN IDENTITY CARRIES THE ROLE FLAGS.
 *
 * Added 2026-10-22, after a survey of every role conditional in the repo found this -- which
 * has no role conditional in it at all, and is why seven slices of `role ===` greps were blind
 * to it.
 *
 * WHAT WENT WRONG. `toPublicUser` strips secrets and returns the row. `toPublicUserWithSections`
 * calls it and then attaches twelve flags that need storage (biometricReleaseRequired,
 * assumptionOfRiskRequired, needsTermsAcceptance, isPrimaryCoach, hiddenSections, staffTitle,
 * staffInviteCode, hasGuardianLinks, the three guardian/DOB gates). Only the first was
 * exported, so every user object server/routes.ts handed back was flag-free by construction --
 * and three client dialogs seed the /api/auth/me cache from exactly those responses with a
 * wholesale setQueryData replace.
 *
 * The consequence closed a loop between the two bugs of 2026-10-19. A coach or admin opens Edit
 * My Profile and types the height that bug #2's fix exists to let them add; the response comes
 * back without `biometricReleaseRequired`; the workout screen stops asking for the release that
 * bug #1's fix exists to put in front of them; the capture gate goes on dropping their traces in
 * silence. The recovery path for one bug re-armed the other. `isPrimaryCoach` went with it on the
 * same write, so a primary coach who saved a notification preference read "ask your primary
 * coach" on billing and Coaches Corner until a refetch.
 *
 * THE RULE IS SEMANTIC, NOT A LIST. Six routes return the CALLER's own identity and must carry
 * the flags. One (`PATCH /api/coach/roster/:athleteId/profile`) returns the ATHLETE's row to a
 * coach and must NOT: the flags are "what YOU must do next", so on a third party they are
 * meaningless to the reader and a leak of that athlete's consent state. An exception LIST would
 * rot; a rule about whose row it is does not.
 *
 * WHY THE EXISTING TEST COULD NOT CATCH IT. `coach-profile-response.test.ts` asserts what must be
 * STRIPPED (passwordHash, mfaSecret) and is structurally blind to what must be ATTACHED. Same
 * assertion-direction lesson as NOT_PUBLIC_ON_PURPOSE, the upload-directory list and the
 * email-builder glob: DISCOVER from the source and require every member to be classified.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES = readFileSync(join(__dirname, "routes.ts"), "utf8");
const AUTH = readFileSync(join(__dirname, "auth.ts"), "utf8");

/** A response that hands back SOMEONE ELSE's row, with the reason it may stay flag-free. A
 *  reason under eighty characters is a placeholder rather than an argument. */
const RETURNS_ANOTHER_PERSONS_ROW: Record<string, string> = {
  "/api/coach/roster/:athleteId/profile":
    "A coach editing an athlete on their roster: `updated` is the ATHLETE's row, not the caller's. " +
    "The flags are 'what YOU must do next', so on a third party they mean nothing to the reader and " +
    "shipping that athlete's consent state to their coach is a leak. The body is discarded anyway -- " +
    "athlete-profile-dialog.tsx's onSuccess takes no argument and only invalidates roster keys.",
};

/** Every `res.json(...)` in routes.ts that serializes a user, with the enclosing route path. */
function userResponses(): { path: string; line: number; withSections: boolean }[] {
  const lines = ROUTES.split("\n");
  const out: { path: string; line: number; withSections: boolean }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!/res\.json\(\s*(await\s+)?toPublicUser(WithSections)?\(/.test(l)) continue;
    // Walk back to the route declaration this call sits inside.
    let path = "(unknown)";
    for (let j = i; j >= 0 && j > i - 400; j--) {
      const m = lines[j].match(/app\.(get|post|patch|put|delete)\(\s*"([^"]+)"/);
      if (m) {
        path = m[2];
        break;
      }
    }
    out.push({ path, line: i + 1, withSections: /toPublicUserWithSections\(/.test(l) });
  }
  return out;
}

describe("every self-identity response carries the role flags", () => {
  it("finds the user responses by discovery, never from a list", () => {
    const found = userResponses();
    // Seven today. A floor rather than an equality so adding a route does not fail this case --
    // the classification case below is what must then be satisfied.
    expect(found.length).toBeGreaterThanOrEqual(7);
    expect(found.every((r) => r.path !== "(unknown)")).toBe(true);
  });

  it("holds EVERY user response to one of the two readings", () => {
    const unclassified: string[] = [];
    for (const r of userResponses()) {
      if (r.withSections) continue; // carries the flags: correct for the caller's own identity
      if (r.path in RETURNS_ANOTHER_PERSONS_ROW) continue; // justified as a third party's row
      unclassified.push(`routes.ts:${r.line} ${r.path}`);
    }
    expect(
      unclassified,
      "a user response that neither carries the flags nor is justified as another person's row",
    ).toEqual([]);
  });

  it("REFUSES A STALE EXEMPTION: a route that got the flags must leave the list", () => {
    // The direction that makes this a ratchet rather than a record, and whose absence is how the
    // per-lift camera registry came to look finished while 14 of 15 trackers never read it.
    const withSections = new Set(userResponses().filter((r) => r.withSections).map((r) => r.path));
    const stale = Object.keys(RETURNS_ANOTHER_PERSONS_ROW).filter((p) => withSections.has(p));
    expect(stale).toEqual([]);
  });

  it("refuses an exemption whose reason is a placeholder", () => {
    for (const [path, reason] of Object.entries(RETURNS_ANOTHER_PERSONS_ROW)) {
      expect(reason.length, `${path}'s reason is too short to be an argument`).toBeGreaterThan(80);
      expect(reason, `${path}'s reason does not say whose row it is`).toMatch(
        /athlete's row|another|third party|not the caller/i,
      );
    }
  });

  it("names an exempted route that no longer exists", () => {
    const paths = new Set(userResponses().map((r) => r.path));
    const gone = Object.keys(RETURNS_ANOTHER_PERSONS_ROW).filter((p) => !paths.has(p));
    expect(gone).toEqual([]);
  });

  it("the three cache-seeding routes are among those carrying the flags", () => {
    // Named explicitly as well as discovered, because these are the three the client replaces
    // the auth cache from wholesale -- the mechanism of the bug. A rename that moved one of them
    // out of the discovery regex would otherwise pass the scan above in silence.
    const withSections = new Set(userResponses().filter((r) => r.withSections).map((r) => r.path));
    for (const p of [
      "/api/athlete/profile",
      "/api/notification-prefs",
      "/api/notification-prefs/push-categories",
    ]) {
      expect(withSections.has(p), `${p} seeds the auth cache and must carry the flags`).toBe(true);
    }
  });

  it("keeps both serializers exported, and the sections one attaching every flag", () => {
    expect(AUTH).toMatch(/^export function toPublicUser\(/m);
    expect(AUTH).toMatch(/^export \{ toPublicUserWithSections \};/m);
    // The flags that made this a camera bug rather than a cosmetic one. If a future edit moves
    // one out of this function, the route coverage above becomes a weaker claim than it reads as.
    for (const flag of [
      "biometricReleaseRequired",
      "biometricReleaseAwaitingGuardian",
      "assumptionOfRiskRequired",
      "needsTermsAcceptance",
      "isPrimaryCoach",
      "hiddenSections",
      "hasGuardianLinks",
    ]) {
      const at = AUTH.indexOf(flag, AUTH.indexOf("async function toPublicUserWithSections"));
      expect(at, `${flag} is no longer attached by the sections serializer`).toBeGreaterThan(0);
    }
  });

  it("A CLIENT CACHE WRITE THAT REPLACES WHOLESALE READS A FLAG-BEARING ROUTE", () => {
    // The other half of the mechanism, asserted from the client side so the two cannot drift.
    // A `setQueryData(["/api/auth/me"], x)` that replaces rather than merges is fine ONLY if the
    // response it writes carries the flags. The merge form (`{...prev, one: field}`) is always
    // fine, which is why workout.tsx is not listed here.
    const CLIENT = join(__dirname, "..", "client", "src");
    const REPLACERS: Record<string, string> = {
      "components/edit-my-profile-dialog.tsx": "/api/athlete/profile",
      "components/notification-settings-dialog.tsx": "/api/notification-prefs",
    };
    for (const [rel, route] of Object.entries(REPLACERS)) {
      const src = readFileSync(join(CLIENT, rel), "utf8");
      expect(src, `${rel} no longer writes the auth cache`).toMatch(
        /setQueryData\(\["\/api\/auth\/me"\]/,
      );
      expect(src, `${rel} no longer calls ${route}`).toContain(route);
    }
    const withSections = new Set(userResponses().filter((r) => r.withSections).map((r) => r.path));
    for (const route of Object.values(REPLACERS)) {
      expect(withSections.has(route), `${route} is written wholesale into the auth cache`).toBe(true);
    }
  });
});
