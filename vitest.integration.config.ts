import { defineConfig } from "vitest/config";
import path from "path";
import { integrationDatabaseUrl } from "./server/test-support/database-url";

// The half of the suite that needs a real Postgres.
//
// vitest.config.ts covers everything testable without one -- pure functions,
// shared constant tables, Zod schemas, and modules whose storage import can
// be mocked away. That leaves server/storage.ts, 21,000 lines and almost
// entirely queries, which is both the largest untested surface in the repo
// and the subject of the database audit these tests came out of. Mocking
// Drizzle's query builder well enough to make an assertion mean anything
// would amount to reimplementing Postgres and then asserting against the
// reimplementation.
//
// Kept as a separate config, and a separate *.itest.ts suffix, so `npm test`
// still runs with no database at all. Nobody should need Postgres installed
// to check that a readiness score is computed correctly.
//
// Run one file at a time, on purpose: these tests share a single database
// and truncate between cases, so running files in parallel has them
// clearing each other's rows mid-assertion. That is not hypothetical -- it
// happened the first time a second file was added here, and it presents as
// one file passing alone and failing in company, which is the most
// expensive kind of flake to chase.
//
// fileParallelism, not poolOptions.threads.singleThread: Vitest 4 removed
// the latter, and a removed option is silently ignored rather than
// rejected, so the suite looked configured and was not.
export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.itest.ts"],
    globalSetup: ["./server/test-support/global-setup.ts"],
    fileParallelism: false,
    // server/db.ts reads this at import time and throws without it, so it
    // has to be set before any module under test loads.
    env: { DATABASE_URL: integrationDatabaseUrl() },
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
