/** Whether this page load was handed prerendered content before React mounted.
 *
 * The public pages arrive with their body already in the HTML (client/src/entry-prerender.tsx),
 * so a visitor is reading the page before the bundle runs. main.tsx records that fact here
 * BEFORE createRoot, because React's first commit replaces whatever was in the root. Two
 * things read it: the router's page transition, which skips its fade-in on the first mount so
 * the content that was already on screen does not blink out and fade back in, and nothing
 * else yet. It is a fact about one page load and never changes after boot. */
let booted = false;

export function markBootFromPrerender(root: Element | null): void {
  booted = !!root && root.querySelector("[data-prerendered]") !== null;
}

export function bootedFromPrerender(): boolean {
  return booted;
}
