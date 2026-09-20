import { ApiError } from "@/lib/queryClient";

/** A 429 IS NOT A CONNECTION PROBLEM, and telling somebody it is sends them to the wrong fix.
 *
 * The auth probe's failure screen said "Having trouble reaching Forge -- check your connection"
 * for every failure, which is right for a dropped request and wrong for the server's rate
 * limiter actively answering. Checking a connection that is working, force-quitting, retrying
 * hard -- every instinct that sentence produces makes a rate limit worse, and each retry is
 * another request against the same window.
 *
 * This is a read of a REAL HTTP response, so it is `ApiError` and only `ApiError`. A transport
 * failure is a `NetworkError`, which is not an `ApiError` and must never become one (see the
 * "A set that was logged and a set that reached the server" section of CLAUDE.md) -- so a
 * connection that dropped can never land in this branch, which is exactly the point.
 */
export const RATE_LIMITED_MESSAGE =
  "Forge is getting a lot of requests from this connection. Wait a minute and try again.";

export function isRateLimited(error: unknown): boolean {
  return error instanceof ApiError && error.status === 429;
}
