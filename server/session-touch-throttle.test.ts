import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/** THE SESSION TOUCH THROTTLE MUST NOT RE-LEARN A STALE EXPIRY FROM THE STORED JSON.
 *
 * touch() moves the `expire` column only; the JSON's cookie.expires is rewritten by set()
 * alone. get() used to re-remember the JSON value on every read, so five minutes after the
 * last full write the throttle compared against a stale baseline and issued an UPDATE on
 * every request, for every active session, forever. Found 2026-09-20 by counting statements
 * per request. This pins the guard that only adopts the stored value when nothing newer is
 * already tracked. */
const auth = readFileSync("server/auth.ts", "utf8");

describe("ThrottledPgStore.get", () => {
  const body = auth.slice(auth.indexOf("  get(sid: string"), auth.indexOf("  set(sid: string"));

  it("only adopts the stored expiry when it is newer than what is already known", () => {
    expect(body).toContain("const known = this.persistedExpiry.get(sid)");
    expect(body).toMatch(/known === undefined \|\| stored > known/);
    // The old unconditional shape must not come back.
    expect(body).not.toMatch(/if \(!err && sess\) this\.remember\(sid, expiryOf\(sess\)\);/);
  });

  it("still throttles a touch whose expiry barely moved", () => {
    const touch = auth.slice(auth.indexOf("  touch(sid: string"), auth.indexOf("  destroy(sid: string"));
    expect(touch).toContain("next - persisted < TOUCH_THROTTLE_MS");
  });
});
