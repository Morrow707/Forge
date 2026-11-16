import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** LEAVING THE APP ON THE PHONE WRITES THE DAY TO THE PHONE (2026-11-16).
 *
 * The native app signs in with a bearer token. A beacon cannot carry a header, so every beacon the
 * phone sent on the way out was refused 401 -- and sendBeacon returned true ("queued"), so nothing
 * else ran: no authenticated request, no on-device copy. If iOS then killed the suspended app, the
 * edits since the last save were gone. Scott: "we should be saving regardless of phone status. If
 * the athlete exits out ... if it crashes, it should still be there regardless of what I do."
 *
 * The rule now: in the app, leaving queues the day (offline-queue.ts, a file on the phone) and
 * sends no beacon. The queue is replayed on resume by this screen and on the next launch by the
 * global flush. Asserted on source because the path cannot be reached without rendering the whole
 * workout screen; bodies are bounded by their own braces and comments are stripped first, because
 * the explanation of the fix quotes the old form. */
const RAW = fs.readFileSync(path.join(process.cwd(), "client", "src", "pages", "workout.tsx"), "utf8");

/** Line-aware strip: a block comment only when its opener starts the line, a // comment only where
 *  the quotes before it are balanced (a URL inside a string is not a comment). */
function stripComments(src: string): string {
  const withoutBlocks = src.replace(/^\s*\/\*[\s\S]*?\*\//gm, "");
  return withoutBlocks
    .split("\n")
    .map((line) => {
      let quote: string | null = null;
      for (let i = 0; i < line.length - 1; i++) {
        const c = line[i];
        if (quote) {
          if (c === "\\") i++;
          else if (c === quote) quote = null;
        } else if (c === '"' || c === "'" || c === "`") quote = c;
        else if (c === "/" && line[i + 1] === "/") return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}
const SRC = stripComments(RAW);

function functionBody(marker: string): string {
  const idx = SRC.indexOf(marker);
  expect(idx, `${marker} not found`).toBeGreaterThan(-1);
  const open = SRC.indexOf("{", idx + marker.length - 1);
  let depth = 0;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}" && --depth === 0) return SRC.slice(open, i + 1);
  }
  throw new Error(`${marker} has no closing brace`);
}

describe("leaving the app on the phone writes the day to the phone", () => {
  it("the native branch queues and returns before any beacon or fetch", () => {
    const flush = functionBody("function flush() {");
    const native = flush.indexOf("if (getNativeToken())");
    expect(native, "flush has no native branch").toBeGreaterThan(-1);
    const branch = flush.slice(native, flush.indexOf("}", native) + 1);
    expect(branch).toMatch(/rescueToQueue\(\);\s*return;/);
    // Nothing that sends may come before the native branch has returned.
    for (const sender of ["sendBeacon", "fetch("]) {
      const at = flush.indexOf(sender);
      expect(at, sender).toBeGreaterThan(native + branch.length - 1);
    }
  });

  it("the queued copy is written only for a loaded, unsaved day", () => {
    const rescue = functionBody("function rescueToQueue() {");
    const hydrated = rescue.indexOf("if (!hydratedRef.current) return;");
    const dirty = rescue.indexOf("if (!dirtySinceSyncRef.current) return;");
    const queue = rescue.indexOf("queueLog(dayKey");
    expect(hydrated).toBeGreaterThan(-1);
    expect(dirty).toBeGreaterThan(hydrated);
    expect(queue).toBeGreaterThan(dirty);
  });

  it("Capacitor's own pause event triggers it, and the unmount still rescues", () => {
    expect(SRC).toMatch(/CapacitorApp\.addListener\("pause",\s*\(\)\s*=>\s*flush\(\)\)/);
    // The cleanup that removes the pagehide listener, bounded by its own braces.
    const removal = SRC.indexOf('window.removeEventListener("pagehide", flush);');
    expect(removal).toBeGreaterThan(-1);
    const cleanupStart = SRC.lastIndexOf("return () => {", removal);
    let depth = 0;
    let end = -1;
    for (let i = SRC.indexOf("{", cleanupStart); i < SRC.length; i++) {
      if (SRC[i] === "{") depth++;
      else if (SRC[i] === "}" && --depth === 0) { end = i; break; }
    }
    expect(SRC.slice(cleanupStart, end)).toMatch(/rescueToQueue\(\);/);
  });

  it("the strip is load-bearing: the old beacon-first form is forbidden in code, not in prose", () => {
    const flush = functionBody("function flush() {");
    // The old shape sent a beacon unconditionally before anything else.
    const firstBeacon = flush.indexOf("navigator.sendBeacon");
    expect(firstBeacon).toBeGreaterThan(flush.indexOf("if (getNativeToken())"));
  });
});
