import { AsyncResource } from "node:async_hooks";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Logger } from "drizzle-orm/logger";
import * as schema from "@shared/schema";
import { invalidateRequestMemo, statementMayWrite } from "./request-cache";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set. Did you forget to provision a database?");
}

// Encrypts the DB connection in production rather than leaving it entirely
// up to whatever the connection string alone happens to specify.
// rejectUnauthorized: false (not full certificate-chain verification) is
// deliberate -- many managed Postgres providers, Render's own internal
// connection included, present a certificate that doesn't chain to a
// public CA Node trusts by default, and requiring full verification here
// risks turning an unverified cert into a hard startup failure on a
// platform that boots the server before any request arrives. This still
// encrypts the connection against passive eavesdropping, which is the
// actual gap being closed; it isn't a substitute for Render's own network
// guarantees. Skipped when the connection string already states its own
// sslmode/ssl= (never overriding an explicit choice already made), and
// skipped outside production -- a local dev Postgres almost never supports it.
const urlAlreadySpecifiesSsl = /[?&](sslmode|ssl)=/i.test(databaseUrl);
const shouldEnforceSsl = !urlAlreadySpecifiesSsl && process.env.NODE_ENV === "production";

// Without a timeout, a bad/unreachable DATABASE_URL (wrong host, missing SSL,
// not attached to the deploy environment) hangs forever waiting to connect
// instead of failing -- on a platform that boots the server before any
// request comes in, that looks like the process never starting at all.
//
// max: forge-db is on Render's basic-1gb plan, which caps Postgres at 100
// total connections (fewer than 8GB RAM instances all share that ceiling),
// with a handful reserved for Render's own direct/internal connections --
// see the launch audit's own finding on this. 20 is well above pg's default
// of 10 (this app's own concurrent-load testing found real
// connection-pool-exhaustion bugs at that default) while leaving generous
// headroom under the plan's real ceiling for the Render dashboard's SQL
// shell, one-off scripts, and future growth -- the goal is a burst
// degrading as request queuing, not maxing out the plan the moment this
// ships.
export const pool = new Pool({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 10_000,
  max: 20,
  ssl: shouldEnforceSsl ? { rejectUnauthorized: false } : undefined,
});
// pg emits 'error' on an idle client that drops (e.g. the DB restarting) --
// with no listener, Node treats that as an uncaught exception and kills the
// whole process. Logging it here keeps one bad idle connection from taking
// down the server.
pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client:", err);
});

// Every statement that leaves this process passes one of two doors: pool.query (the session
// store, raw SQL, and drizzle outside a transaction) or a checked-out client inside a drizzle
// transaction (which drizzle's logger still sees). Both doors do the same two things:
//
// 1. Tell the per-request memo (server/request-cache.ts) when a write happens, so a row it
//    is holding is re-read afterwards rather than served stale.
// 2. Report the statement to any observer registered with onDbQuery -- how a test counts the
//    queries a route issues without a database extension.
//
// pool.query additionally re-binds a callback-style call to the CALLER's async context. pg
// fires the callback from the socket's own context, which predates every request, and that is
// where AsyncLocalStorage would otherwise lose the request scope -- the session store is
// callback-style and everything after it runs inside that callback.
type QueryObserver = (sqlText: string) => void;
const observers = new Set<QueryObserver>();
export function onDbQuery(observer: QueryObserver): () => void {
  observers.add(observer);
  return () => observers.delete(observer);
}
function noteStatement(sqlText: string) {
  if (statementMayWrite(sqlText)) invalidateRequestMemo();
  for (const observer of observers) observer(sqlText);
}

const originalQuery = pool.query.bind(pool) as (...args: unknown[]) => unknown;
(pool as { query: unknown }).query = function query(...args: unknown[]) {
  const first = args[0];
  if (typeof first === "string") {
    noteStatement(first);
  } else {
    // A query-config object is how drizzle calls this door, and drizzle's logger has already
    // reported that statement to the observers; only the (idempotent) memo clear repeats.
    const text = (first as { text?: string } | undefined)?.text ?? "";
    if (statementMayWrite(text)) invalidateRequestMemo();
  }
  const last = args[args.length - 1];
  if (typeof last === "function") args[args.length - 1] = AsyncResource.bind(last as (...a: unknown[]) => void);
  return originalQuery(...args);
};

const memoInvalidationLogger: Logger = {
  logQuery(query: string) {
    // Statements that go through pool.query are reported there too; the memo clear is
    // idempotent and observers are told to expect it (see onDbQuery's test).
    noteStatement(query);
  },
};
export const db = drizzle(pool, { schema, logger: memoInvalidationLogger });
