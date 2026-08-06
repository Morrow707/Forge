import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Did you forget to provision a database?");
}

// Without a timeout, a bad/unreachable DATABASE_URL (wrong host, missing SSL,
// not attached to the deploy environment) hangs forever waiting to connect
// instead of failing -- on a platform that boots the server before any
// request comes in, that looks like the process never starting at all.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10_000,
});
// pg emits 'error' on an idle client that drops (e.g. the DB restarting) --
// with no listener, Node treats that as an uncaught exception and kills the
// whole process. Logging it here keeps one bad idle connection from taking
// down the server.
pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client:", err);
});
export const db = drizzle(pool, { schema });
