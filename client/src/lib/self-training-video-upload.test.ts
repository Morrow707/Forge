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
    // requireVideoTrackingAccess asks athleteHasCoach and then checks a Free Agent
    // entitlement; for a coach both answers are "no", which is a 402 for someone who
    // is not a Free Agent at all.
    const at = routes.indexOf("async function requireVideoTrackingAccess");
    const block = routes.slice(at, at + 1200);
    expect(block).toContain('user.role === "coach" || user.role === "admin"');
  });
});
