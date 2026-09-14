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

  it("the self-serve preference and profile routes return toPublicUser", () => {
    // The six that were destructuring by hand. Own-account routes, so this was the caller's own
    // TOTP seed rather than someone else's -- which still reaches browser memory, any proxy
    // logging bodies, and anything that can run script on the page, each of them a working
    // second factor.
    for (const route of [
      'app.patch("/api/admin/my/preferences"',
      'app.patch("/api/coach/my/preferences"',
      'app.patch("/api/athlete/preferences"',
      'app.patch("/api/athlete/profile"',
      'app.patch("/api/notification-prefs"',
      'app.patch("/api/notification-prefs/push-categories"',
    ]) {
      const start = routes.indexOf(route);
      expect(start, `${route} should exist`).toBeGreaterThan(-1);
      expect(routes.slice(start, start + 2500), `${route} must use toPublicUser`).toContain(
        "toPublicUser(updated)",
      );
    }
  });

  it("the coach profile-edit route returns toPublicUser", () => {
    const start = routes.indexOf('app.patch("/api/coach/roster/:athleteId/profile"');
    expect(start).toBeGreaterThan(-1);
    const handler = routes.slice(start, start + 2000);
    expect(handler).toContain("toPublicUser(updated)");
  });
});
