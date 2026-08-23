import { defineConfig } from "vitest/config";
import path from "path";

// Server/shared-side unit tests -- deliberately separate from vite.config.ts,
// which is rooted at client/ for the browser build and isn't the right base
// for Node-environment tests. Anything that touches a real Postgres
// connection (server/db.ts throws at import time with no DATABASE_URL, which
// this environment doesn't set) needs to mock ./storage rather than relying
// on config here to provide one -- see server/billing.test.ts for the pattern.
export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "shared/**/*.test.ts"],
  },
});
