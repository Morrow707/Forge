import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { apiRequest, getNativeToken, setNativeToken } from "./queryClient";

/**
 * THE PHONE'S SIGN-IN LASTS 30 DAYS FROM THE LAST TIME THE APP WAS USED, NOT FROM SIGN-IN.
 *
 * The native token carries its own expiry (server/auth.ts, signNativeToken) and was never renewed,
 * so a daily user met the login screen every 30 days. When the app opens or comes back to the
 * screen and the token has been held more than a day, it asks for a fresh one for the same
 * session (POST /api/auth/native-token/renew). Best-effort: a failed renewal changes nothing, and
 * the token it would have replaced keeps working until its own expiry.
 */

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const RENEW_WHEN_OLDER_THAN_MS = 24 * 60 * 60 * 1000;

/** Milliseconds until a token expires, read from its own payload; null if unreadable. */
export function nativeTokenMsLeft(token: string, now = Date.now()): number | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const expiresAt = Number(parts[2]);
  return Number.isFinite(expiresAt) ? expiresAt - now : null;
}

export function nativeTokenWantsRenewal(token: string | null, now = Date.now()): boolean {
  if (!token) return false;
  const left = nativeTokenMsLeft(token, now);
  if (left === null || left <= 0) return false;
  return TOKEN_TTL_MS - left > RENEW_WHEN_OLDER_THAN_MS;
}

let inFlight: Promise<void> | null = null;

export function renewNativeTokenIfAging(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  if (inFlight) return inFlight;
  const token = getNativeToken();
  if (!nativeTokenWantsRenewal(token)) return Promise.resolve();
  inFlight = (async () => {
    try {
      const res = await apiRequest("POST", "/api/auth/native-token/renew");
      const body = (await res.json()) as { nativeToken?: string };
      // Only replace the token this renewal was asked for: a sign-out or a new sign-in while the
      // request was in flight has already written the answer that counts.
      if (body.nativeToken && getNativeToken() === token) setNativeToken(body.nativeToken);
    } catch {
      // Best-effort. The current token stays and still works.
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

let listening = false;

/** Renew now if due, and again each time the app comes back to the screen. Idempotent. */
export function startNativeTokenRenewal(): void {
  if (!Capacitor.isNativePlatform()) return;
  void renewNativeTokenIfAging();
  if (listening) return;
  listening = true;
  void CapacitorApp.addListener("resume", () => {
    void renewNativeTokenIfAging();
  });
}
