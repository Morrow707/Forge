import { Capacitor } from "@capacitor/core";
import { getNativeToken } from "./queryClient";

/**
 * WHO WAS SIGNED IN ON THIS PHONE LAST TIME, so a cold launch draws the app at once instead of a
 * spinner for the /api/auth/me round trip (2026-11-16, Scott: "speed up opening the app").
 *
 * /api/auth/me is kept OUT of the persisted query cache on purpose (queryClient.ts): a restored
 * "not signed in" snapshot once bounced a signed-in user to login. This is the other half and is
 * safe for the reasons that one was not: it only ever stores a SIGNED-IN answer, it is only used
 * when the phone still holds a sign-in token naming the SAME account, and it is only a
 * placeholder -- the real check still runs, and its answer (signed out, or a failed check)
 * replaces it. Native only; the web keeps its cookie and its spinner.
 */
const KEY = "forge-last-signed-in-user";

function tokenUserId(): number | null {
  const token = getNativeToken();
  if (!token) return null;
  const id = Number(token.split(".")[0]);
  return Number.isInteger(id) ? id : null;
}

export function readLastSignedInUser<T extends { id: number }>(): T | undefined {
  if (!Capacitor.isNativePlatform()) return undefined;
  const owner = tokenUserId();
  if (owner === null) return undefined;
  try {
    const raw = window.localStorage.getItem(KEY);
    const user = raw ? (JSON.parse(raw) as T) : undefined;
    return user && user.id === owner ? user : undefined;
  } catch {
    return undefined;
  }
}

export function rememberSignedInUser(user: { id: number } | null): void {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (user) window.localStorage.setItem(KEY, JSON.stringify(user));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Best-effort: without it a launch shows the spinner, as before.
  }
}
