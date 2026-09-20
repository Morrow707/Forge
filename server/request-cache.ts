import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler } from "express";

/** A memo that lives exactly as long as one HTTP request.
 *
 * WHY. Every request already loads the signed-in user once to authenticate it, and then the
 * route loads the same row again -- the guardian gate re-reads the athlete it was just handed,
 * a coach route asks for the staff membership five times through five helpers that each call
 * getEffectiveCoachIds. Measured on the seeded database: /api/notifications was four queries
 * for one, /api/coach/entitlements seventeen, ten of them the same two coach_staff lookups.
 * A cache on the process would answer a later request with a stale row after an update; a
 * cache on the request cannot, because it is gone when the response is.
 *
 * WHAT INVALIDATES IT. Any write. db.ts reports every statement that is not a SELECT through
 * `invalidateRequestMemo`, so a route that updates the user and reads it back sees the update.
 * That covers drizzle (its logger sees every statement, transactions included) and the raw
 * pool (`pool.query` is wrapped there). It is deliberately blunt: the memo holds a handful of
 * rows per request, and re-reading them after a write costs less than reasoning about which
 * table each write touched.
 *
 * WHERE IT IS ABSENT. Outside a request -- a background job, a test calling storage directly,
 * the seed -- `requestMemo` finds no store and runs the loader every time, exactly as before.
 * The middleware only enters the scope for /api requests; static files never read a row.
 *
 * WHY THE POOL CALLBACK BINDING IN db.ts IS PART OF THIS. AsyncLocalStorage follows promises,
 * not the callbacks pg fires off a socket that was opened long before the request. The
 * session store reads the session with a callback, passport deserialises the user inside it,
 * and everything after that -- every route -- runs on that chain. Without re-binding that
 * callback to the caller's context the scope entered here would be lost before the first
 * route ran. `server/request-cache.test.ts` proves the scope survives a real pool callback.
 */
type MemoStore = Map<string, Promise<unknown>>;

const scope = new AsyncLocalStorage<MemoStore>();

export const requestMemoScope: RequestHandler = (req, _res, next) => {
  if (!req.path.startsWith("/api")) return next();
  scope.run(new Map(), () => next());
};

/** Runs `load` once per request for a given key and hands every later caller the same
 * result. A rejected load is forgotten so the next caller retries rather than inheriting
 * the failure. Callers get the loader's own value: give them a copy if they might mutate it. */
export function requestMemo<T>(key: string, load: () => Promise<T>): Promise<T> {
  const store = scope.getStore();
  if (!store) return load();
  const hit = store.get(key);
  if (hit) return hit as Promise<T>;
  const pending = load().catch((err) => {
    store.delete(key);
    throw err;
  });
  store.set(key, pending);
  return pending;
}

export function invalidateRequestMemo(): void {
  scope.getStore()?.clear();
}

/** True while inside a request scope; only tests need to ask. */
export function inRequestMemoScope(): boolean {
  return scope.getStore() !== undefined;
}

/** For tests: run `fn` inside a fresh scope without an HTTP request. */
export function withRequestMemoScope<T>(fn: () => Promise<T>): Promise<T> {
  return scope.run(new Map(), fn);
}

/** Every statement that can change a row starts with one of these. Anything else (SELECT,
 * WITH ... SELECT, SHOW, EXPLAIN, BEGIN/COMMIT) leaves the memo alone. A CTE that writes
 * (`WITH x AS (INSERT ...)`) is caught by the second test. */
const WRITE_START = /^\s*(insert|update|delete|truncate|alter|drop|create|merge|refresh|call|do)\b/i;
const WRITE_IN_CTE = /^\s*with\b[\s\S]*\b(insert|update|delete|merge)\b/i;

export function statementMayWrite(sqlText: string): boolean {
  return WRITE_START.test(sqlText) || WRITE_IN_CTE.test(sqlText);
}
