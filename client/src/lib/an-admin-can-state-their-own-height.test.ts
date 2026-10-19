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

  /** THE SHELL HAS MORE THAN ONE ACCOUNT MENU, AND THE FIRST FIX ONLY REACHED ONE.
   *
   * The desktop dropdown and the mobile nav each render their own Edit profile entry, each with
   * its own gate. Widening the dropdown's left Scott -- on a phone -- still looking at a menu
   * with no profile entry in it. The first version of this case asserted against a window before
   * the FIRST setProfileOpen(true) in the file, so it passed with the mobile menu still broken:
   * the assertion-direction bug this repo keeps rediscovering, checking one instance of a thing
   * instead of discovering every instance and requiring each to be classified.
   *
   * So: find every trigger, require a count, and require each one to be gated by the single
   * named condition. A third menu added later fails here until it is gated too. */
  const triggers = [...shell.matchAll(/setProfileOpen\(true\)/g)].map((m) => m.index!);

  it("has more than one Edit profile trigger, so a single-site check cannot pass vacuously", () => {
    expect(triggers.length).toBeGreaterThanOrEqual(2);
  });

  it.each(triggers)("the trigger at %i is gated by the one shared condition", (at) => {
    // The gate sits just above its button; 400 chars covers the JSX between them in both menus.
    const preceding = shell.slice(Math.max(0, at - 400), at);
    expect(preceding).toContain("canEditTrainingProfile");
    // And not a hand-rolled copy, which is exactly how the two menus drifted apart.
    expect(preceding).not.toMatch(/user\?\.role === "athlete" &&/);
  });

  it("defines that condition once, naming every role that can film its own training", () => {
    const i = shell.indexOf("const canEditTrainingProfile");
    expect(i).toBeGreaterThan(-1);
    const decl = shell.slice(i, i + 260);
    for (const role of ["athlete", "admin", "coach"]) {
      expect(decl).toContain(`user?.role === "${role}"`);
    }
    expect(decl).not.toContain("guardian");
  });
});
