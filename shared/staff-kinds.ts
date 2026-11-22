/* WHAT KIND OF STAFF MEMBER SOMEBODY IS (2026-11-22).
 *
 * Many schools have an athletic trainer. Scott approved adding one as a TYPE OF STAFF MEMBER, not
 * as a fifth role: the trainer joins the program the way an assistant coach does (the head coach's
 * staff invite code), so the account is a `coach` on that program's staff, scoped exactly as an
 * assistant is (the roster, and per-team narrowing through team_coaches). What makes them a
 * trainer is `coach_staff.staff_kind`.
 *
 * What a trainer may do: read the roster and athlete profiles, set an athlete's health status and
 * an assignment's return-to-training clearance and restrictions, read and file medical documents,
 * record injuries and range of motion, and message athletes.
 * What a trainer may not do: build, edit, assign or delete programs, skill programs or classes,
 * change the program's plan, billing or branding, or manage staff. The server refuses those writes
 * (server/athletic-trainer-gate.ts); the client only hides the buttons.
 *
 * The role pgEnum is deliberately untouched: CLAUDE.md, "THE FOUR ROLE PROFILES ARE NOT FOUR",
 * records 446 role gates, and a fifth role would be a fifth set of them. A staff kind reuses every
 * one of the coach's gates and narrows from there. */

export const STAFF_KINDS = ["coach", "athletic_trainer"] as const;
export type StaffKind = (typeof STAFF_KINDS)[number];

export const STAFF_KIND_LABELS: Record<StaffKind, string> = {
  coach: "Coach",
  athletic_trainer: "Athletic trainer",
};

export function isStaffKind(value: unknown): value is StaffKind {
  return typeof value === "string" && (STAFF_KINDS as readonly string[]).includes(value);
}

/** The coach nav tabs that lead only to writes a trainer is refused: the program library and its
 *  builders, the program's plan and branding, device connections, the weight-room station and the
 *  trainer's own training calendar. The client hides them; the server refuses the writes either way. */
export const ATHLETIC_TRAINER_HIDDEN_NAV_HREFS: readonly string[] = [
  "/coach/programs",
  "/coach/billing",
  "/coach/branding",
  "/coach/devices",
  "/coach/weight-room",
  "/coach/my",
];

/** What a trainer is told when the server refuses a write. One sentence, one place. */
export const ATHLETIC_TRAINER_REFUSAL =
  "An athletic trainer can set health status and clearance, file medical documents and message athletes. Programs, assignments, the plan, branding and staff belong to the coaches.";
