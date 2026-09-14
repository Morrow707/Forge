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
    expect(routes).not.toMatch(/const \{\s*passwordHash\s*,\s*\.\.\./);
  });

  it("the coach profile-edit route returns toPublicUser", () => {
    const start = routes.indexOf('app.patch("/api/coach/roster/:athleteId/profile"');
    expect(start).toBeGreaterThan(-1);
    const handler = routes.slice(start, start + 2000);
    expect(handler).toContain("toPublicUser(updated)");
  });
});
