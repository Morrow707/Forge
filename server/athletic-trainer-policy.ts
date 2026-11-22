/* THE ATHLETIC TRAINER POLICY (2026-11-22), the pure half of server/athletic-trainer-gate.ts:
 * which writes an athletic trainer may make, decided from the method and path alone, with no
 * database, so the ratchet test can drive it without Postgres.
 *
 * THE ATHLETIC TRAINER GATE. The rules are in shared/staff-kinds.ts.
 *
 * An athletic trainer is a coach account on a program's staff (coach_staff.staff_kind =
 * "athletic_trainer"). Every coach route's `requireRole("coach")` lets them in, which is right for
 * reading: the roster, the athlete pages and the documents are what a trainer works from. Writes
 * are a different question, and this file answers it ONCE, for every route, rather than at each
 * handler:
 *
 *   FAIL CLOSED. Any write (POST, PUT, PATCH, DELETE) under a gated prefix is refused for a trainer
 *   unless it is on `ATHLETIC_TRAINER_MAY_WRITE`, each entry with its reason. A coach route written
 *   next year is refused to a trainer the day it exists, until somebody decides otherwise on
 *   purpose. That is the direction this repo keeps having to relearn: a list of what is forbidden
 *   rots toward the bug, a list of what is allowed rots toward a refusal somebody notices.
 *

 * `server/an-athletic-trainer-cannot-build-programs.test.ts` discovers every write route under the
 * gated prefixes from the source and drives this decision against each one, and holds the allowed
 * list to real routes and away from the program, assignment, billing, branding and staff families.
 *
 * Nothing about a non-trainer changes: the gate asks `isAthleticTrainer` only for a coach making a
 * write under a gated prefix, and answers `next()` for everybody else. */
/** Path prefixes whose writes a trainer is refused unless allowed below. `/api/coach/` is every
 *  coach write; the others are the writes that build or sell outside that prefix. */
export const ATHLETIC_TRAINER_GATED_PREFIXES = [
  "/api/coach/",
  "/api/billing/",
  "/api/classes/",
  "/api/my/season-assignments",
] as const;

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type AllowedWrite = { method: "POST" | "PUT" | "PATCH" | "DELETE"; path: string; reason: string };

/** The writes a trainer MAY make under a gated prefix. Each is a route as registered (":param"
 *  segments), and each carries why a trainer needs it. */
export const ATHLETIC_TRAINER_MAY_WRITE: readonly AllowedWrite[] = [
  {
    method: "PATCH",
    path: "/api/coach/roster/:athleteId/health-status",
    reason: "Marking an athlete hurt or healthy is the trainer's own call, and coaches read it on the roster.",
  },
  {
    method: "PATCH",
    path: "/api/coach/clearances/:assignmentId",
    reason: "The return-to-training clearance and restrictions on an assignment are the clinician's to set; coaches see them under every exercise.",
  },
  {
    method: "POST",
    path: "/api/coach/roster/:athleteId/injury-history",
    reason: "Recording an injury on an athlete's history is the trainer's work and changes no program.",
  },
  {
    method: "DELETE",
    path: "/api/coach/roster/:athleteId/injury-history/:id",
    reason: "A trainer corrects an injury entry they or a coach recorded; it changes no program.",
  },
  {
    method: "POST",
    path: "/api/coach/roster/injury-intake/analyze-photo",
    reason: "Reading a photographed injury report into a draft is the start of the trainer's own injury intake.",
  },
  {
    method: "POST",
    path: "/api/coach/roster/injury-intake/apply",
    reason: "Applying a reviewed injury intake writes injury history only, which is the trainer's work.",
  },
  {
    method: "POST",
    path: "/api/coach/roster/:athleteId/goniometer",
    reason: "A range of motion reading is a clinical measurement a trainer takes on an athlete in scope.",
  },
  {
    method: "PUT",
    path: "/api/coach/roster/:athleteId/goniometer/baseline/:joint/:movement",
    reason: "Setting a joint's baseline range of motion is part of the same clinical measurement.",
  },
  {
    method: "DELETE",
    path: "/api/coach/roster/:athleteId/goniometer/:readingId",
    reason: "A trainer removes a range of motion reading taken in error; it changes no program.",
  },
  {
    method: "DELETE",
    path: "/api/coach/roster/:athleteId/goniometer/baseline/:joint/:movement",
    reason: "A trainer clears a baseline set in error; it is the same clinical record as the reading.",
  },
  {
    method: "POST",
    path: "/api/coach/documents-status/request",
    reason: "Asking an athlete or their guardian for a missing medical clearance is the trainer's paperwork.",
  },
  {
    method: "POST",
    path: "/api/coach/messages/:athleteId",
    reason: "Messaging an athlete in scope; the coaching-relationship guard in coach-messages.ts still decides each send.",
  },
  {
    method: "POST",
    path: "/api/coach/staff/leave",
    reason: "Leaving the staff is the trainer's own departure, not managing anybody else on it.",
  },
  {
    method: "PATCH",
    path: "/api/coach/widget-prefs",
    reason: "The trainer's own dashboard layout, stored on their own account and read by nobody else.",
  },
  {
    method: "PATCH",
    path: "/api/coach/personal-theme",
    reason: "The trainer's own accent color and touch, which is personal and not the program's branding.",
  },
  {
    method: "PATCH",
    path: "/api/coach/philosophy",
    reason: "The trainer's own short line under their name on the About page, which every staff member writes.",
  },
  {
    method: "PATCH",
    path: "/api/coach/my/preferences",
    reason: "The trainer's own account preferences, which describe nobody else and assign nothing.",
  },
  {
    method: "POST",
    path: "/api/coach/team-board/read",
    reason: "Marking the team board read is the trainer's own read receipt and posts nothing.",
  },
];

const segmentsOf = (path: string) => path.split("/").filter((seg) => seg.length > 0);

/** Does a real path match an Express route pattern? A ":param" segment matches any one non-empty
 *  segment; every other segment must be equal. "/api/coach/roster/:athleteId/health-status"
 *  matches "/api/coach/roster/12/health-status" and not "/api/coach/roster/12/13/health-status". */
export function pathMatchesPattern(path: string, pattern: string): boolean {
  const real = segmentsOf(path);
  const want = segmentsOf(pattern);
  if (real.length !== want.length) return false;
  return want.every((seg, i) => (seg.startsWith(":") ? real[i].length > 0 : seg === real[i]));
}

/** Whether a request falls under the gate at all: a write under a gated prefix. */
// Lower-cased because Express routes case-INsensitively by default: "/API/Coach/programs" reaches
// the same handler as "/api/coach/programs", so a case-sensitive prefix test would be a way round.
export function isGatedWrite(method: string, rawPath: string): boolean {
  if (!WRITE_METHODS.has(method.toUpperCase())) return false;
  const path = rawPath.toLowerCase();
  return ATHLETIC_TRAINER_GATED_PREFIXES.some((p) => path === p || path.startsWith(p));
}

/** THE DECISION, pure: may an athletic trainer make this request? Reads only the method and path. */
export function athleticTrainerMayMake(method: string, rawPath: string): boolean {
  if (!isGatedWrite(method, rawPath)) return true;
  const path = rawPath.toLowerCase();
  const m = method.toUpperCase();
  return ATHLETIC_TRAINER_MAY_WRITE.some((a) => a.method === m && pathMatchesPattern(path, a.path));
}

