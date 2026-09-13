import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NUMERIC_ROUTE_PARAMS, isValidNumericRouteParam } from "./numeric-route-params";

const SOURCES = ["routes.ts", "auth.ts", "index.ts"].map((f) =>
  readFileSync(join(__dirname, f), "utf8"),
);
const ALL = SOURCES.join("\n");

/** Every route registration, in source order, across the route files.
 *
 * Backtick paths as well as quoted ones: one helper registers its routes as
 * `/api/guardian/athletes/:athleteId${path}`, and a parser that only saw
 * double quotes would be blind to any param a future helper introduces. */
function routeRegistrations(): { verb: string; path: string; at: number }[] {
  const found: { verb: string; path: string; at: number }[] = [];
  let base = 0;
  for (const src of SOURCES) {
    for (const m of src.matchAll(
      /app\.(get|post|put|patch|delete|use|all)\(\s*\n?\s*(?:"([^"]+)"|`([^`]+)`)/g,
    )) {
      found.push({ verb: m[1].toUpperCase(), path: m[2] ?? m[3], at: base + (m.index ?? 0) });
    }
    base += src.length;
  }
  return found;
}

/** Every ":name" appearing in a route path across the route files. */
function paramNamesInRoutePaths(): Set<string> {
  const names = new Set<string>();
  for (const r of routeRegistrations()) {
    for (const p of r.path.matchAll(/:([A-Za-z]+)/g)) names.add(p[1]);
  }
  return names;
}

describe("isValidNumericRouteParam", () => {
  it("takes a plain positive integer", () => {
    for (const v of ["1", "7", "1234", "999999"]) expect(isValidNumericRouteParam(v)).toBe(true);
  });

  it("refuses everything a database id can never be", () => {
    // "0"/"-1" reached real handlers and returned 200 with an empty list, and
    // "abc"/"1.5" reached queries and came back 500s.
    for (const v of ["abc", "0", "-1", "1.5", "", " ", "1e3", "0x1", "1 ", "+1", "NaN", "Infinity"]) {
      expect(isValidNumericRouteParam(v), v).toBe(false);
    }
  });

  it("refuses an integer past what a serial id can hold safely", () => {
    expect(isValidNumericRouteParam("9007199254740993")).toBe(false);
  });
});

describe("NUMERIC_ROUTE_PARAMS covers what it claims to", () => {
  // The list going stale is the one way this guard quietly stops working: a
  // route added next month with a new id param name gets no guard and no
  // warning. So the list is checked against the routes themselves -- a param
  // every handler reads through Number() is an id param, and belongs here.
  it("includes every route param that is only ever read as a number", () => {
    const missing: string[] = [];
    for (const name of paramNamesInRoutePaths()) {
      const uses = [...ALL.matchAll(new RegExp(`req\\.params\\.${name}\\b`, "g"))];
      if (uses.length === 0) continue;
      const coerced = [...ALL.matchAll(new RegExp(`Number\\(req\\.params\\.${name}\\b`, "g"))];
      const alwaysNumeric = uses.length === coerced.length;
      if (alwaysNumeric && !NUMERIC_ROUTE_PARAMS.includes(name as any)) missing.push(name);
    }
    expect(missing).toEqual([]);
  });

  it("lists nothing that is ever read as a string", () => {
    const wrong: string[] = [];
    for (const name of NUMERIC_ROUTE_PARAMS) {
      const uses = [...ALL.matchAll(new RegExp(`req\\.params\\.${name}\\b`, "g"))].length;
      const coerced = [...ALL.matchAll(new RegExp(`Number\\(req\\.params\\.${name}\\b`, "g"))].length;
      if (uses !== coerced) wrong.push(name);
    }
    expect(wrong).toEqual([]);
  });

  it("is registered on the app", () => {
    expect(ALL).toContain("registerNumericParamGuards(app)");
  });
});

// The one way this guard can take a route away: a literal path segment sitting
// where another route has a numeric param (/api/coach/classes/analytics beside
// /api/coach/classes/:id). Express matches layers in registration order, so the
// literal only survives if it is registered FIRST -- otherwise the param layer
// matches "analytics", the guard sees a non-integer and answers 404, and the
// literal route never runs. All four of today's collisions are declared in the
// right order; this keeps the fifth one honest.
describe("literal routes that collide with a numeric param", () => {
  it("declares every colliding literal before the param route", () => {
    // A path still carrying a ${...} hole cannot be compared segment by
    // segment; its concrete suffixes are supplied at a call site.
    const routes = routeRegistrations().filter((r) => !r.path.includes("${"));
    const shadowed: string[] = [];
    for (const paramRoute of routes) {
      const segs = paramRoute.path.split("/");
      for (const literal of routes) {
        if (literal === paramRoute || literal.verb !== paramRoute.verb) continue;
        const other = literal.path.split("/");
        if (other.length !== segs.length) continue;
        let guardedPos = -1;
        let matches = true;
        for (let i = 0; i < segs.length; i++) {
          if (segs[i] === other[i]) continue;
          const isGuardedParam =
            segs[i].startsWith(":") &&
            !other[i].startsWith(":") &&
            NUMERIC_ROUTE_PARAMS.includes(segs[i].slice(1) as any);
          if (!isGuardedParam || guardedPos >= 0) { matches = false; break; }
          guardedPos = i;
        }
        if (matches && guardedPos >= 0 && literal.at > paramRoute.at) {
          shadowed.push(`${literal.verb} ${literal.path} is registered after ${paramRoute.path}`);
        }
      }
    }
    expect(shadowed).toEqual([]);
  });
});
