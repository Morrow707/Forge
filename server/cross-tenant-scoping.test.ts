import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Forge is multi-tenant: coaches, their rosters, guardians and their linked
// athletes. The bug class this file exists to catch is one coach reading
// another coach's athlete's record -- an injury history, a form video, a set
// of maxes -- because a route took an id out of the URL and handed it
// straight to a query.
//
// An audit of all 494 routes found none. That is worth keeping rather than
// re-establishing by hand later, and there is no single middleware enforcing
// it: scoping is done per route, three different ways. So this test does
// what the audit did, on every build.
//
// It reads source rather than exercising handlers on purpose. The property
// is "every parameterised route resolves its ids against the requester",
// which is a fact about how the routes are written; a runtime test would
// need a fixture per route and would still only cover the routes somebody
// remembered to write one for.
const routesSrc = readFileSync(join(__dirname, "routes.ts"), "utf8");

type Route = { line: number; verb: string; path: string; body: string };

function parseRoutes(src: string): Route[] {
  const lines = src.split("\n");
  const decls: { i: number; verb: string; path: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    // Both shapes in this file: the path on the app.get( line, and the path
    // on the line after it when the middleware chain is wrapped.
    const inline = lines[i].match(/^\s*app\.(get|post|put|patch|delete)\(\s*"([^"]+)"/);
    const wrapped = lines[i].match(/^\s*app\.(get|post|put|patch|delete)\(\s*$/);
    if (inline) {
      decls.push({ i, verb: inline[1].toUpperCase(), path: inline[2] });
    } else if (wrapped) {
      const next = lines[i + 1]?.match(/^\s*"([^"]+)"/);
      if (next) decls.push({ i, verb: wrapped[1].toUpperCase(), path: next[1] });
    }
  }
  return decls.map((d, idx) => ({
    line: d.i + 1,
    verb: d.verb,
    path: d.path,
    body: lines.slice(d.i, decls[idx + 1]?.i ?? lines.length).join("\n"),
  }));
}

// Every helper in this file whose job is to answer "does this belong to the
// caller". A route using any of them has made the decision explicitly.
const OWNERSHIP_CHECKS = [
  "getRosterAthleteForCoach",
  "getAthleteForGuardianScoped",
  "assertOwnsTeam",
  "assertOwnsExercise",
  "assertOwnsSkillExercise",
  "assertCoachOwnsProgram",
  "assertCoachOwnsSkillProgram",
  "assertCoachOwnsClass",
  "assertAdminOwnsForgeClass",
  "getClassIfUsableByCoach",
  "getEffectiveCoachIds",
  "requireReadableClassLesson",
  "guardianRead(",
];

// Routes whose path parameter names global Forge content or a deliberately
// public lookup, so there is no tenant to scope to. Each is here because it
// was read and judged, not because it was hard to classify -- adding to this
// list is the thing to be suspicious of in review.
const GLOBAL_BY_DESIGN = new Set([
  // Terms and privacy policy, and only the types on a public allowlist.
  "/api/legal-documents/:type",
  // A coach's public invite code resolving to their branding, which is the
  // whole point of an invite code.
  "/api/public/branding/:code",
  // Forge-authored movement profiles, identical for every account.
  "/api/movement-profiles/active/:movementType",
]);

const routes = parseRoutes(routesSrc);

describe("every parameterised route resolves its ids against the requester", () => {
  it("finds the routes at all", () => {
    // Guards against the parser silently matching nothing and the whole
    // file passing vacuously, which is the obvious way a test like this
    // rots into decoration.
    expect(routes.length).toBeGreaterThan(400);
    expect(routes.filter((r) => r.path.includes(":")).length).toBeGreaterThan(100);
  });

  const parameterised = routes.filter((r) => /:\w+/.test(r.path));

  for (const route of parameterised) {
    const head = route.body.split("\n").slice(0, 5).join("\n");
    // Admin routes are platform-wide by definition -- an admin has no tenant
    // to be confined to.
    if (head.includes('requireRole("admin")')) continue;
    if (GLOBAL_BY_DESIGN.has(route.path)) continue;

    it(`${route.verb} ${route.path} (routes.ts:${route.line})`, () => {
      const usesCheck = OWNERSHIP_CHECKS.some((c) => route.body.includes(c));
      // The other correct pattern: hand the requester's own id to the query
      // and let it scope in SQL. Either argument position -- getExerciseDetail
      // takes it second, getRosterAthleteForCoach first.
      const scopesInQuery = /storage\.\w+\(\s*\n?\s*(user\.id\b|[^)]*?,\s*user\.id\b)/.test(route.body);
      expect(
        usesCheck || scopesInQuery,
        `${route.verb} ${route.path} takes an id from the URL but never resolves it against the caller. ` +
          `Either check ownership first (${OWNERSHIP_CHECKS.slice(0, 3).join(", ")}, ...) or pass user.id ` +
          `into the query so it scopes in SQL. If the resource really is global, add the path to ` +
          `GLOBAL_BY_DESIGN with a note saying why.`,
      ).toBe(true);
    });
  }
});

describe("the guardian read surface stays read-only and scoped", () => {
  it("routes every guardian read through the one authorization helper", () => {
    const helper = routesSrc.slice(routesSrc.indexOf("function guardianRead("));
    expect(helper.slice(0, helper.indexOf("\n  }\n"))).toContain("getAthleteForGuardianScoped");
  });

  it("never lets a per-athlete guardian route reach a query without it", () => {
    // The list route is the one exception and needs no per-athlete check:
    // it takes no athlete id, it asks for this guardian's own athletes.
    const perAthlete = routes.filter(
      (r) => r.path.startsWith("/api/guardian/") && r.path.includes(":athleteId"),
    );
    expect(perAthlete.length).toBeGreaterThan(0);
    for (const route of perAthlete) {
      expect(route.body, `${route.verb} ${route.path}`).toContain("getAthleteForGuardianScoped");
    }
  });

  it("scopes the list route to the guardian doing the asking", () => {
    const list = routes.find((r) => r.path === "/api/guardian/athletes");
    expect(list?.body).toContain("getAthletesForGuardian(user.id)");
  });
});

describe("athlete footage is never a plain public file", () => {
  it("gates every directory that holds footage of a person", () => {
    const signing = readFileSync(join(__dirname, "media-url-signing.ts"), "utf8");
    for (const dir of ["form-videos", "skill-videos", "annotations", "problem-reports"]) {
      expect(signing).toContain(`"${dir}"`);
    }
  });

  it("signs on the way out, globally, so no route can forget to", () => {
    const index = readFileSync(join(__dirname, "index.ts"), "utf8");
    expect(index).toContain("signMediaUrlsDeep(body)");
  });
});
