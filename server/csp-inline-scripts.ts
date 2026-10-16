/** The ONE inline script Forge ships, allowed into the Content Security Policy by hash.
 *
 * client/index.html carries one short <script> that adds the `light` and `had-session` classes before the first
 * paint so a light-mode reader never flashes dark (the comment on it says why it cannot be in
 * the bundle: it has to run before React mounts). `script-src 'self'` does not cover an inline
 * script, so from the day it was added every page load fired a report-only violation
 * (`script-src-elem`, blocked-uri `inline`, line 12) -- one POST to /api/csp-report and one
 * "CSP violation report" warning in the server log per visit, by every visitor. Found 2026-10-16
 * by listening for `securitypolicyviolation` on the live home page in a headless browser.
 *
 * A hash is the right allowance: it admits exactly these bytes and nothing else, where
 * `'unsafe-inline'` would admit any injected script. It is the SHA-256 of the script's text
 * between the tags, whitespace included, which is why `server/csp-inline-scripts.test.ts`
 * derives it from client/index.html rather than trusting the literal here -- an edit to the
 * script, even reindenting it, changes the hash, and the test fails until this is updated.
 * Vite copies a non-module inline script into dist/index.html byte for byte (checked), so the
 * served bytes are the source bytes.
 */
export const THEME_SCRIPT_SHA256 = "'sha256-pZqHe0OVl6j5Ne924J1VyJ5veBYtIX8rJHuNLQ5xj3E='";

/** The script's text as the hash sees it: everything between `<script>` and `</script>`. */
export function inlineScriptBodies(html: string): string[] {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}
