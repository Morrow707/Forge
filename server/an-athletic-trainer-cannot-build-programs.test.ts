/* THE ATHLETIC TRAINER GATE, HELD AGAINST EVERY WRITE ROUTE THAT EXISTS (2026-11-22).
 *
 * server/athletic-trainer-gate.ts refuses a trainer every write under a gated prefix unless it is on
 * ATHLETIC_TRAINER_MAY_WRITE. This file DISCOVERS the write routes from the server source rather
 * than listing them, and drives the real decision function against each one, so:
 *   - a coach write route added next year is refused to a trainer the day it exists (fail closed);
 *   - an allowed entry that names no real route fails (a stale permission is a hole waiting for a
 *     route to be written under it);
 *   - the program, assignment, billing, branding and staff families can never be allowed, whatever
 *     is added to the list. That is the rule stated as what is FORBIDDEN.
 * It also pins that the gate is mounted before every route registration, since a route registered
 * ahead of the gate would never meet it. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ATHLETIC_TRAINER_GATED_PREFIXES,
  ATHLETIC_TRAINER_MAY_WRITE,
  athleticTrainerMayMake,
  pathMatchesPattern,
} from "./athletic-trainer-policy";

const SERVER_DIR = __dirname;
const WRITE_VERBS = ["post", "put", "patch", "delete"] as const;
const MIN_REASON_LENGTH = 40;
/** Floors on what discovery finds, so a scan that silently finds nothing cannot pass. */
const MIN_GATED_ROUTES = 100;
const MIN_FORBIDDEN_ROUTES = 40;

type Route = { method: string; path: string; file: string };

/** Every `app.<verb>("path"` in the server's own (non-test) files, the path read as the first
 *  string literal after the opening paren, across line breaks. No regex: string scanning only. */
function discoverWriteRoutes(): Route[] {
  const files = fs
    .readdirSync(SERVER_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".itest.ts"));
  return files.flatMap((file) => {
    const src = fs.readFileSync(path.join(SERVER_DIR, file), "utf8");
    return WRITE_VERBS.flatMap((verb) =>
      src
        .split(`app.${verb}(`)
        .slice(1)
        .map((chunk) => chunk.trimStart())
        .filter((chunk) => chunk.startsWith('"'))
        .map((chunk) => ({ method: verb.toUpperCase(), path: chunk.slice(1, chunk.indexOf('"', 1)), file })),
    );
  });
}

/** A concrete path for a pattern: every ":param" becomes "1". */
const concrete = (pattern: string) =>
  pattern
    .split("/")
    .map((seg) => (seg.startsWith(":") ? "1" : seg))
    .join("/");

const gated = (p: string) => ATHLETIC_TRAINER_GATED_PREFIXES.some((pre) => p === pre || p.startsWith(pre));

/** Families a trainer may never write, whatever ATHLETIC_TRAINER_MAY_WRITE says. The one exception
 *  is leaving the staff, which is the trainer's own departure and not managing anybody. */
const FORBIDDEN_FAMILIES = [
  "/api/coach/programs",
  "/api/coach/program-days",
  "/api/coach/assignments",
  "/api/coach/season-assignments",
  "/api/coach/skill-programs",
  "/api/coach/skill-assignments",
  "/api/coach/classes",
  "/api/coach/my/assignments",
  "/api/my/season-assignments",
  "/api/billing/",
  "/api/coach/plan",
  "/api/coach/redeem-code",
  "/api/coach/branding",
  "/api/coach/exercise-page-theme",
  "/api/coach/features",
  "/api/coach/nav-prefs",
  "/api/coach/teams",
  "/api/coach/staff",
];
const STAFF_LEAVE = "/api/coach/staff/leave";
const inForbiddenFamily = (p: string) =>
  p !== STAFF_LEAVE && FORBIDDEN_FAMILIES.some((fam) => p === fam || p.startsWith(fam.endsWith("/") ? fam : `${fam}/`));

const routes = discoverWriteRoutes();
const gatedRoutes = routes.filter((r) => gated(r.path));

describe("the athletic trainer gate", () => {
  it("discovers the coach write routes it is meant to cover", () => {
    expect(gatedRoutes.length).toBeGreaterThan(MIN_GATED_ROUTES);
    expect(gatedRoutes.some((r) => r.method === "POST" && r.path === "/api/coach/programs")).toBe(true);
    expect(gatedRoutes.some((r) => r.method === "PATCH" && r.path === "/api/coach/clearances/:assignmentId")).toBe(true);
  });

  it("refuses every discovered gated write that is not on the allowed list, and allows every one that is", () => {
    const wrong = gatedRoutes.filter((r) => {
      const allowed = ATHLETIC_TRAINER_MAY_WRITE.some((a) => a.method === r.method && a.path === r.path);
      return athleticTrainerMayMake(r.method, concrete(r.path)) !== allowed;
    });
    expect(wrong).toEqual([]);
  });

  it("refuses every route in the program, assignment, billing, branding and staff families", () => {
    const leaked = gatedRoutes.filter((r) => inForbiddenFamily(r.path) && athleticTrainerMayMake(r.method, concrete(r.path)));
    expect(leaked).toEqual([]);
    expect(gatedRoutes.filter((r) => inForbiddenFamily(r.path)).length).toBeGreaterThan(MIN_FORBIDDEN_ROUTES);
  });

  it("allows nothing in a forbidden family, and every allowed entry names a real route with a reason", () => {
    ATHLETIC_TRAINER_MAY_WRITE.forEach((a) => {
      expect(inForbiddenFamily(a.path), a.path).toBe(false);
      expect(a.reason.length, a.path).toBeGreaterThanOrEqual(MIN_REASON_LENGTH);
      expect(routes.some((r) => r.method === a.method && r.path === a.path), `${a.method} ${a.path}`).toBe(true);
    });
  });

  it("cannot be walked round by case, a trailing slash or a read", () => {
    expect(athleticTrainerMayMake("POST", "/API/Coach/Programs")).toBe(false);
    expect(athleticTrainerMayMake("put", "/api/coach/programs/7/")).toBe(false);
    expect(athleticTrainerMayMake("GET", "/api/coach/programs")).toBe(true);
    expect(athleticTrainerMayMake("PATCH", "/api/coach/roster/7/health-status")).toBe(true);
    expect(athleticTrainerMayMake("PATCH", "/api/coach/roster/7/8/health-status")).toBe(false);
  });

  it("leaves writes outside the gated prefixes to their own guards", () => {
    expect(athleticTrainerMayMake("POST", "/api/waivers/12")).toBe(true);
    expect(athleticTrainerMayMake("POST", "/api/messages/3/remove")).toBe(true);
    expect(athleticTrainerMayMake("POST", "/api/auth/logout")).toBe(true);
  });

  it("matches a pattern segment by segment", () => {
    expect(pathMatchesPattern("/api/coach/clearances/9", "/api/coach/clearances/:assignmentId")).toBe(true);
    expect(pathMatchesPattern("/api/coach/clearances", "/api/coach/clearances/:assignmentId")).toBe(false);
  });

  it("is mounted in registerRoutes before every route registration", () => {
    const src = fs.readFileSync(path.join(SERVER_DIR, "routes.ts"), "utf8");
    const body = src.slice(src.indexOf("export async function registerRoutes("));
    const codeLines = body.split("\n").filter((line) => !line.trim().startsWith("//"));
    const gateLine = codeLines.findIndex((line) => line.trim() === "mountAthleticTrainerGate(app);");
    expect(gateLine).toBeGreaterThan(-1);
    const firstRegistration = codeLines.findIndex(
      (line) => line.trim().startsWith("register") && line.includes("Routes(app"),
    );
    const firstRoute = codeLines.findIndex((line) => WRITE_VERBS.some((v) => line.trim().startsWith(`app.${v}(`)));
    expect(gateLine).toBeLessThan(firstRegistration);
    expect(gateLine).toBeLessThan(firstRoute);
  });
});
