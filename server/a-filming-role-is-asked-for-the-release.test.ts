import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROLES_THAT_FILM_THEIR_OWN_TRAINING } from "@shared/roles-that-film-their-own-training";

// A TRIGGER MUST NEVER BE GATED MORE LOOSELY THAN THE THING IT OPENS -- and the Record button was.
//
// 2026-10-19, the first calibration session filmed on the admin account: three lifts beside the
// OVR, three saves answered 200, three clips uploaded, and the capture export came back EMPTY.
// The capture gate (captureField in submitWorkoutLog) withholds skeleton frames and path traces
// from an account with no biometric release on file -- correct. The workout screen asks for the
// release before opening the camera only when /api/auth/me says biometricReleaseRequired --
// correct. And that flag was computed inside `if (user.role === "athlete")`, so a coach or admin,
// whom cameraAccessFor lets film by role alone, was offered Record, filmed, and lost the trace
// without a word. These scans hold the three things in step.
const auth = readFileSync(join(__dirname, "auth.ts"), "utf8");
const routes = readFileSync(join(__dirname, "routes.ts"), "utf8");
const storage = readFileSync(join(__dirname, "storage.ts"), "utf8");

const fnBody = (src: string, start: string) => {
  const i = src.indexOf(start);
  expect(i, `could not find ${start}`).toBeGreaterThan(-1);
  const rest = src.slice(i);
  return rest.slice(0, rest.indexOf("\n}\n"));
};

describe("every role that can be offered Record is asked for the biometric release first", () => {
  it("names the same roles cameraAccessFor grants by role alone, plus the athlete", () => {
    const body = fnBody(routes, "async function cameraAccessFor(");
    const byRole = body.match(/user\.role === "(\w+)"/g)?.map((m) => m.match(/"(\w+)"/)![1]) ?? [];
    expect(byRole.length).toBeGreaterThan(0);
    expect(new Set([...byRole, "athlete"])).toEqual(new Set(ROLES_THAT_FILM_THEIR_OWN_TRAINING));
  });

  it("computes the release flags under that set, not under the athlete branch", () => {
    const body = fnBody(auth, "async function toPublicUserWithSections(");
    const flags = body.indexOf("publicUser.biometricReleaseRequired =");
    const gate = body.lastIndexOf("if (ROLES_THAT_FILM_THEIR_OWN_TRAINING.has(user.role))", flags);
    const athleteOnly = body.lastIndexOf('if (user.role === "athlete")', flags);
    expect(gate).toBeGreaterThan(-1);
    // The role-set gate is the nearest enclosing branch above the flag, never the athlete one.
    expect(gate).toBeGreaterThan(athleteOnly);
    expect(body.indexOf("publicUser.biometricReleaseAwaitingGuardian =")).toBeGreaterThan(gate);
  });

  it("never reads a coach or admin as a minor waiting on a guardian", () => {
    // An admin row can carry no date of birth. The adult test is role-first so that row is asked
    // for its own release rather than told a guardian can give it.
    const body = fnBody(auth, "async function toPublicUserWithSections(");
    expect(body).toMatch(/const isAdult =\s*user\.role !== "athlete" \|\|/);
  });

  it("records the release for every role in the set, which is what makes asking honest", () => {
    const i = auth.indexOf('app.post("/api/account/biometric-release"');
    expect(i).toBeGreaterThan(-1);
    expect(auth.slice(i, i + 120)).toContain("requireAuth");
    // The route took any signed-in account from the day it was written; the METHOD behind it
    // answered "Not found." to anyone but an athlete, which is the half a middleware scan
    // cannot see.
    const body = fnBody(storage, "async recordBiometricRelease(");
    expect(body).toContain("ROLES_THAT_FILM_THEIR_OWN_TRAINING.has(athlete.role)");
    expect(body).not.toContain('athlete.role !== "athlete"');
    // The guardian answer is the ATHLETE minor's, never a coach's or admin's.
    expect(body).toMatch(/athlete\.role === "athlete" &&\s*\(!athlete\.dateOfBirth/);
  });
});

describe("the capture export lists a capture whose trace was withheld, and says why", () => {
  it("uses the tracking report's membership rule, never 'has a trace'", () => {
    const body = fnBody(storage, "async getStoredCapturesForReplay(");
    expect(body).toContain(".where(cameraCaptureEvidence())");
    expect(body).not.toMatch(/isNotNull\(workoutSetEntries\.barPathTrace\)/);
    expect(fnBody(storage, "async getRecentTrackedSetsForAdmin(")).toContain("cameraCaptureEvidence()");
  });

  it("names the consent as the reason beside the row, in words", () => {
    const i = routes.indexOf('app.get("/api/admin/capture-export.json"');
    const route = routes.slice(i, routes.indexOf("\n  });\n", i));
    expect(route).toContain("traceAbsentBecause");
    expect(route).toContain('"no_biometric_release_on_file_for_this_account"');
    expect(route).toContain("storage.hasBiometricConsent(");
  });
});
