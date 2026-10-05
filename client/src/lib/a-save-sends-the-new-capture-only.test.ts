import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* A FINISHED CAMERA SET SENDS ITS OWN CAPTURE, NOT EVERY EARLIER SET'S.
 *
 * Scott's debug console, 2026-10-05, one session:
 *   log POST sending 10472KB (traces 10362KB)   ok in 7712ms
 *   log POST sending 11961KB (traces 11843KB)   ok in 10228ms
 *   log POST sending 13340KB (traces 13214KB)   ok in 10512ms
 *   log POST sending 13383KB (traces 13243KB)   FAILED: 409
 *   log POST FAILED: NetworkError: Can't reach Forge right now        (x2)
 * and beside them, from the keystroke path that already omitted:
 *   log POST sending 118KB (traces 0KB)         ok in 2460ms
 *
 * Every finished camera set re-uploaded the skeleton frames of every set before it, so the
 * payload grew all session and each save took 7-11 seconds. Two died on the network and one on
 * a 409, and the Back Squat and med ball throw filmed that night never reached the server. A
 * 13MB upload from a phone is a payload problem, not a network one.
 *
 * The safety is capturePersistedRef, and it is the thing to protect: a set joins it only inside
 * `if (synced)` in onSuccess, so "already persisted" means the SERVER said so. The set just
 * finished has never been saved, so it is never omitted.
 */
const src = readFileSync(join(process.cwd(), "client/src/pages/workout.tsx"), "utf8");

describe("a save carries the new capture and not the confirmed ones", () => {
  it("autosaveNow omits captures the server has confirmed", () => {
    const fn = src.slice(src.indexOf("function autosaveNow"));
    const body = fn.slice(0, fn.indexOf("\n  }\n") + 5);
    expect(body).toContain("omitPersistedCapture: true");
  });

  it("the keystroke path still omits too", () => {
    expect(src).toContain("omitPersistedCapture: true");
    expect((src.match(/omitPersistedCapture: true/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("a set is marked persisted ONLY on a synced save", () => {
    // The whole safety of omitting rests here. If this ever fires on an unsynced save, a set's
    // frames would be omitted from the retry that was supposed to rescue them.
    const marker = src.indexOf("capturePersistedRef.current.add");
    expect(marker).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, marker - 300), marker);
    expect(before).toContain("if (synced)");
  });

  it("omits the capture keys rather than nulling them", () => {
    // The server reads an absent key as "keep what you have" and an explicit null as "clear
    // it", so nulling would erase exactly the data this avoids re-uploading.
    expect(src).toContain("const capture = omitCapture");
    expect(src).toMatch(/omitCapture\s*\n?\s*\?\s*\{\}/);
  });
});
