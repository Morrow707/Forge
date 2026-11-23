/**
 * THE WORKOUT SCREEN'S SAVE QUEUE MUST KEEP MOVING AFTER THE SCREEN UNMOUNTS.
 *
 * Round 25, 2026-11-23, RDL set 3: the clip uploaded (POST /api/athlete/form-video 201), the set
 * saved, and the export read hasVideo false. The camera dialog hands a take up twice -- numbers
 * first, the clip's url a moment later -- and its analysis finishes after the athlete has often
 * left the screen. The first save went out; the second waited behind it in pendingSaveRef; and
 * the only thing that released the queue was an onSettled callback handed to mutate(), which
 * TanStack Query calls only while the component still has a listener. Unmounted, it never fired,
 * so the save carrying the clip never ran.
 *
 * Two halves: the library premise (mutate() callbacks are skipped without a listener, and the
 * mutateAsync promise settles regardless), driven on the real MutationObserver; and the rule in
 * workout.tsx, read with comments stripped: the save chain advances on the promise, never on a
 * callback passed to mutate().
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MutationObserver, QueryClient } from "@tanstack/query-core";

function stripComments(src: string): string {
  return src
    .split("\n")
    .map((line) => (/^\s*\/\//.test(line) ? "" : line))
    .join("\n")
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, "");
}

function bodyOf(src: string, signature: string): string {
  const at = src.indexOf(signature);
  expect(at, `${signature} not found`).toBeGreaterThan(-1);
  const open = src.indexOf("{", src.indexOf(")", at));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error("unbalanced");
}

const workout = readFileSync(join(__dirname, "../pages/workout.tsx"), "utf8");

describe("the save queue outlives the screen", () => {
  it("PREMISE: a callback passed to mutate() is skipped once nothing listens, the promise still settles", async () => {
    const client = new QueryClient();
    const observer = new MutationObserver(client, { mutationFn: async (n: number) => n * 2 });
    let callbackFired = false;
    // No subscribe(): exactly the state of an unmounted component's observer.
    const result = await observer.mutate(21, { onSettled: () => { callbackFired = true; } });
    expect(result).toBe(42);
    expect(callbackFired).toBe(false);
  });

  it("the queued save advances on the mutateAsync promise, not on a mutate() callback", () => {
    const body = stripComments(bodyOf(workout, "function runQueuedSave("));
    expect(body).toMatch(/submitMutation\.mutateAsync\(/);
    expect(body).not.toMatch(/submitMutation\.mutate\(/);
    expect(body).toMatch(/finally\s*\{[\s\S]*pendingSaveRef\.current = null;[\s\S]*runQueuedSave\(next\)/);
  });

  it("nothing in the workout screen chains work on a callback passed to submitMutation.mutate()", () => {
    expect(stripComments(workout)).not.toMatch(/submitMutation\.mutate\([^)]*,\s*\{/);
  });
});
