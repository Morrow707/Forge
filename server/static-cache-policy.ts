/** Cache policy for the built client, by what a change to the file would mean for a browser
 * holding the old one.
 *
 * - `/assets/*` carries a content hash in its name (Vite), so a file at that URL can never
 *   change: a year, `immutable`, and the browser never asks again. Before this every chunk went
 *   out with express.static's default (`max-age=0`) and was revalidated on every page load --
 *   one conditional request per chunk, per visit, through the rate limiter.
 * - The pose and detection runtimes (`/mediapipe-wasm/*`, `/onnxruntime-wasm/*`, `/models/*`)
 *   are 3 to 25 MB each and have no hash in their name, so a year is wrong (a runtime upgrade
 *   would sit behind the old file) and zero is worse (a 12 MB model re-checked every camera
 *   session). A day, with the ETag express.static already sends for the revalidation after it.
 *   The service worker keeps its own stale-while-revalidate copy on top; that is the client's
 *   business, this is the server's answer to whoever asks it directly.
 * - Everything else (`index.html`, the prerendered pages, `sw.js`, the manifest, icons) is
 *   the entry point to the next deploy and must be revalidated on every load: `no-cache` says
 *   "keep it, but ask", and the ETag makes the ask a 304 when nothing changed. That is what
 *   `express.static` did implicitly with `max-age=0`; it is stated here so nobody has to
 *   remember that "unset" was the safe choice.
 *
 * `server/static-cache-headers.test.ts` reads this policy and the middleware wiring in vite.ts.
 */
export const IMMUTABLE_ASSET_PREFIX = "/assets/";
export const LONG_LIVED_UNHASHED_PREFIXES = ["/mediapipe-wasm/", "/onnxruntime-wasm/", "/models/"];
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const LONG_LIVED_CACHE_CONTROL = "public, max-age=86400";
export const REVALIDATE_CACHE_CONTROL = "no-cache";

export function cacheControlForStaticPath(requestPath: string): string {
  if (requestPath.startsWith(IMMUTABLE_ASSET_PREFIX)) return IMMUTABLE_CACHE_CONTROL;
  if (LONG_LIVED_UNHASHED_PREFIXES.some((prefix) => requestPath.startsWith(prefix))) return LONG_LIVED_CACHE_CONTROL;
  return REVALIDATE_CACHE_CONTROL;
}

