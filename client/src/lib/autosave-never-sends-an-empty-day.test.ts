import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** "Film a set and the whole workout is gone." submitWorkoutLog is a delete-and-reinsert of the
 * day, so whatever entries the client sends become the whole log. Five edit paths computed the
 * next state INSIDE a React updater and autosaved the captured variable; when React deferred the
 * updater (any pending update on the component, which is the normal state right after a capture
 * dialog closes) the variable was still [] and the save deleted every entry. Two guards now:
 * every edit path computes synchronously through commitItems, and queueSave refuses an empty
 * snapshot after hydration. Both are scanned because either one alone would have caught the
 * bug and both were missing. */
const src = readFileSync(join(process.cwd(), "client/src/pages/workout.tsx"), "utf8");

describe("the workout autosave can never send an empty day", () => {
  it("has no edit path that captures the next state from inside a setItems updater", () => {
    expect(src).not.toMatch(/let nextItems: ItemState\[\] = \[\];/);
    expect(src).not.toMatch(/setItems\(\(prev\) => \{[\s\S]{0,400}?nextItems = /);
  });
  it("routes every edit through commitItems, which computes from the ref and updates it", () => {
    expect(src).toContain("function commitItems(compute: (prev: ItemState[]) => ItemState[]): ItemState[]");
    expect(src).toMatch(/const next = compute\(itemsRef\.current\);\s*itemsRef\.current = next;\s*setItems\(next\);/);
    expect((src.match(/const nextItems = commitItems\(/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
  it("refuses an empty snapshot after hydration in queueSave", () => {
    const fn = src.slice(src.indexOf("function queueSave("), src.indexOf("function markWorkoutComplete("));
    expect(fn).toContain("hydratedRef.current && args.itemsSnapshot.length === 0 && itemsRef.current.length > 0");
    expect(fn).toContain('logDebug("SAVE"');
  });
});
