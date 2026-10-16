/** Whether THIS browser has had a signed-in session, remembered across page loads.
 *
 * WHY. "/" has to choose between the marketing page and a signed-in person's dashboard, and the
 * only authority is /api/auth/me -- one round trip to Oregon, ~400 ms from most of the country.
 * Until 2026-10-16 the home route drew a full-screen spinner for that whole round trip for
 * EVERY first-time visitor, which is exactly the person a marketing page exists for: the
 * prerendered head arrived at ~0.6 s and the first pixel of content at ~2.5 s. A returning
 * visitor was fine, because the persisted query cache restores the last answer and the route
 * renders from it while the check runs in the background.
 *
 * So the home route now paints the landing page immediately while the check is in flight,
 * UNLESS this hint says a session was seen here before. The hint is what stops a coach whose
 * persisted cache has aged out (24 h, queryClient.ts) from seeing the marketing page flash for
 * half a second before their dashboard: with the hint set, the route keeps the spinner, as it
 * always did. Without it -- a new browser, a private window, cleared site data -- the person is
 * overwhelmingly a visitor, and the one person it guesses wrong about (signed in, cache gone,
 * hint gone too) sees the landing page for one round trip and is then redirected.
 *
 * It is a HINT, not auth: it decides what to draw while waiting, never who is signed in. It is
 * written when /api/auth/me answers with a user, cleared when it answers null (sign-out, an
 * expired session), and every read is wrapped because localStorage throws in some private
 * windows and failing open as "no hint" is the right way round (a spinner is never wrong, just
 * slow).
 */
export const SESSION_HINT_KEY = "forge:had-session";

export function hasSessionHint(): boolean {
  try {
    return window.localStorage.getItem(SESSION_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberSessionState(signedIn: boolean): void {
  try {
    if (signedIn) window.localStorage.setItem(SESSION_HINT_KEY, "1");
    else window.localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    /* no storage, no hint */
  }
}
