// Is this HTTP status worth retrying, or will it fail the same way forever?
//
// One shared answer because two queues had two different ones, and the difference destroyed the
// athlete's data. offline-queue.ts (workout logs) classified correctly. video-offline-store.ts
// treated EVERY non-2xx as permanent and deleted the recording from disk -- so a 502 while the
// server cold-started, on the drive home from the gym, erased every clip filmed that session
// with a message telling the athlete to re-record footage that no longer existed.
//
// Deliberately its own module with no imports, so both queues import the same function rather
// than each carrying a copy that can drift again.

/** True when the server will keep rejecting this request no matter how many times it is retried.
 *
 * A 4xx means the request itself is wrong, with three exceptions that all succeed later:
 *   401 -- the session expired; a refresh or re-login fixes it.
 *   408 -- the server gave up waiting; the next attempt has a fresh timeout.
 *   429 -- rate limited; that is a request to come back, not a refusal.
 *
 * Everything 5xx is the server having a problem, which is the definition of temporary. A null
 * status (no response at all: offline, DNS failure, connection reset) is never permanent.
 *
 * The `code` argument exists for one case that the status alone gets backwards. The guardian gate
 * (server/routes.ts) refuses EVERY athlete route with a 403 while a minor has no guardian account
 * linked, and that 403 stops the moment a parent finishes signing up -- it is a "not yet", not a
 * "never". Without this, an athlete who was using the app before that gate shipped would have
 * their queued offline workout deleted, and their queued video deleted off disk, on the first
 * reconnect after the update -- told it "was rejected by the server and can't be synced" about
 * work that would have synced perfectly an hour later once their parent opened the email. */
export function isPermanentUploadRejection(
  status: number | null | undefined,
  code?: string | null,
): boolean {
  if (status == null) return false;
  if (code === "guardian_link_required") return false;
  return status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429;
}
