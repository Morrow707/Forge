import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.join(process.cwd(), "client/src/App.tsx"), "utf8");
const component = fs.readFileSync(
  path.join(process.cwd(), "client/src/components/debug-console.tsx"),
  "utf8",
);

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

/** The mount site above is a statement about the PLATFORM -- native, or a dev build. It says
 * nothing about who is signed in, and for as long as it was the only gate, every athlete, Free
 * Agent and coach on the native app carried a floating bug icon over their training screen,
 * minors included, opening a log of their own navigation and in-app-purchase traffic.
 *
 * Scott, 2026-10-19: "make sure the debug is only for the admin, never for the other users."
 *
 * Two halves, and the second is the one that is easy to "fix" wrongly: the console RENDERS only
 * for an admin, and the LOGGING stays on for everybody. The console's most valuable lines are
 * written before anyone has signed in -- a held StoreKit transaction, the relaunch marker -- so
 * gating the hooks as well would leave an admin opening a log that begins at their own sign-in
 * and can say nothing about how the app got there. */
describe("the debug console is admin-only", () => {
  it("reads the signed-in user", () => {
    expect(component).toMatch(/import \{ useAuth \} from "@\/hooks\/use-auth"/);
    expect(component).toMatch(/const \{ user \} = useAuth\(\)/);
  });

  it("renders nothing for every role but admin, and tests the role explicitly", () => {
    // Explicit === "admin" rather than a truthiness check or a !== on some other role: user is
    // undefined while /api/auth/me is in flight, and unknown is not yes.
    expect(component).toMatch(/if \(user\?\.role !== "admin"\) return null;/);
  });

  it("puts that return BELOW every hook", () => {
    // An early return above a hook changes the hook order the moment a sign-in resolves, which
    // React treats as a different component. This is the assertion that fails if someone
    // "tidies" the guard up to the top of the function.
    const guard = component.indexOf('if (user?.role !== "admin") return null;');
    expect(guard).toBeGreaterThan(-1);
    const lastHook = Math.max(
      component.lastIndexOf("useEffect("),
      component.lastIndexOf("useState("),
      component.lastIndexOf("useRef("),
    );
    expect(lastHook).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(lastHook);
  });

  it("still records NAV for everybody, so the log predates the sign-in that reveals it", () => {
    const guard = component.indexOf('if (user?.role !== "admin") return null;');
    const navLog = component.indexOf('logDebug("NAV"');
    expect(navLog).toBeGreaterThan(-1);
    // Below the guard would mean the line only ever runs for an admin -- which is exactly the
    // over-correction this case exists to catch.
    expect(navLog).toBeLessThan(guard);
  });
});
