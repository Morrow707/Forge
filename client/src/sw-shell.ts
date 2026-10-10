/**
 * How the service worker answers a navigation (a tap on an emailed link, a typed address, a
 * reload): the LIVE shell first, the precached one only when the network cannot answer.
 *
 * Why this exists (2026-10-10). The worker used to hand every navigation the index.html it had
 * precached at install, online or not. That shell names the JS bundle it was built with, and
 * that bundle carries the ROUTER -- so for the whole window between a deploy and the worker's
 * own background update, a path added in that deploy rendered the app's 404 page, because the
 * router that drew it had never heard of it. Scott tapped the "Notice to Parent or Guardian"
 * link in a roster email, a page added two days earlier, and got the 404 screen, while the same
 * URL answered 200 with the right title from the server. The server sends index.html with
 * `cache-control: no-cache` and an ETag, so asking it costs one small round trip and is usually
 * a 304; the precached copy keeps every deep link working offline, which is the only job it
 * ever needed to do.
 *
 * Pure so it can be tested without a worker: the caller supplies the network fetch and the
 * precached shell.
 */

export const LIVE_SHELL_TIMEOUT_MS = 5000;

export type ShellSources = {
  /** The real request, forwarded to the network -- the server's own answer for this path. */
  fetchLive: () => Promise<Response>;
  /** The shell precached at install -- the offline answer. */
  precachedShell: () => Promise<Response>;
  /** Milliseconds to wait on the network before falling back; defaults to LIVE_SHELL_TIMEOUT_MS. */
  timeoutMs?: number;
};

/**
 * Returns the network's answer when it arrives in time and is not a server failure; otherwise
 * the precached shell. A 404 from the server is the server's own 404 shell and is served as it
 * came (the server decides what is a page). A 5xx -- the ~30s a Render deploy answers 502 -- is
 * not a page and gets the precached shell, exactly what every navigation got before.
 */
export async function answerNavigation(sources: ShellSources): Promise<Response> {
  const timeoutMs = sources.timeoutMs ?? LIVE_SHELL_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const live = await Promise.race([sources.fetchLive(), timedOut]);
    if (live === "timeout") return sources.precachedShell();
    if (live.status >= 500) return sources.precachedShell();
    return live;
  } catch {
    return sources.precachedShell();
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
