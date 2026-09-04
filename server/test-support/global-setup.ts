import { execFileSync } from "node:child_process";
import { Client } from "pg";
import {
  adminDatabaseUrl,
  integrationDatabaseUrl,
  INTEGRATION_DATABASE_NAME,
} from "./database-url";

// Provisions the integration suite's database once per run: drops whatever
// was left behind, creates it fresh, and builds the schema by running the
// REAL migration -- `npm run db:reconcile`, the same script Render's build
// runs -- rather than a test-only DDL fixture.
//
// Running the real one matters here more than it usually would. The whole
// reason this schema is hand-maintained (see reconcile-schema.ts's own file
// comment) is that drizzle-kit push proved unreliable against it, and the
// audit that prompted these tests found the migration can add tables and
// columns but never repair a constraint on a table that already exists. A
// fixture that built the schema some other way would test a shape
// production never has.
//
// Dropping first, rather than reusing, is what makes a failed run
// debuggable: the database is left in place afterwards so it can be
// inspected, and the next run starts clean regardless of what state that
// left it in.
export async function setup() {
  const admin = new Client({ connectionString: adminDatabaseUrl() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${INTEGRATION_DATABASE_NAME}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${INTEGRATION_DATABASE_NAME}"`);
  } finally {
    await admin.end();
  }

  execFileSync("npx", ["tsx", "server/reconcile-schema.ts"], {
    env: { ...process.env, DATABASE_URL: integrationDatabaseUrl() },
    stdio: "inherit",
  });
}
