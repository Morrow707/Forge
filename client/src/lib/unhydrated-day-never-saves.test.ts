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

function bodyAfter(marker: string, lines: number): string {
  const idx = SRC.indexOf(marker);
  expect(idx, `${marker} not found in workout.tsx`).toBeGreaterThan(-1);
  return SRC.slice(idx).split("\n").slice(0, lines).join("\n");
}

describe("an unhydrated workout day is never saved", () => {
  it("tracks hydration in a ref the teardown handlers can read", () => {
    expect(SRC).toMatch(/hydratedRef\s*=\s*useRef\(false\)/);
    expect(SRC).toMatch(/hydratedRef\.current\s*=\s*hydrated/);
  });

  it("the beacon flush bails before building a payload", () => {
    const body = bodyAfter("function flush() {", 6);
    expect(body).toMatch(/if \(!hydratedRef\.current\) return;/);
    expect(body.indexOf("if (!hydratedRef.current) return;")).toBeLessThan(
      body.indexOf("buildLogPayload"),
    );
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
