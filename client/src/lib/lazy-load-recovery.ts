const RELOAD_GUARD_KEY = "reloaded-after-preload-error";

/** One-shot recovery for a route chunk that failed (or hung) to load -- shared by main.tsx's
 * vite:preloadError listener (an outright failed fetch) and withLoadTimeout below (a fetch that
 * never settles at all, a failure mode a caught-error listener never sees). A single reload
 * almost always fixes a stale/glitched load; the sessionStorage guard stops a genuinely broken
 * build from reload-looping forever -- a second failure in the same tab falls through to the
 * normal Sentry ErrorBoundary fallback instead. */
export function recoverFromStuckChunkLoad(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return false;
  sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
  window.location.reload();
  return true;
}

/** Wraps a lazy route import with a timeout. A dynamic import() that simply never settles --
 * seen on iOS, where WKWebView's local Capacitor server occasionally hangs a request instead of
 * erroring it (most often right after the app resumes from the background on a weak connection)
 * -- leaves React.lazy's Suspense fallback (the full-screen spinner) spinning forever, since
 * nothing ever rejects for an error boundary to catch. Previously the only way out was
 * force-quitting the app. Racing a timer against the import turns "never settles" into "reload,"
 * the same recovery vite:preloadError already gives an outright failed (not hung) load. */
export function withLoadTimeout<T>(loader: () => Promise<T>, timeoutMs = 15000): () => Promise<T> {
  return () =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        recoverFromStuckChunkLoad();
        reject(new Error("Timed out loading this page."));
      }, timeoutMs);
      loader().then(
        (mod) => {
          clearTimeout(timer);
          resolve(mod);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
}
