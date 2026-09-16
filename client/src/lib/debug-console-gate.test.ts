import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.join(process.cwd(), "client/src/App.tsx"), "utf8");

/** The debug console is a tool, not a feature. It is mounted right now for the keychain-save
 * investigation and is meant to come back out. What must never happen in the meantime is it
 * reaching web users, who have no keychain, no question being investigated, and no reason to see
 * a floating bug icon on their training app. */
describe("the debug console mount", () => {
  const mounted = /<DebugConsole \/>/.test(app.replace(/\{\/\*[\s\S]*?\*\/\}/g, ""));

  it("is either absent or gated to the native app", () => {
    if (!mounted) {
      // Removed or commented out again -- the intended end state, nothing to check.
      expect(mounted).toBe(false);
      return;
    }
    expect(app).toMatch(
      /\(Capacitor\.isNativePlatform\(\) \|\| import\.meta\.env\.DEV\) && <DebugConsole \/>/,
    );
  });

  it("says why it is mounted and when it comes out", () => {
    if (!mounted) return;
    // A temporary tool with no stated removal condition is a permanent one.
    expect(app).toMatch(/TEMPORARY/);
  });
});
