/** Page-view counting, off unless someone deliberately turns it on.
 *
 * WHY FORGE HAS HAD NONE AT ALL. Not an oversight to correct with the nearest snippet: Forge
 * has users under 13, and the usual answer -- Google Analytics -- is a third-party data flow
 * with cookies, cross-site identifiers and ad-network adjacency, pointed at minors. That is a
 * worse problem to have than not knowing the bounce rate.
 *
 * WHAT THIS IS. A single fire-and-forget POST per route change carrying the path and nothing
 * else. No cookie, no localStorage, no device fingerprint, no identifier of any kind, and it is
 * never told who is signed in. It is deliberately not capable of following one person around:
 * two visits from the same phone are indistinguishable from two different people, which is the
 * point and is also the whole reason it can be pointed at a self-hosted Plausible or similar
 * without a consent banner.
 *
 * IT IS OFF UNLESS VITE_ANALYTICS_ENDPOINT IS SET, and it must stay off until the privacy policy
 * names the processor. That is not a nicety: the policy is what athletes and guardians agreed
 * to, consent records snapshot its exact text, and sending page views to a party the policy does
 * not mention makes that text false for everyone who already accepted it. Turning this on is
 * therefore two changes, in this order -- amend the policy (which re-prompts for consent through
 * the existing machinery), then set the variable.
 *
 * Never send a path that identifies somebody. See redactPath.
 */

const ENDPOINT = (import.meta.env?.VITE_ANALYTICS_ENDPOINT as string | undefined) ?? "";

export function analyticsEnabled(): boolean {
  return ENDPOINT.length > 0;
}

/** Strips the identifying parts out of a path before it is counted.
 *
 * A raw path is not anonymous. /team/RIVERSIDE-HS names a school; /claim/A1B2C3 is one athlete's
 * invite token, and sending it somewhere is closer to leaking a credential than to counting a
 * visit. So the shape of the page is kept and the specifics are not, which is all a page-view
 * count ever needed.
 */
export function redactPath(path: string): string {
  const segments = path.split("?")[0].split("#")[0].split("/");
  return segments
    .map((seg, i) => {
      if (i === 0 || seg === "") return seg;
      const previous = segments[i - 1];
      // Anything under a route that takes a code, a token or an id.
      if (["team", "claim", "verify-email", "reset-password", "guardian"].includes(previous)) {
        return ":id";
      }
      // A bare number anywhere is an identifier by another name.
      if (/^\d+$/.test(seg)) return ":id";
      // A long opaque segment is too, but "long" alone is not the test -- "for-high-schools" is
      // seventeen characters and is a page name. What separates them is shape: a real slug is
      // lowercase words joined by hyphens, and a token is not. Caught by this test file, which
      // was reporting /for-high-schools as /:id.
      const looksLikeSlug = /^[a-z]+(?:-[a-z]+)*$/.test(seg);
      if (!looksLikeSlug && seg.length >= 12) return ":id";
      return seg;
    })
    .join("/");
}

/** Counts one page view. Silent on every failure -- a counter that can break a page is worse
 * than no counter, and there is nothing a visitor could do about it anyway. */
export function trackPageView(path: string): void {
  if (!analyticsEnabled()) return;
  try {
    const body = JSON.stringify({ path: redactPath(path), referrer: document.referrer ? new URL(document.referrer).origin : null });
    // sendBeacon survives the page being navigated away from, which an ordinary fetch does not.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
  } catch {
    // Deliberately empty: see above.
  }
}
