import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { THEME_SCRIPT_SHA256, inlineScriptBodies } from "./csp-inline-scripts";

const root = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(root, "client", "index.html"), "utf8");
const serverIndex = fs.readFileSync(path.join(root, "server", "index.ts"), "utf8");

function cspHash(body: string): string {
  return `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
}

describe("the inline theme script is allowed by hash, so no page load reports a violation", () => {
  it("client/index.html has exactly one inline script and its hash is the constant", () => {
    const bodies = inlineScriptBodies(indexHtml);
    expect(bodies, "one inline script: the theme class before first paint").toHaveLength(1);
    expect(bodies[0]).toMatch(/forge:theme/);
    // Derived, never retyped: an edit to the script (reindenting it is enough) changes the hash
    // and this is what says so before the next deploy starts reporting again.
    expect(cspHash(bodies[0])).toBe(THEME_SCRIPT_SHA256);
  });

  it("script-src carries the hash beside 'self' and nothing looser", () => {
    const m = serverIndex.match(/scriptSrc:\s*\[([^\]]*)\]/);
    expect(m, "scriptSrc directive in server/index.ts").not.toBeNull();
    expect(m![1]).toMatch(/THEME_SCRIPT_SHA256/);
    expect(m![1]).toMatch(/'self'/);
    expect(m![1]).not.toMatch(/unsafe-inline/);
  });

  it("a different script does not hash to it", () => {
    expect(cspHash(inlineScriptBodies(indexHtml)[0] + " ")).not.toBe(THEME_SCRIPT_SHA256);
  });
});
