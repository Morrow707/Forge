import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

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
export const pool = new Pool({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 10_000,
  ssl: shouldEnforceSsl ? { rejectUnauthorized: false } : undefined,
});
// pg emits 'error' on an idle client that drops (e.g. the DB restarting) --
// with no listener, Node treats that as an uncaught exception and kills the
// whole process. Logging it here keeps one bad idle connection from taking
// down the server.
pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client:", err);
});
export const db = drizzle(pool, { schema });
