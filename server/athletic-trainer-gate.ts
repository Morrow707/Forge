/* THE ATHLETIC TRAINER GATE (2026-11-22). The rules are in shared/staff-kinds.ts.
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
import type { Express, NextFunction, Request, Response } from "express";
import { storage } from "./storage";
import { ATHLETIC_TRAINER_REFUSAL } from "@shared/staff-kinds";
import { athleticTrainerMayMake, isGatedWrite } from "./athletic-trainer-policy";

const FORBIDDEN = 403;

/** Mounted once in registerRoutes, right after setupAuth and before every route. */
export function mountAthleticTrainerGate(app: Express) {
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user as { id: number; role: string } | undefined;
      if (!user || user.role !== "coach" || !isGatedWrite(req.method, req.path)) return next();
      if (athleticTrainerMayMake(req.method, req.path)) return next();
      if (!(await storage.isAthleticTrainer(user.id))) return next();
      return res.status(FORBIDDEN).json({ message: ATHLETIC_TRAINER_REFUSAL, athleticTrainer: true });
    } catch (err) {
      return next(err);
    }
  });
}
