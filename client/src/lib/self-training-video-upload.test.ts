import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// A COACH FILMING THEIR OWN LIFT IS STILL FILMING A LIFT.
//
// /coach/my and /admin/my render the same WorkoutPage with the same tracker
// dialogs as an athlete's day, and every tracker uploads through the one path
// uploadOrQueueVideo hardcodes -- /api/athlete/form-video. That route was
// requireRole("athlete"), so a coach recorded a set, sat through the analysis and
// then got "...And the video didn't save either: Forbidden".
//
// Source-level because the failure was a route declaration, not behaviour inside a
// handler: the metrics saved, only the clip was lost, so nothing downstream
// noticed.
const routes = readFileSync("server/routes.ts", "utf8");

function registration(path: string): string {
  const at = routes.indexOf(`"${path}"`);
  expect(at, `route not registered: ${path}`).toBeGreaterThan(-1);
  return routes.slice(at, at + 400);
}

describe("self-training video uploads are not athlete-only", () => {
  for (const path of ["/api/athlete/form-video", "/api/athlete/skill-video"]) {
    it(`accepts coach and admin on ${path}`, () => {
      const block = registration(path);
      expect(block).toContain('requireRole(["athlete", "coach", "admin"])');
    });

    it(`still gates ${path} on video access and disk space`, () => {
      const block = registration(path);
      expect(block).toContain("requireVideoTrackingAccess");
      expect(block).toContain("requireDiskSpace");
    });
  }

  it("exempts coach and admin from the Free Agent video paywall", () => {
    // The rule asks athleteHasCoach and then checks a Free Agent entitlement; for a coach both
    // answers are "no", which would be a 402 for someone who is not a Free Agent at all.
    //
    // Reads cameraAccessFor, not requireVideoTrackingAccess. The rule moved there when the CLIENT
    // needed the same answer -- it now decides whether a record button is drawn as well as
    // whether a clip may be saved. This test caught that move, which is the test working: the
    // exemption has to be found wherever the decision actually lives.
    const at = routes.indexOf("async function cameraAccessFor");
    expect(at).toBeGreaterThan(-1);
    const block = routes.slice(at, at + 1600);
    expect(block).toContain('user.role === "coach" || user.role === "admin"');
  });

  it("makes the route gate and the client ask the SAME function", () => {
    // Two copies of this rule would disagree silently, and the disagreement is only visible to
    // the person it strands: either a record button nobody can use, or a hidden button somebody
    // has paid for. The middleware and the endpoint both delegate.
    const at = routes.indexOf("async function requireVideoTrackingAccess");
    expect(routes.slice(at, at + 600)).toContain("await cameraAccessFor(user)");
    const endpoint = routes.indexOf('"/api/athlete/camera-access"');
    expect(endpoint).toBeGreaterThan(-1);
    expect(routes.slice(endpoint, endpoint + 400)).toContain("cameraAccessFor(currentUser(req))");
  });

  it("keeps the server gate even though the client now hides the button", () => {
    // Hiding a button is presentation, not permission. A client is a thing anybody can edit, so
    // the routes that actually save a clip must never come to rely on the UI having asked first.
    for (const path of ["/api/athlete/form-video", "/api/athlete/skill-video"]) {
      expect(registration(path)).toContain("requireVideoTrackingAccess");
    }
  });
});
