import type { Express, Request, Response, NextFunction } from "express";

/**
 * Route params that are always a database id, and the one guard for all of them.
 *
 * Every handler that reads one of these does `Number(req.params.x)`; not one
 * reads any of them as a string. So a non-numeric value was never going to
 * produce an answer -- it went into a query as NaN, Postgres rejected it, and
 * the request came back a 500. A sweep of the GET routes carrying these names
 * found 127 such 500s.
 *
 * Registered once per name via app.param rather than guarded at each of the
 * ~250 call sites. Express resolves param callbacks at dispatch, so this
 * covers routes registered before it as well as after, and a route added
 * tomorrow is covered without anyone remembering to add anything.
 *
 * 404 rather than 400, deliberately. A param callback runs BEFORE the route's
 * own middleware, auth guards included, so a 400 would answer "that id is
 * malformed" to a caller who has not been authenticated yet. 404 says only
 * what a missing row would have said anyway.
 *
 * Ids are serial and start at 1, so 0 and negatives are as impossible as
 * "abc". The two names here that are ORDINALS rather than serial ids --
 * :setNumber and :pageNumber -- are 1-based on both sides too (the set schema
 * is min(1).max(50); the only caller of the page route counts from page one),
 * so the same floor holds for them.
 *
 * Names NOT here are the string params -- :type, :code, :token, :movement,
 * :movementType, :joint, and the trap, :addOnId, which ends in "Id" and is
 * "golf_swing" | "hitting" | "pitching". Adding any of those would break every
 * route that carries them.
 */
export const NUMERIC_ROUTE_PARAMS = [
  "id",
  "athleteId",
  "assignmentId",
  "programDayId",
  "skillProgramDayId",
  "skillProgramExerciseId",
  "skillAssignmentId",
  "lessonId",
  "exerciseId",
  "staffCoachId",
  "requestId",
  "passageId",
  "readingId",
  "goalId",
  "gameDayId",
  "setNumber",
  "pageNumber",
] as const;

/** Whitespace, "", "1.5", "1e3", "0x1", "abc", "0", "-1" and Number's other
 * permissive readings all fail here -- only a plain positive integer passes. */
export function isValidNumericRouteParam(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1;
}

export function registerNumericParamGuards(app: Express): void {
  for (const name of NUMERIC_ROUTE_PARAMS) {
    app.param(name, (req: Request, res: Response, next: NextFunction, value: string) => {
      if (!isValidNumericRouteParam(String(value))) {
        return res.status(404).json({ message: "Not found" });
      }
      next();
    });
  }
}
