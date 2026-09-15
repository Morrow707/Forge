import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resetDatabase, db } from "./test-support/fixtures";
import { coachAthletes } from "@shared/schema";
import {
  startTestServer,
  makeLoginableUser,
  loginAs,
  TestClient,
  type TestServer,
} from "./test-support/http-app";

/**
 * Every admin route, swept for an athlete's identity.
 *
 * The individual fixes are elsewhere; this is the one that has to keep being
 * true. Admin surfaces were de-identified one at a time and the gaps were
 * never in the surface anybody was thinking about -- they were in the route
 * beside it. The register of unguardianed minors carried name, email and
 * birthdate because the last person to look at it was fixing its response
 * SIZE. The record-access log paired a coach's real name with an athlete's
 * because naming both sides is obviously right for an accountability log and
 * nobody asked what the pair added up to. Neither would have been caught by
 * reviewing the route that was actually being changed.
 *
 * So this does not name routes. It discovers every admin GET in routes.ts,
 * calls it as a real admin over HTTP, and fails if an athlete's name, email
 * address, phone number or date of birth appears anywhere in the response.
 * A route added next year is covered the day it is written, which is the only
 * way a rule like this survives contact with a growing codebase.
 *
 * The fixture athlete's details are deliberately absurd strings. A real name
 * would risk a false pass by colliding with a word that legitimately appears
 * in a response, and worse, a false sense of one.
 */
const ATHLETE_NAME = "Zzyzx Quibblewort Pemberton-Vasquez";
const ATHLETE_EMAIL = "zzyzx-quibblewort-unique@identity-probe.test";
const ATHLETE_PHONE = "+1-555-0177-4291";
const ATHLETE_DOB = "2015-03-07";

const GUARDIAN_NAME = "Marisol Quibblewort-Pemberton";
const GUARDIAN_EMAIL = "marisol-quibblewort-unique@identity-probe.test";

/**
 * Routes skipped, each for a reason that is not "it failed".
 *
 * Nothing is here because it leaked and was inconvenient to fix. Two ask an
 * external model and would spend real money on every run; the rest mutate or
 * stream and are not GETs of athlete data.
 */
const SKIP = new Set<string>([
  // Parses plain English with a model call.
  "/api/admin/athletes/query/nlq",
]);

/** Fills a route's parameters with ids that exist, so the handler really runs. */
function fillParams(path: string, ids: { athleteId: number; coachId: number }): string | null {
  let filled = path;
  for (const match of path.matchAll(/:(\w+)/g)) {
    const name = match[1];
    let value: string;
    if (/athlete/i.test(name)) value = String(ids.athleteId);
    else if (/coach/i.test(name)) value = String(ids.coachId);
    else if (/^(id|userId)$/.test(name)) value = String(ids.athleteId);
    else if (/type/i.test(name)) value = "terms";
    else if (/^\d/.test(name)) value = "1";
    else value = "1";
    filled = filled.replace(`:${name}`, value);
  }
  // A route whose parameter is not an id at all (a token, a slug) is not
  // something this sweep can call meaningfully.
  return filled.includes(":") ? null : filled;
}

function adminGetRoutes(): string[] {
  const src = readFileSync(join(__dirname, "routes.ts"), "utf8");
  const lines = src.split("\n");
  const found = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const inline = lines[i].match(/^\s*app\.get\(\s*"(\/api\/admin\/[^"]+)"/);
    if (inline) {
      found.add(inline[1]);
      continue;
    }
    if (/^\s*app\.get\(\s*$/.test(lines[i])) {
      const next = lines[i + 1]?.match(/^\s*"(\/api\/admin\/[^"]+)"/);
      if (next) found.add(next[1]);
    }
  }
  return [...found].sort();
}

let server: TestServer;
let asAdmin: TestClient;
let athleteId: number;
let coachId: number;

beforeAll(async () => {
  await resetDatabase();
  server = await startTestServer();

  const admin = await makeLoginableUser({ role: "admin", name: "Sweep Admin" });
  const coach = await makeLoginableUser({ role: "coach", name: "Sweep Coach" });
  const athlete = await makeLoginableUser({
    role: "athlete",
    name: ATHLETE_NAME,
    email: ATHLETE_EMAIL,
    phone: ATHLETE_PHONE,
    dateOfBirth: ATHLETE_DOB,
    sport: "Football",
    position: "Linebacker",
    gender: "male",
    researchDataConsent: true,
  });
  await makeLoginableUser({
    role: "guardian",
    name: GUARDIAN_NAME,
    email: GUARDIAN_EMAIL,
  });

  coachId = coach.id;
  athleteId = athlete.id;
  // The athlete is on a roster, so any surface that would reveal the
  // coach-to-athlete relationship has a relationship to reveal.
  await db.insert(coachAthletes).values({ coachId: coach.id, athleteId: athlete.id });

  asAdmin = await loginAs(server.baseUrl, admin);
});

afterAll(async () => {
  await server?.close();
});

describe("no admin route hands back an athlete's identity", () => {
  it("finds the admin routes at all", () => {
    // Guards against the parser matching nothing and the whole file passing
    // without having asked a single question.
    expect(adminGetRoutes().length).toBeGreaterThan(40);
  });

  it("sweeps every admin GET and finds no name, email, phone or birthdate", async () => {
    const routes = adminGetRoutes().filter((r) => !SKIP.has(r));
    const called: string[] = [];
    const leaked: string[] = [];

    for (const route of routes) {
      const path = fillParams(route, { athleteId, coachId });
      if (!path) continue;

      const res = await asAdmin.get(path);
      called.push(`${path} -> ${res.status}`);

      // Error bodies are checked too. A 500 that echoes a failed query can
      // carry the row it choked on, and a stack trace is not an exemption.
      const body = typeof res.body === "string" ? res.body : JSON.stringify(res.body ?? "");
      for (const [label, needle] of [
        ["athlete name", ATHLETE_NAME],
        ["athlete email", ATHLETE_EMAIL],
        ["athlete phone", ATHLETE_PHONE],
        ["athlete date of birth", ATHLETE_DOB],
        ["guardian name", GUARDIAN_NAME],
        ["guardian email", GUARDIAN_EMAIL],
      ] as const) {
        if (body.includes(needle)) {
          leaked.push(`${path} (${res.status}) returned the ${label}`);
        }
      }
    }

    // A sweep that called almost nothing proves almost nothing, so the count
    // is asserted rather than assumed.
    expect(called.length, "the sweep reached almost no routes").toBeGreaterThan(30);
    expect(leaked, `admin routes leaked athlete identity:\n${leaked.join("\n")}`).toEqual([]);
  });
});

describe("the surfaces that used to leak, asked directly", () => {
  it("withholds identity from the account directory", async () => {
    const res = await asAdmin.get("/api/admin/users?role=athlete");
    expect(res.status).toBe(200);
    const [row] = res.body.users.filter((u: any) => u.id === athleteId);
    expect(row).toBeTruthy();
    expect(row.name).toBeUndefined();
    expect(row.email).toBeUndefined();
    expect(row.identityWithheld).toBe(true);
    // What the operator asked to keep.
    expect(row.sport).toBe("Football");
    expect(row.position).toBe("Linebacker");
    expect(row.gender).toBe("male");
    expect(typeof row.age).toBe("number");
  });

  it("cannot be used to search for a particular child by name", async () => {
    // The more dangerous half of the old directory. A list tells you who is
    // on the platform; a search box answers "is THIS child here" in one
    // request, which is the question an attacker actually has.
    for (const term of ["Zzyzx", "Quibblewort", "Pemberton", ATHLETE_EMAIL]) {
      const res = await asAdmin.get(`/api/admin/users?search=${encodeURIComponent(term)}`);
      expect(res.status).toBe(200);
      expect(
        res.body.users.some((u: any) => u.id === athleteId),
        `searching "${term}" found the athlete`,
      ).toBe(false);
    }
  });

  it("still finds a coach by name, because that is the job", async () => {
    // The restriction has to be a restriction, not a broken search box.
    const res = await asAdmin.get("/api/admin/users?search=Sweep%20Coach");
    expect(res.status).toBe(200);
    expect(res.body.users.some((u: any) => u.id === coachId)).toBe(true);
  });

  it("withholds the birthdate but keeps the band compliance needs", async () => {
    const res = await asAdmin.get(`/api/admin/users/${athleteId}`);
    expect(res.status).toBe(200);
    expect(res.body.dateOfBirth).toBeUndefined();
    expect(res.body.phone).toBeUndefined();
    expect(res.body.calendarToken).toBeUndefined();
    expect(res.body.privacyTier).toBe("tier1_under13");
  });

  it("does not hand an admin a coach's roster or their staff credential", async () => {
    // A coach is named on purpose. What must not come with the name is the
    // list of children they coach, or a code that fetches it.
    const res = await asAdmin.get(`/api/admin/users/${coachId}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Sweep Coach");
    expect(res.body.pinnedAthleteIds).toBeUndefined();
    expect(res.body.staffInviteCode).toBeUndefined();
    expect(res.body.calendarToken).toBeUndefined();
    expect(res.body.rosterGroups).toBeUndefined();
  });

  it("keeps the minors register operational without naming the minors", async () => {
    const res = await asAdmin.get("/api/admin/blocked-athletes");
    expect(res.status).toBe(200);
    const row = res.body.rows.find((r: any) => r.id === athleteId);
    expect(row, "the athlete should still appear -- they have no guardian link").toBeTruthy();
    expect(row.name).toBeUndefined();
    expect(row.email).toBeUndefined();
    expect(row.dateOfBirth).toBeUndefined();
    // The triage this page exists for still works.
    expect(row.privacyTier).toBe("tier1_under13");
    expect(row).toHaveProperty("inviteEmail");
    expect(row).toHaveProperty("inviteDelivered");
  });
});
