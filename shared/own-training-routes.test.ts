/**
 * EVERY OWN-TRAINING LINK POINTS AT A ROUTE THAT ROLE CAN ACTUALLY OPEN.
 *
 * shared/own-training-routes.ts exists because the video-retention warning's escape hatch is a
 * link, the grace clock starts when the notice is DELIVERED, and every own-training route is
 * declared for exactly one role. A path typed in that module and not routed in App.tsx -- or
 * routed for a different role -- is a warning that refuses the person it was sent to, seven days
 * before their video is deleted, and nothing else in the app would notice.
 *
 * So this reads client/src/App.tsx rather than restating the paths: discovered from the router,
 * not from a list that can agree with a typo.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROLES_THAT_FILM_THEIR_OWN_TRAINING } from "./roles-that-film-their-own-training";
import {
  OWN_TRAINING_ROUTES,
  ownTrainingCalendarRoute,
  ownTrainingDayRoute,
} from "./own-training-routes";

const APP = readFileSync(join(__dirname, "..", "client", "src", "App.tsx"), "utf8");

/** The role a given `<Route path="...">` is protected for, or null when that path is not routed
 *  at all. Reads the ProtectedRoute on the lines that follow the path, which is how every one of
 *  these is written. */
function roleGuarding(path: string): string | null {
  const at = APP.indexOf(`<Route path="${path}"`);
  if (at < 0) return null;
  const block = APP.slice(at, at + 400);
  return block.match(/<ProtectedRoute\s+role="([a-z]+)"/)?.[1] ?? null;
}

describe("own-training routes", () => {
  it("names exactly the roles that film their own training", () => {
    // Not a superset and not a subset: a role in the map that films nothing would make the
    // athlete fallback load-bearing, and a filming role missing from the map would silently
    // take it.
    expect(Object.keys(OWN_TRAINING_ROUTES).sort()).toEqual(
      [...ROLES_THAT_FILM_THEIR_OWN_TRAINING].sort(),
    );
  });

  it("every calendar path is routed, and routed for THAT role", () => {
    for (const role of Object.keys(OWN_TRAINING_ROUTES)) {
      const path = ownTrainingCalendarRoute(role);
      expect(roleGuarding(path), `${path} is not a <Route> in App.tsx`).not.toBeNull();
      expect(roleGuarding(path), `${path} is routed for the wrong role`).toBe(role);
    }
  });

  it("every day path is routed, and routed for THAT role", () => {
    for (const role of Object.keys(OWN_TRAINING_ROUTES)) {
      // The router declares parameters; the function fills them. Compare the declared shape by
      // substituting the same three parameter names the routes use.
      const built = ownTrainingDayRoute(role, 1, 2, "2026-01-01");
      const declared = built
        .replace("/1/2/2026-01-01", "/:assignmentId/:programDayId/:date");
      expect(roleGuarding(declared), `${declared} is not a <Route> in App.tsx`).not.toBeNull();
      expect(roleGuarding(declared), `${declared} is routed for the wrong role`).toBe(role);
    }
  });

  it("the three roles get three DIFFERENT destinations", () => {
    // The whole point. If a future edit collapsed these onto one path this passes everything
    // above (one path routed for one role) and still sends two of the three somewhere they are
    // refused.
    const calendars = [...ROLES_THAT_FILM_THEIR_OWN_TRAINING].map(ownTrainingCalendarRoute);
    expect(new Set(calendars).size).toBe(calendars.length);
    const days = [...ROLES_THAT_FILM_THEIR_OWN_TRAINING].map((r) =>
      ownTrainingDayRoute(r, 7, 8, "2026-05-05"),
    );
    expect(new Set(days).size).toBe(days.length);
    expect(days.every((d) => d.endsWith("/7/8/2026-05-05"))).toBe(true);
  });

  it("an unknown role falls back to the athlete's routes rather than throwing", () => {
    // Inside a nightly sweep, a throw would stop every account after this one. Stated, and the
    // first case above is what stops the fallback becoming the normal path.
    expect(ownTrainingCalendarRoute("guardian")).toBe(ownTrainingCalendarRoute("athlete"));
    expect(ownTrainingDayRoute("nobody", 1, 2, "2026-01-01")).toBe(
      ownTrainingDayRoute("athlete", 1, 2, "2026-01-01"),
    );
  });
});
