import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source-scanned rather than rendered: this file lives under lib/ because that is what the unit
// suite includes, and what it asserts is wiring -- which launch point goes through the check, and
// what the dialog actually says -- neither of which needs a DOM.
const workout = readFileSync(join(__dirname, "..", "pages", "workout.tsx"), "utf8");
const dialog = readFileSync(
  join(__dirname, "..", "components", "biometric-release-dialog.tsx"),
  "utf8",
);

// ASKING IS WHAT TURNS A SILENT REFUSAL INTO A CHOICE.
//
// The server refuses to store skeleton frames or path traces for an athlete with no biometric
// release on file, whatever the client does. Without this prompt that refusal reaches the athlete
// as a set they filmed that came back empty, with no explanation and nothing they can do -- which
// is correct enforcement and a terrible experience, and the worst of the two failure modes
// available here.
describe("the biometric release prompt", () => {
  it("is asked before the camera opens, not after the set is filmed", () => {
    // The single launch point goes through the check. A tracker opened directly would collect
    // first and ask later, which is the ordering these statutes are specifically about.
    expect(workout).toContain("onClick={() => startTracking(set.setNumber)}");
    const fn = workout.slice(workout.indexOf("const startTracking = ("));
    const body = fn.slice(0, fn.indexOf("\n  };"));
    expect(body).toContain("user?.biometricReleaseRequired");
    // Asking REPLACES opening the tracker rather than racing it.
    expect(body).toContain("return;");
  });

  it("carries the athlete into the set they were reaching for", () => {
    // Being asked a question should not cost them the tap that prompted it.
    expect(workout).toContain("setReleaseAskedForSet");
    const handler = workout.slice(workout.indexOf("onAgreed={() => {"));
    expect(handler.slice(0, 400)).toContain("setTrackingSet(pending)");
  });

  // An agreement that is the only way out of a dialog is not an agreement. Declining has to be a
  // real answer that leaves the athlete no worse off.
  it("offers a genuine refusal, with the consequence stated", () => {
    expect(dialog).toContain("Not now");
    expect(dialog).toMatch(/You can train without this/i);
    expect(dialog).toMatch(/sets still log normally/i);
  });

  it("says what is actually collected, in the athlete's own terms", () => {
    expect(dialog).toMatch(/joint positions/i);
    expect(dialog).toMatch(/bar speed|range of motion|jump height/i);
    // The fact that makes this less alarming than it sounds, and it happens to be true.
    expect(dialog).toMatch(/runs on your own device/i);
  });

  it("links the release rather than asking them to agree to something unreadable", () => {
    expect(dialog).toContain('href="/legal"');
  });

  it("does not ask again once they have agreed", () => {
    // The route returns the fresh user, whose flag is already false -- so the answer is written
    // into the cache rather than waiting on a refetch that may not happen before the next tap.
    expect(dialog).toContain('qc.setQueryData(["/api/auth/me"], user)');
  });
});
