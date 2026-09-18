import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// A REQUEST THE SERVER NEVER SAW IS THE MOST RETRYABLE THING THERE IS.
//
// fetch() rejects with a bare TypeError for any transport failure. Wrapping that in a friendlier
// message was right; wrapping it in an ApiError with status 0 was not, and it cost a logged set.
//
// The workout autosave decides whether to queue a failed save for retry or throw it away with:
//
//     err instanceof ApiError && err.status !== 401 && err.status < 500
//
// Status 0 satisfies both halves. So a save that failed because the phone briefly could not
// reach the server was classified as a payload the server would keep refusing -- thrown instead
// of queued, never retried, and the offline rescue that exists for exactly this case could not
// run. The athlete's set was simply gone.
//
// So the rule is structural, not a matter of picking a better number: a transport failure must
// not be an ApiError at all. Then every `instanceof ApiError` branch in the app behaves as it did
// before the wrapper existed, including ones nobody thought to check.
const LIB = __dirname;
const queryClient = readFileSync(join(LIB, "queryClient.ts"), "utf8");
const workout = readFileSync(join(LIB, "..", "pages", "workout.tsx"), "utf8");

describe("a fetch that never reached the server", () => {
  it("is not an ApiError", () => {
    expect(queryClient).toMatch(/export class NetworkError extends Error/);
    // The shape that caused the loss: an ApiError built with a zero status.
    expect(queryClient).not.toMatch(/new ApiError\(\s*0\s*,/);
  });

  it("still says something an athlete can act on", () => {
    expect(queryClient).toMatch(/Can't reach Forge right now/);
    // And still carries the raw detail -- there is no console to read on an iPhone.
    expect(queryClient).toMatch(/\$\{method\} \$\{url\}: \$\{detail\}/);
  });

  it("leaves the autosave's permanent-rejection test able to tell the difference", () => {
    // Pinned so the classifier and the error type stay in the same conversation: if this
    // condition is ever rewritten, whoever does it has to come back here.
    expect(workout).toMatch(
      /err instanceof ApiError && err\.status !== 401 && err\.status < 500/,
    );
  });

  // THE THREE ASSERTIONS ABOVE READ THE FILE; THESE ONES CALL IT.
  //
  // A scan over source text is what this started as and it is worth keeping -- it pins the
  // classifier in workout.tsx, which cannot be reached without rendering the screen. But a
  // regex is satisfied by a file that contains the right words, and the bug that lost a set
  // was about what apiRequest actually THREW. So the transport failure gets exercised for
  // real: one stubbed fetch rejection, and the type that comes back out.
  describe("when fetch itself rejects", () => {
    afterEach(() => vi.unstubAllGlobals());

    // queryClient.ts builds a localStorage persister at module scope, and this suite runs in
    // node with no DOM -- deliberately, so nobody needs a browser environment to check that a
    // readiness score is computed correctly (see vitest.config.ts). Rather than pull in jsdom
    // for one import, stand up the one global it reaches for and import it dynamically.
    async function loadQueryClient() {
      vi.stubGlobal("window", {
        localStorage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
        addEventListener: () => {},
        location: { origin: "https://example.test" },
      });
      return import("./queryClient");
    }

    async function thrownByApiRequest() {
      const { apiRequest } = await loadQueryClient();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new TypeError("Load failed")),
      );
      try {
        await apiRequest("POST", "/api/athlete/log", { entries: [] });
        return null;
      } catch (err) {
        return err;
      }
    }

    it("throws a NetworkError and not an ApiError", async () => {
      const { ApiError, NetworkError } = await loadQueryClient();
      const err = await thrownByApiRequest();
      expect(err).toBeInstanceOf(NetworkError);
      // The whole fix in one line. Status 0 on an ApiError satisfied both halves of the
      // autosave's permanent-rejection test, so the save was thrown away instead of queued.
      expect(err).not.toBeInstanceOf(ApiError);
    });

    it("is classified retryable by the autosave's own condition", async () => {
      const { ApiError } = await loadQueryClient();
      const err = await thrownByApiRequest();
      // The exact expression from workout.tsx, pinned above by the scan and evaluated here
      // against a real thrown error. False means queue it for retry, which is the point.
      const isPermanentRejection =
        err instanceof ApiError && err.status !== 401 && err.status < 500;
      expect(isPermanentRejection).toBe(false);
    });

    it("still carries the raw detail an athlete can read out to somebody", async () => {
      const err = await thrownByApiRequest();
      expect((err as Error).message).toContain("Can't reach Forge right now");
      expect((err as Error).message).toContain("TypeError: Load failed");
      expect((err as Error).message).toContain("/api/athlete/log");
    });
  });
});
