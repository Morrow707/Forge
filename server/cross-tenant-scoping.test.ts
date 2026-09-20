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
  // The remaining resolve-this-id-against-the-caller helpers. They were
  // missing only because the looser check below them used to pass these
  // routes on a different call in the same handler, so nothing pointed at
  // the gate that was actually doing the work.
  "getProgramIfUsableByCoach",
  "getAssignmentForCoach",
  "getAssignmentForAthlete",
  "getSkillAssignmentForCoach",
  "getSkillAssignmentForAthlete",
  "getClassEnrollmentForAthlete",
  // Answers "may this account act for this athlete's paperwork" -- the athlete themselves, a
  // linked guardian, or a coach whose effective roster they are on. Deliberately excludes an
  // admin, who reviews these rather than uploading them, so the waiver routes gate on it plus
  // an explicit admin branch where reading is allowed.
  "canManageWaiversFor",
];

// Routes whose path parameter names global Forge content or a deliberately
// public lookup, so there is no tenant to scope to. Each is here because it
// was read and judged, not because it was hard to classify -- adding to this
// list is the thing to be suspicious of in review.
const GLOBAL_BY_DESIGN = new Set([
  // Terms and privacy policy, and only the types on a public allowlist.
  "/api/legal-documents/:type",
  // The same public document as a PDF, from the same public set; nothing about it is per-user.
  "/api/legal-documents/:type.pdf",
  // A coach or team invite code resolving to that program's public page -- no
  // account, by design, since the audience is a parent or a recruit who does not have
  // one. There is no caller to scope against. What it returns is bounded instead: the
  // program's name, logo and colour, plus the motto, mission and contact email only
  // when the program is entitled to Team Identity, and never the athlete welcome
  // message. See the route's own comment.
  "/api/public/team/:code",
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

/**
 * Routes where a call takes a URL id that nothing in this file can see being
 * resolved against the caller, and which were read individually and judged
 * safe for a reason a pattern cannot express. Keyed by call, not by route, so
 * adding a second unscoped call to one of these routes still fails.
 *
 * This is the list to be suspicious of in review. Every entry is a promise
 * that someone read the handler and the storage function it calls.
 */
const RESOLVED_ANOTHER_WAY = new Map<string, string>([
  [
    "GET /api/calendar/:token.ics::getUserByCalendarToken",
    "The parameter IS the credential, not an id to check against a session -- there is no " +
      "session, because a calendar client cannot hold one. 192 random bits under a unique " +
      "index, and the caller is derived from it rather than compared against it.",
  ],
  [
    "GET /api/coach/academy/tracks/:id::getAcademyTrackFull",
    "academy_tracks has no owner column: Forge-authored Coaches Corner content, identical " +
      "for every account. hasCoachesCornerAccess on this route is an entitlement gate, not a " +
      "tenancy one.",
  ],
  [
    "GET /api/athlete/programs/:id::getProgramFull",
    "Fetch-then-check: the row is loaded unscoped, then the handler 404s unless " +
      "ownerIds.includes(program.coachId). Safe only because nothing is written to the " +
      "response between the two, which is why this stays an exception rather than a pattern.",
  ],
  [
    "GET /api/athlete/skill-programs/:id::getSkillProgramFull",
    "Fetch-then-check, exactly as /api/athlete/programs/:id above.",
  ],
  [
    "DELETE /api/coach/team-challenges/:id::getTeamChallengeById",
    "Fetch-then-check: the row is loaded unscoped so the handler can read its teamId, then " +
      "assertOwnsTeam decides. The row itself is never returned -- it exists only to name the " +
      "team the ownership check runs against.",
  ],
  [
    "DELETE /api/coach/team-game-days/:id::getTeamGameDayById",
    "Fetch-then-check, exactly as /api/coach/team-challenges/:id above.",
  ],
  [
    "POST /api/athlete/classes/:id/enroll::getClassById",
    "The row is never returned; the handler 404s unless it is a published Forge-official " +
      "class, so the reachable set is the public catalogue rather than anyone's own classes.",
  ],
]);

/** Identifiers in a handler that carry a value taken out of the URL. */
function paramDerivedNames(body: string): Set<string> {
  const names = new Set<string>();
  for (const m of body.matchAll(/const\s+(\w+)\s*=\s*(?:Number\(\s*)?req\.params\.\w+/g)) {
    names.add(m[1]);
  }
  for (const m of body.matchAll(/const\s*\{([^}]*)\}\s*=\s*req\.params/g)) {
    for (const part of m[1].split(",")) {
      const name = part.split(":").pop()?.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

/** Every storage.X(...) call in a handler, with its argument text. */
function storageCalls(body: string): { fn: string; args: string; at: number }[] {
  const calls: { fn: string; args: string; at: number }[] = [];
  const re = /storage\.(\w+)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    let depth = 1;
    let j = re.lastIndex;
    while (j < body.length && depth > 0) {
      if (body[j] === "(") depth++;
      else if (body[j] === ")") depth--;
      j++;
    }
    calls.push({ fn: m[1], args: body.slice(re.lastIndex, j - 1), at: m.index });
  }
  return calls;
}

/**
 * The blind spot in the check above, closed.
 *
 * That test asks whether a route scopes SOMEWHERE -- any storage call taking
 * user.id satisfies it. A handler that does two things, one of them scoped
 * and one of them not, therefore passes while the unscoped half is exactly
 * the bug the file exists to catch: fetch the caller's own record with
 * user.id, then hand a second id straight from the URL to a second query.
 * Nothing in the codebase does this today, which is the moment to nail it
 * down rather than after something does.
 *
 * So this asks the question per CALL instead of per route: every storage call
 * that receives a value out of the URL must either take user.id itself, or
 * come after a helper whose job is to resolve that id against the caller.
 */
describe("no second, unscoped id slips past a route that scopes somewhere else", () => {
  const parameterised = routes.filter((r) => /:\w+/.test(r.path));

  for (const route of parameterised) {
    const head = route.body.split("\n").slice(0, 5).join("\n");
    if (head.includes('requireRole("admin")')) continue;
    if (GLOBAL_BY_DESIGN.has(route.path)) continue;

    const names = paramDerivedNames(route.body);
    const suspect = storageCalls(route.body).filter((call) => {
      const takesUrlId =
        /req\.params/.test(call.args) ||
        [...names].some((n) => new RegExp(`\\b${n}\\b`).test(call.args));
      if (!takesUrlId) return false;
      // Scoped in SQL by the same call that takes the id.
      if (/\buser\.id\b/.test(call.args)) return false;
      // Gated before the call. Position matters: a check that runs afterwards
      // has already let the query run.
      const before = route.body.slice(0, call.at);
      return !OWNERSHIP_CHECKS.some((c) => before.includes(c));
    });

    if (suspect.length === 0) continue;

    it(`${route.verb} ${route.path} (routes.ts:${route.line})`, () => {
      for (const call of suspect) {
        const key = `${route.verb} ${route.path}::${call.fn}`;
        expect(
          RESOLVED_ANOTHER_WAY.has(key),
          `${route.verb} ${route.path} hands a URL id to storage.${call.fn}() without passing ` +
            `user.id and without an ownership check before it. The route may well scope some ` +
            `OTHER call -- that is not the same thing, and is the hole this test exists for. ` +
            `Either scope this call, gate it with one of the helpers in OWNERSHIP_CHECKS, or ` +
            `add "${key}" to RESOLVED_ANOTHER_WAY with the reason it is safe.`,
        ).toBe(true);
      }
    });
  }

  it("keeps the exception list honest", () => {
    // An entry that no longer matches any route is an entry nobody will
    // re-read, and it quietly widens the allowlist for whatever path reuses
    // that name later.
    const live = new Set<string>();
    for (const route of routes) {
      for (const call of storageCalls(route.body)) {
        live.add(`${route.verb} ${route.path}::${call.fn}`);
      }
    }
    for (const key of RESOLVED_ANOTHER_WAY.keys()) {
      expect(live.has(key), `RESOLVED_ANOTHER_WAY entry "${key}" no longer matches any route`).toBe(
        true,
      );
    }
  });
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
