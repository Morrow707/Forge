import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

// queryClient.ts builds a localStorage persister at module scope and this suite runs in node
// with no DOM (vitest.config.ts) -- same dynamic-import-behind-a-stub as
// transport-failure-is-retryable.test.ts, rather than pulling in jsdom for one import.
async function load() {
  vi.stubGlobal("window", {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    location: { origin: "https://example.test" },
  });
  const qc = await import("@/lib/queryClient");
  const msg = await import("@/lib/rate-limit-message");
  return { ...qc, ...msg };
}

// A rate-limited session used to read as a connection problem: the auth probe's failure screen
// says "check your connection", which for a 429 is a fix that cannot work and an instruction
// that makes the problem worse -- every retry is another request against the same window.
describe("a 429 says it is a rate limit, not a connection fault", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fires on an ApiError with status 429 and on nothing else", async () => {
    const { ApiError, isRateLimited } = await load();
    expect(isRateLimited(new ApiError(429, "Too many requests"))).toBe(true);
    expect(isRateLimited(new ApiError(500, "Server error"))).toBe(false);
    expect(isRateLimited(new ApiError(401, "Unauthorized"))).toBe(false);
    expect(isRateLimited(undefined)).toBe(false);
  });

  it("never fires for a transport failure", async () => {
    const { ApiError, NetworkError, isRateLimited } = await load();
    // NetworkError is deliberately NOT an ApiError (CLAUDE.md, "A set that was logged and a set
    // that reached the server"). A request that never reached the server cannot have been rate
    // limited, and this branch must not be the thing that tempts anyone to change that.
    const transport = new NetworkError("Couldn't reach Forge");
    expect(transport instanceof ApiError).toBe(false);
    expect(isRateLimited(transport)).toBe(false);
  });

  it("says the wait out loud", async () => {
    const { RATE_LIMITED_MESSAGE } = await load();
    expect(RATE_LIMITED_MESSAGE).toBe(
      "Forge is getting a lot of requests from this connection. Wait a minute and try again.",
    );
  });

  it("the auth probe's failure screen carries the branch, with the same retry control", () => {
    const app = read("App.tsx");
    expect(app).toContain('import { RATE_LIMITED_MESSAGE, isRateLimited } from "@/lib/rate-limit-message"');
    const screen = app.slice(app.indexOf("function ConnectionProblem()"));
    const body = screen.slice(0, screen.indexOf("\n}\n"));
    expect(body).toContain("isRateLimited(error)");
    expect(body).toContain("RATE_LIMITED_MESSAGE");
    // The original sentence is still there for every other failure, and the button is unchanged.
    expect(body).toContain("Having trouble reaching Forge. Your session is still fine");
    expect(body).toContain('qc.refetchQueries({ queryKey: ["/api/auth/me"] })');
  });

  it("the auth context actually hands the error down, or the branch is dead code", () => {
    const auth = read("hooks/use-auth.tsx");
    expect(auth).toContain("error: unknown;");
    expect(auth).toMatch(/isError,\s*\n\s*error,\s*\n\s*\} = useQuery</);
  });

  it("ReadFailed says the same thing when it is given the error", () => {
    const rf = read("components/read-failed.tsx");
    expect(rf).toContain("isRateLimited(error)");
    expect(rf).toContain("RATE_LIMITED_MESSAGE");
    // Optional and additive: a call site that passes nothing reads exactly as it did before.
    expect(rf).toContain("error?: unknown;");
    expect(rf).toContain("That isn't the same as there being none.");
    // One call site proves the wiring end to end.
    expect(read("components/terms-reacceptance-gate.tsx")).toContain("error={error}");
  });
});
