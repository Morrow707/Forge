import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler } from "express";

// A DAILY CEILING ON MODEL CALLS PER ACCOUNT, AT THE ONE POINT EVERY CALL PASSES THROUGH.
//
// Hardy counts its own fifty questions a day. Nothing else counted anything: a coach, or a Free
// Agent on an AI plan, could send the program builder, the photo readers or a chat as many
// requests as the general request limiter allows, which is 600 every fifteen minutes and was
// never meant as a spending rule. One account left running, or one script, was an open bill.
//
// WHERE IT SITS. `callAnthropic` asks `takeAiCall()` before it sends anything, so a feature
// added next year is covered the day it is written -- the same argument that put the usage
// record there. A list of "the AI routes" would be a list somebody falls off.
//
// WHAT IT DOES AT THE CEILING. The call is not sent and comes back empty, which every caller
// already handles as "nothing to show". It never throws: several model calls are started and
// not awaited (passage tagging, conflict checks), and a throw there is an unhandled rejection
// in the server process. So that the person is told the truth rather than "try again in a
// bit", the middleware below rewrites a failed answer on that request into a 429 that names
// the limit and when it lifts.
//
// WHO IS COUNTED. A signed-in account making a request. Work outside a request -- the nightly
// jobs, the seed, the book transcription -- has no account and is not counted. An admin is not
// counted either: the teaching chats and the library tools are the operator's own.
//
// The count is in this process's memory. A deploy starts it again at zero, and each instance
// keeps its own; it is a ceiling against a runaway, not a meter.
export const AI_CALLS_PER_ACCOUNT_PER_DAY = 200;
export const AI_DAILY_LIMIT_STATUS = 429;
export const AI_DAILY_LIMIT_MESSAGE =
  "You've reached today's limit for AI requests. It resets at midnight UTC, and everything else in Forge still works.";

type Actor = { id: number; role: string };
type RequestState = { actor: () => Actor | null; refused: boolean };

const scope = new AsyncLocalStorage<RequestState>();
const counts = new Map<number, { day: string; calls: number }>();

function utcDay(now: Date): string {
  return now.toISOString().slice(0, "YYYY-MM-DD".length);
}

/** May this model call be sent? Counts it when the answer is yes. */
export function takeAiCall(now: Date = new Date()): boolean {
  const state = scope.getStore();
  const actor = state?.actor() ?? null;
  if (!state || !actor || actor.role === "admin") return true;
  const day = utcDay(now);
  const held = counts.get(actor.id);
  const calls = held && held.day === day ? held.calls : 0;
  if (calls >= AI_CALLS_PER_ACCOUNT_PER_DAY) {
    state.refused = true;
    return false;
  }
  counts.set(actor.id, { day, calls: calls + 1 });
  return true;
}

/** Runs `fn` as a request by this account would. For tests and for nothing else. */
export function asAiActor<T>(actor: Actor | null, fn: () => T): T {
  return scope.run({ actor: () => actor, refused: false }, fn);
}

/** Test support: every account back to zero. */
export function resetAiDailyCounts(): void {
  counts.clear();
}

const FIRST_FAILURE_STATUS = 400;

/**
 * Mounted after sign-in is resolved and before every route. It gives the calls made while
 * handling this request an account to be counted against, and turns a failure caused by the
 * ceiling into a 429 that says so. An answer that succeeded anyway (a page that simply draws
 * nothing without its AI note) is left exactly as the route sent it.
 */
export const aiDailyLimitScope: RequestHandler = (req, res, next) => {
  const state: RequestState = {
    actor: () => {
      const user = (req as { user?: { id?: number; role?: string } }).user;
      return user?.id && user.role ? { id: user.id, role: user.role } : null;
    },
    refused: false,
  };
  const send = res.json.bind(res);
  res.json = ((body?: unknown) => {
    if (state.refused && res.statusCode >= FIRST_FAILURE_STATUS) {
      res.status(AI_DAILY_LIMIT_STATUS);
      return send({ message: AI_DAILY_LIMIT_MESSAGE, aiDailyLimit: true });
    }
    return send(body);
  }) as typeof res.json;
  scope.run(state, () => next());
};
