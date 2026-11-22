/* THE ATHLETIC TRAINER'S OWN ROUTES (2026-11-22). Rules in shared/staff-kinds.ts; the write gate
 * that keeps a trainer out of programs, billing, branding and staff is server/athletic-trainer-gate.ts.
 *
 *   GET   /api/coach/roster/:athleteId/clearances   every assignment of one athlete in scope, with its
 *                                                  return-to-training clearance and restrictions.
 *   PATCH /api/coach/clearances/:assignmentId       set or clear that clearance and its restrictions.
 *   PATCH /api/coach/staff/:staffCoachId/kind       the head coach marks a staff member a coach or an
 *                                                  athletic trainer.
 *
 * The clearance routes are open to every coach on the staff, a trainer included: before this, the
 * clearance could only be ticked while ASSIGNING a program, which a trainer may not do, so the one
 * clinical sentence on an assignment had no way to be set by the clinician. Scope is
 * storage.getAssignmentForCoach, which checks the staff AND the athlete's current roster seat and
 * team narrowing, exactly as every other per-assignment coach route does. */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { requireRole } from "./auth";
import { storage } from "./storage";
import { assignmentSeasonSetups, assignments, programs } from "@shared/schema";
import { MAX_RESTRICTIONS_LENGTH } from "@shared/season-plan";
import { STAFF_KINDS } from "@shared/staff-kinds";

const BAD_REQUEST = 400;
const NOT_FOUND = 404;
const HTTP = { badRequest: BAD_REQUEST, notFound: NOT_FOUND } as const;

type Me = { id: number; role: "coach" | "athlete" | "admin" | "guardian" };
const currentUser = (req: Request) => req.user as Me;

const idParam = (raw: unknown): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

function refuse(res: Response, status: number, message: string) {
  res.status(status).json({ message });
}

export const clearanceUpdateSchema = z.object({
  confirmed: z.boolean(),
  restrictions: z.string().max(MAX_RESTRICTIONS_LENGTH).optional().nullable(),
});

const staffKindSchema = z.object({ staffKind: z.enum(STAFF_KINDS) });

export function registerAthleticTrainerRoutes(app: Express) {
  app.get("/api/coach/roster/:athleteId/clearances", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const athleteId = idParam(req.params.athleteId);
    if (athleteId === null) return refuse(res, HTTP.badRequest, "Bad athlete id");
    if (!(await storage.athleteIsInCoachScope(user.id, athleteId))) return refuse(res, HTTP.notFound, "Athlete not found");
    const coachIds = await storage.getEffectiveCoachIds(user.id);
    const rows = await db
      .select({
        assignmentId: assignments.id,
        programName: programs.name,
        startDate: assignments.startDate,
        confirmedById: assignmentSeasonSetups.clearanceConfirmedById,
        confirmedAt: assignmentSeasonSetups.clearanceConfirmedAt,
        restrictions: assignmentSeasonSetups.clearanceRestrictions,
      })
      .from(assignments)
      .innerJoin(programs, eq(programs.id, assignments.programId))
      .leftJoin(assignmentSeasonSetups, eq(assignmentSeasonSetups.assignmentId, assignments.id))
      .where(and(eq(assignments.athleteId, athleteId), inArray(assignments.coachId, coachIds)))
      .orderBy(desc(assignments.startDate));
    res.json({
      clearances: rows.map((r) => ({
        assignmentId: r.assignmentId,
        programName: r.programName,
        startDate: r.startDate,
        confirmed: r.confirmedAt !== null && r.confirmedAt !== undefined,
        confirmedAt: r.confirmedAt ?? null,
        restrictions: r.restrictions ?? null,
      })),
    });
  });

  app.patch("/api/coach/clearances/:assignmentId", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const assignmentId = idParam(req.params.assignmentId);
    if (assignmentId === null) return refuse(res, HTTP.badRequest, "Bad assignment id");
    const parsed = clearanceUpdateSchema.safeParse(req.body);
    if (!parsed.success) return refuse(res, HTTP.badRequest, parsed.error.issues[0]?.message ?? "Bad request");
    const assignment = await storage.getAssignmentForCoach(user.id, assignmentId);
    if (!assignment) return refuse(res, HTTP.notFound, "Assignment not found");

    const now = new Date();
    const restrictions = parsed.data.restrictions?.trim() || null;
    const clearance = parsed.data.confirmed
      ? { clearanceConfirmedById: user.id, clearanceConfirmedAt: now, clearanceRestrictions: restrictions }
      : { clearanceConfirmedById: null, clearanceConfirmedAt: null, clearanceRestrictions: null };
    const [row] = await db
      .insert(assignmentSeasonSetups)
      .values({ assignmentId, ...clearance })
      .onConflictDoUpdate({ target: assignmentSeasonSetups.assignmentId, set: clearance })
      .returning();
    res.json({
      assignmentId,
      confirmed: row.clearanceConfirmedAt !== null,
      confirmedAt: row.clearanceConfirmedAt,
      restrictions: row.clearanceRestrictions,
    });
  });

  // Primary coach only, by the WHERE clause in storage.setStaffKind: anybody who is not this staff
  // member's primary updates nothing and gets the same 404 the title and permissions routes give.
  app.patch("/api/coach/staff/:staffCoachId/kind", requireRole("coach"), async (req, res) => {
    const user = currentUser(req);
    const staffCoachId = idParam(req.params.staffCoachId);
    if (staffCoachId === null) return refuse(res, HTTP.badRequest, "Bad staff id");
    const parsed = staffKindSchema.safeParse(req.body);
    if (!parsed.success) return refuse(res, HTTP.badRequest, "Pick coach or athletic trainer.");
    const row = await storage.setStaffKind(user.id, staffCoachId, parsed.data.staffKind);
    if (!row) return refuse(res, HTTP.notFound, "Not one of your staff members");
    res.json({ staffKind: row.staffKind });
  });
}
