import { describe, it, expect } from "vitest";
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
});
