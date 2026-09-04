// Where the integration suite's throwaway database lives.
//
// Derived from DATABASE_URL rather than configured separately, so the suite
// points at whatever Postgres the surrounding environment already has: the
// service container in .github/workflows/ci.yml, or a local server started
// by hand. The database NAME is always overridden, never inherited -- these
// tests truncate every table between cases, and inheriting the name would
// make a mistyped env var wipe a real database.
//
// TEST_DATABASE_URL overrides the whole thing for anyone who wants the
// suite pointed somewhere specific.
const DEFAULT_BASE = "postgresql://postgres:postgres@localhost:5432/postgres";

export function integrationDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const url = new URL(process.env.DATABASE_URL || DEFAULT_BASE);
  url.pathname = "/forge_integration_test";
  return url.toString();
}

// The same server, but connected to the default `postgres` database, so the
// suite can CREATE DATABASE the one above -- you cannot create a database
// from inside the database you are creating.
export function adminDatabaseUrl(): string {
  const url = new URL(integrationDatabaseUrl());
  url.pathname = "/postgres";
  return url.toString();
}

export const INTEGRATION_DATABASE_NAME = new URL(integrationDatabaseUrl()).pathname.slice(1);
