import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** THE CAMERA PIPELINE IS ONLY EVER A DYNAMIC IMPORT.
 *
 * A tracker dialog carries MediaPipe's loader, onnxruntime-web and the tracking modules behind
 * it: a quarter of a megabyte before a frame is processed. A page that imports one statically
 * pays for it on every visit, camera or not -- which is what the workout page did for eleven of
 * them until 2026-09-20. The rule is structural: no page or component may `import { X } from
 * "@/components/<x>-tracker-dialog"`; it goes through lazyDialog (see components/lazy-dialog.tsx)
 * or a plain `import()`. Type-only imports are fine, they cost nothing.
 *
 * Same rule for the vision runtimes themselves (@mediapipe/tasks-vision, onnxruntime-web,
 * lib/pose-tracking) from anything outside the tracking modules and dialogs: a page never
 * imports the runtime directly.
 *
 * A scan over the directory, not a list -- the next tracker dialog will not be on anyone's list.
 */
const SRC = join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** Static value imports of a module matching `spec`: `import { X } from "..."`, `import X from`,
 * `import * as`. `import type` is excluded. */
function staticValueImports(src: string, spec: RegExp): string[] {
  const hits: string[] = [];
  for (const m of src.matchAll(/^import\s+(type\s+)?([^;]*?)\s+from\s+"([^"]+)";?/gms)) {
    if (m[1]) continue; // import type
    if (!spec.test(m[3])) continue;
    // `import { type A, type B } from` is still type-only
    const names = m[2].trim();
    if (/^\{[^}]*\}$/.test(names) && names.slice(1, -1).split(",").every((n) => !n.trim() || /^type\s/.test(n.trim()))) continue;
    hits.push(m[3]);
  }
  return hits;
}

const TRACKER_DIALOG = /^@\/components\/[a-z-]*tracker-dialog$/;
const VISION_RUNTIME = /^(@mediapipe\/tasks-vision|onnxruntime-web|@\/lib\/pose-tracking|@\/lib\/implement-detection)$/;

describe("the camera pipeline is only ever dynamically imported", () => {
  const pages = walk(join(SRC, "pages"));
  const components = walk(join(SRC, "components")).filter((f) => !/tracker-dialog\.tsx$/.test(f));

  it("no page or non-tracker component statically imports a tracker dialog", () => {
    const offenders: string[] = [];
    for (const f of [...pages, ...components]) {
      for (const spec of staticValueImports(readFileSync(f, "utf8"), TRACKER_DIALOG)) {
        offenders.push(`${f.replace(SRC, "client/src")} -> ${spec}`);
      }
    }
    expect(offenders, "use lazyDialog(() => import(...)) instead").toEqual([]);
  });

  it("no page statically imports a vision runtime", () => {
    const offenders: string[] = [];
    for (const f of pages) {
      for (const spec of staticValueImports(readFileSync(f, "utf8"), VISION_RUNTIME)) {
        offenders.push(`${f.replace(SRC, "client/src")} -> ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the scan sees the tracker dialogs it is guarding (so a rename cannot blank it)", () => {
    const dialogs = readdirSync(join(SRC, "components")).filter((f) => /tracker-dialog\.tsx$/.test(f));
    expect(dialogs.length).toBeGreaterThanOrEqual(15);
    // And the workout page really does reach them, dynamically.
    const workout = readFileSync(join(SRC, "pages", "workout.tsx"), "utf8");
    expect(workout).toMatch(/lazyDialog\(\(\) => import\("@\/components\/bar-tracker-dialog"\)/);
  });
});
