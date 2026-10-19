import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** THE HEIGHT IS A SCALE RULER, AND IT TAKES TWO HALVES TO TYPE ONE.
 *
 * Scott, 2026-10-19, setting out to film on his admin account: "I can't upload a height and
 * weight to my admin profile, will the camera be accurate?" -- and then, after the server half
 * shipped, "I don't have a profile setting in the app, only account."
 *
 * Two independent gates, and fixing either one alone leaves the feature just as broken:
 *   1. PATCH /api/athlete/profile was requireRole("athlete"), so the server refused the write.
 *   2. The "Edit profile" item in the account menu was drawn only for role === "athlete", so an
 *      admin never had a way to open the dialog that sends it.
 *
 * They fail identically from the outside -- nothing happens -- which is why they are pinned
 * together here rather than in two files. The camera consequence is the reason this is a ratchet
 * and not a preference: calibrateFromFrames, body3DScaleFromFrames and repAmplitudeGateCm all
 * read the athlete's height, so a role that can film and cannot state its height films worse,
 * with nothing on screen to say so. */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const routes = read("server/routes.ts");
const shell = read("client/src/components/app-shell.tsx");

describe("an admin can state their own height", () => {
  it("lets any signed-in caller write their OWN profile", () => {
    const i = routes.indexOf('app.patch("/api/athlete/profile"');
    expect(i).toBeGreaterThan(-1);
    const handler = routes.slice(i, routes.indexOf("async (", i));
    expect(handler).toContain("requireAuth");
    expect(handler).not.toContain('requireRole("athlete")');
  });

  it("still writes only the caller's own row, whatever their role", () => {
    const i = routes.indexOf('app.patch("/api/athlete/profile"');
    const body = routes.slice(i, i + 700);
    // The id comes from the session, never from the body or a path param -- that is what makes
    // widening the role gate safe.
    expect(body).toMatch(/updateUserProfile\(user\.id,/);
    expect(body).not.toMatch(/req\.params/);
  });

  it("draws the Edit profile menu item for every role that can film its own training", () => {
    const i = shell.indexOf("setProfileOpen(true)");
    expect(i).toBeGreaterThan(-1);
    const gate = shell.slice(Math.max(0, i - 900), i);
    for (const role of ["athlete", "admin", "coach"]) {
      expect(gate).toContain(`user?.role === "${role}"`);
    }
  });

  it("does not draw it for a guardian, who manages an account rather than training on it", () => {
    const i = shell.indexOf("setProfileOpen(true)");
    const gate = shell.slice(Math.max(0, i - 900), i);
    expect(gate).not.toContain('user?.role === "guardian"');
  });
});
