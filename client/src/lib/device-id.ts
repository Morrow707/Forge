/** The id this device is known by, for new-device approval.
 *
 * Generated once, kept in this browser's or app's own storage, sent on every request as the
 * X-Forge-Device-Id header (see authHeaders in queryClient.ts). The server stores only its hash
 * and uses it to answer "has this account signed in from here before?" -- see
 * server/trusted-devices.ts for the rule.
 *
 * It is NOT a fingerprint: nothing about the hardware goes into it, and clearing site data
 * makes this a new device, which is the honest answer. Signing out does not clear it -- the
 * server forgets the trust instead, so the id can be reused when the same person signs back in.
 *
 * Storage can be unavailable (private browsing on some configurations, a locked-down
 * WebView). Then the id lives for the page only, which means the email step on every sign-in
 * -- degraded, never broken.
 */
const KEY = "forge-device-id";
let inMemory: string | null = null;

function generate(): string {
  const c: Crypto = crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getDeviceId(): string {
  if (inMemory) return inMemory;
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored && stored.length >= 8) {
      inMemory = stored;
      return stored;
    }
    const fresh = generate();
    window.localStorage.setItem(KEY, fresh);
    inMemory = fresh;
    return fresh;
  } catch {
    inMemory = inMemory ?? generate();
    return inMemory;
  }
}
