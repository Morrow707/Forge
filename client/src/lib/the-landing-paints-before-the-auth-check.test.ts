import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SESSION_HINT_KEY, hasSessionHint, rememberSessionState } from "./session-hint";

const root = path.resolve(__dirname, "..");
const appTsx = fs.readFileSync(path.join(root, "App.tsx"), "utf8");
const useAuth = fs.readFileSync(path.join(root, "hooks", "use-auth.tsx"), "utf8");

/** A first-time visitor on the web sees the landing page while /api/auth/me is still out,
 * instead of a full-screen spinner for the whole round trip. Found 2026-10-16 measuring the
 * live home page: first contentful paint at 2.5 s, gated on the auth check. */
describe("the home route paints the landing page through the first auth check", () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("the hint is set by a signed-in answer and cleared by a signed-out one", () => {
    expect(hasSessionHint()).toBe(false);
    rememberSessionState(true);
    expect(store[SESSION_HINT_KEY]).toBe("1");
    expect(hasSessionHint()).toBe(true);
    rememberSessionState(false);
    expect(hasSessionHint()).toBe(false);
  });

  it("a browser with no storage reads as no hint and never throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(hasSessionHint()).toBe(false);
    expect(() => rememberSessionState(true)).not.toThrow();
  });

  it("HomeRedirect draws LandingPage while loading only for a first visit, and never on native", () => {
    const fn = appTsx.slice(appTsx.indexOf("function HomeRedirect()"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    const loadingBranch = body.slice(body.indexOf("if (isLoading)"), body.indexOf("if (isError)"));
    expect(loadingBranch).toMatch(/checkingFirstVisit && !Capacitor\.isNativePlatform\(\)[\s\S]*<LandingPage \/>/);
    // The spinner is still what everyone else gets while waiting.
    expect(loadingBranch).toMatch(/<FullScreenSpinner \/>/);
    // The signed-in redirect is untouched: a user that arrives still goes home.
    expect(body).toMatch(/return <Redirect to=\{homeFor\(user\.role\)\} \/>/);
  });

  it("checkingFirstVisit is true only with nothing restored, a fetch in flight and no hint", () => {
    expect(useAuth).toMatch(
      /const checkingFirstVisit = !isRestoring && isFetching && user === undefined && !hasSessionHint\(\);/,
    );
  });

  it("the hint follows a REAL answer and ignores a failed check", () => {
    const effect = useAuth.slice(useAuth.indexOf("rememberSessionState(user !== null)") - 200, useAuth.indexOf("rememberSessionState(user !== null)"));
    expect(effect).toMatch(/if \(isLoading \|\| isError \|\| user === undefined\) return;/);
  });
});
