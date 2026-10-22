import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routes = readFileSync(join(__dirname, "routes.ts"), "utf8");
const auth = readFileSync(join(__dirname, "auth.ts"), "utf8");

// A coach editing an athlete's position got the whole users row back, minus
// only passwordHash -- including mfaSecret (the TOTP seed) and
// mfaBackupCodeHashes. toPublicUser exists precisely to stop that and says so
// in its own comment; this route was the one place hand-rolling the strip
// instead of calling it.
//
// Latent today because MFA enrolment is coach/admin-only, so an athlete's
// secret is always null. That is a fact about who can enrol right now, not a
// property of this route: open MFA to athletes and it becomes a live
// credential leak with no change here.

/** A route's OWN handler text: from its declaration to the next route declaration.
 *
 *  NOT a character window. `routes.slice(start, start + 2000)` is how both cases below were
 *  written, and on 2026-10-22 a nine-line comment added above one `res.json` pushed it past the
 *  window and turned the case red on a change that was correct -- the third time in one session.
 *  CLAUDE.md already records this exact failure in stripe-checkout.test.ts, including the half
 *  that is worse than a false red: a fixed window also PASSES for a route whose match sits just
 *  inside it but belongs to an unrelated handler further down the file. Bounding by the next
 *  `app.<verb>(` is the thing that is actually meant by "this route's handler". */
function handlerFor(route: string): string {
  const start = routes.indexOf(route);
  if (start < 0) return "";
  const next = routes.slice(start + route.length).search(/\n  app\.(get|post|patch|put|delete)\(/);
  return next < 0 ? routes.slice(start) : routes.slice(start, start + route.length + next);
}

/** Serialized through one of the two serializers rather than by hand. WHICH one is a separate
 *  question, owned by server/every-self-response-carries-the-flags.test.ts. */
const SERIALIZED = /res\.json\(\s*(await\s+)?toPublicUser(WithSections)?\(updated\)\s*\)/;

describe("no user-shaped response hand-rolls its own field stripping", () => {
  it("toPublicUser still strips every credential field", () => {
    const fn = auth.slice(auth.indexOf("export function toPublicUser"));
    const body = fn.slice(0, fn.indexOf("}"));
    for (const field of ["passwordHash", "mfaSecret", "mfaBackupCodeHashes"]) {
      expect(body, `toPublicUser must strip ${field}`).toContain(field);
    }
  });

  it("routes.ts never destructures passwordHash off a user to build a response", () => {
    // The shape of the original bug. Stripping one credential by hand is the
    // tell: it means the author was thinking about passwordHash specifically
    // rather than about which fields are safe to send, and the next secret
    // added to the users table is included by default.
    //
    // THIS ASSERTION WAS WRITTEN TOO NARROWLY THE FIRST TIME.
    //
    // It used to be /const \{\s*passwordHash\s*,\s*\.\.\./ -- which only matches when
    // passwordHash is followed IMMEDIATELY by the rest element. Six other routes destructured
    // `{ passwordHash, healthStatus, ...publicUser }`, with one field in between, and every one
    // of them sailed past this test while handing the caller their own mfaSecret and
    // mfaBackupCodeHashes. The regex encoded the shape of the single instance that prompted it
    // instead of the defect, so it certified five live leaks as absent.
    //
    // Now it matches a hand-rolled strip with any number of fields named before the rest
    // element, which is the actual thing being banned.
    expect(routes).not.toMatch(/const \{[^}]*\bpasswordHash\b[^}]*\.\.\./);
  });

  it("every self-serve preference and profile route serializes through a serializer", () => {
    // The six that were destructuring by hand. Own-account routes, so this was the caller's own
    // TOTP seed rather than someone else's -- which still reaches browser memory, any proxy
    // logging bodies, and anything that can run script on the page, each of them a working
    // second factor.
    //
    // AND THIS CASE HAD THE SAME DEFECT THE ONE ABOVE IS A MONUMENT TO -- found 2026-10-22, the
    // second time in one file. It asserted the literal string `toPublicUser(updated)`, so when
    // all six were correctly moved to `await toPublicUserWithSections(updated)` (which CALLS
    // toPublicUser and then attaches the role flags, so it satisfies this test's whole purpose
    // strictly better) this case went RED on the fix. A scan that enumerates an accepted FORM
    // fails on every correct change that uses a new one, and gets "fixed" by lengthening the
    // list; a scan that states what is FORBIDDEN accepts every correct change and refuses every
    // wrong one. The forbidden thing is a hand-rolled strip, and the case above already bans it.
    //
    // So this now asserts the RULE: the response goes through one of the serializers, by name.
    for (const route of [
      'app.patch("/api/admin/my/preferences"',
      'app.patch("/api/coach/my/preferences"',
      'app.patch("/api/athlete/preferences"',
      'app.patch("/api/athlete/profile"',
      'app.patch("/api/notification-prefs"',
      'app.patch("/api/notification-prefs/push-categories"',
    ]) {
      const handler = handlerFor(route);
      expect(handler.length, `${route} should exist`).toBeGreaterThan(0);
      expect(
        handler,
        `${route} must serialize through toPublicUser or toPublicUserWithSections`,
      ).toMatch(SERIALIZED);
    }
  });

  it("the coach profile-edit route serializes through a serializer", () => {
    // WHICH serializer this one uses is a different question with a different answer, and it is
    // owned by server/every-self-response-carries-the-flags.test.ts: this route returns the
    // ATHLETE's row to a coach, so it must use the flag-free toPublicUser while the six above
    // must not. That test states the rule and holds the exemption with its reason; this file's
    // only business is that nothing here strips fields by hand.
    const handler = handlerFor('app.patch("/api/coach/roster/:athleteId/profile"');
    expect(handler.length).toBeGreaterThan(0);
    expect(handler).toMatch(SERIALIZED);
  });
});
