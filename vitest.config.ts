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
    // client/src/lib is included for the PURE modules there only -- the
    // tracking math (bar-tracking, jump-tracking, capture-trust) imports
    // nothing but types across module boundaries and runs fine under Node.
    // A test for anything that actually touches the DOM, MediaPipe or
    // Capacitor does not belong here; it would need a browser environment
    // this config deliberately does not set up.
    include: ["server/**/*.test.ts", "shared/**/*.test.ts", "client/src/lib/**/*.test.ts"],
  },
});
