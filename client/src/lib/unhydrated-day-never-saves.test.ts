import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** A WORKOUT DAY THAT NEVER LOADED MUST NEVER BE SAVED.
 *
 * storage.submitWorkoutLog deletes every entry on the day and reinserts whatever the payload
 * carries, and submitWorkoutLogSchema's `entries` defaults to []. workout.tsx's `items` starts
 * empty and is filled by a hydrate effect that does not run when the day read fails. So a
 * teardown save (sendBeacon on visibilitychange/pagehide, or the offline-queue write on unmount)
 * built from that state deletes the athlete's entire logged workout, with no baseRevision for
 * the stale guard to refuse it on.
 *
 * Both teardown paths must therefore bail before building a payload when the screen has not
 * hydrated. Asserted as a source scan because neither path can be reached without rendering the
 * whole workout screen. */
const SRC = fs.readFileSync(
  path.join(process.cwd(), "client", "src", "pages", "workout.tsx"),
  "utf8",
);

/** The body of the function declared by `marker`, bounded by matching its own braces -- never a
 *  line or character window (a six-line window went red the day a comment grew; CLAUDE.md). */
function functionBody(marker: string): string {
  const idx = SRC.indexOf(marker);
  expect(idx, `${marker} not found in workout.tsx`).toBeGreaterThan(-1);
  const open = SRC.indexOf("{", idx + marker.length - 1);
  let depth = 0;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}" && --depth === 0) return SRC.slice(open, i + 1);
  }
  throw new Error(`${marker} has no closing brace`);
}

describe("an unhydrated workout day is never saved", () => {
  it("tracks hydration in a ref the teardown handlers can read", () => {
    expect(SRC).toMatch(/hydratedRef\s*=\s*useRef\(false\)/);
    expect(SRC).toMatch(/hydratedRef\.current\s*=\s*hydrated/);
  });

  it("the beacon flush bails before building a payload", () => {
    for (const marker of ["function flush() {", "function rescueToQueue() {"]) {
      const body = functionBody(marker);
      const guard = body.indexOf("if (!hydratedRef.current) return;");
      expect(guard, marker).toBeGreaterThan(-1);
      const build = body.indexOf("buildLogPayload");
      const rescue = body.indexOf("rescueToQueue()");
      // Whatever builds or queues a payload comes after the guard.
      for (const at of [build, rescue].filter((n) => n > -1)) expect(guard, marker).toBeLessThan(at);
    }
  });

  it("the unmount queue-write bails before building a payload", () => {
    const idx = SRC.lastIndexOf("queueLog(dayKey");
    const before = SRC.slice(0, idx);
    const guard = before.lastIndexOf("if (!hydratedRef.current) return;");
    const build = before.lastIndexOf("buildLogPayload(itemsRef.current");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(build);
  });
});
