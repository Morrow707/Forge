import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Importing the module pulls in Capacitor's Filesystem, which does not load
// under node, so this is a source-level guard. What matters is structural:
// the manifest is the only record that a queued video file exists, so a
// failed write must not leave the file behind unreferenced.
const source = readFileSync(join(__dirname, "video-offline-store.ts"), "utf8");

describe("a failed manifest write does not orphan the video", () => {
  it("reports whether the manifest write landed", () => {
    expect(source).toMatch(/function writeManifest\([^)]*\):\s*boolean/);
    expect(source).toMatch(/return true;/);
    expect(source).toMatch(/return false;/);
  });

  it("cleans up the file and refuses rather than swallowing the failure", () => {
    const persist = source.slice(source.indexOf("if (!writeManifest("));
    expect(persist).toContain("Filesystem.deleteFile");
    expect(persist).toMatch(/throw new Error/);
  });

  it("never ignores the result of the queueing write", () => {
    // A bare `writeManifest([...readManifest(), entry]);` is the shape that
    // silently dropped the record.
    expect(source).not.toMatch(/^\s*writeManifest\(\[\.\.\.readManifest\(\), entry\]\);/m);
  });
});
