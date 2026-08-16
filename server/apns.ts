import crypto from "node:crypto";
import http2 from "node:http2";
import { storage } from "./storage";

// Native-app twin of push.ts (Web Push) -- same payload contract
// ({ title, body, url }), same "call sendXToUser, it silently no-ops if
// unconfigured" pattern, so notify.ts/rest-timer-push.ts don't need to know
// or care which transport(s) actually fire.
const teamId = process.env.APNS_TEAM_ID;
const keyId = process.env.APNS_KEY_ID;
// Apple hands this out with literal newlines; if it's ever pasted into an
// env var as a single line with escaped \n instead, this still works.
const privateKeyPem = process.env.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n");
const bundleId = process.env.APNS_BUNDLE_ID || "com.foreperformancesystems.forge";

export const apnsEnabled = Boolean(teamId && keyId && privateKeyPem);
if (!apnsEnabled) {
  console.warn(
    "Native push disabled: APNS_TEAM_ID / APNS_KEY_ID / APNS_PRIVATE_KEY not set.",
  );
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

// Apple's push auth token is a JWT signed with the APNs Auth Key (ES256).
// Reused for ~45 minutes at a time (Apple's own guidance: generate at most
// once an hour, tokens are valid up to an hour) rather than one per request
// -- Apple rate-limits/flags accounts that mint tokens too frequently.
let cachedToken: { token: string; issuedAt: number } | null = null;

function getAuthToken(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now - cachedToken.issuedAt < 45 * 60) return cachedToken.token;

  const header = { alg: "ES256", kid: keyId };
  const payload = { iss: teamId, iat: now };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  const sign = crypto.createSign("SHA256");
  sign.update(signingInput);
  sign.end();
  // JWS/JWT ES256 wants the raw (r || s) signature, not the DER encoding
  // Node's Sign class produces by default -- ieee-p1363 asks for that raw
  // form directly instead of hand-rolling a DER->raw conversion.
  const signature = sign.sign({ key: privateKeyPem!, dsaEncoding: "ieee-p1363" });

  const token = `${signingInput}.${base64url(signature)}`;
  cachedToken = { token, issuedAt: now };
  return token;
}

// APNs "BadDeviceToken"/"Unregistered" -- the same signal web-push gives us
// via a 404/410, meaning this specific device token is dead and should stop
// being sent to, same as removePushSubscription does for stale endpoints.
const DEAD_TOKEN_STATUSES = new Set([400, 410]);

function sendOne(
  deviceToken: string,
  payload: { title: string; body: string; url?: string; badge?: number },
): Promise<{ ok: boolean; shouldRemove: boolean }> {
  return new Promise((resolve) => {
    const client = http2.connect("https://api.push.apple.com");
    client.on("error", () => resolve({ ok: false, shouldRemove: false }));

    const body = JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: "default",
        ...(payload.badge !== undefined ? { badge: payload.badge } : {}),
      },
      url: payload.url || "/",
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${getAuthToken()}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "content-type": "application/json",
    });

    let status = 0;
    req.on("response", (headers) => {
      status = Number(headers[":status"]) || 0;
    });
    req.on("data", () => {}); // drain the (small, JSON-error-or-empty) response body
    req.on("end", () => {
      client.close();
      resolve({ ok: status === 200, shouldRemove: DEAD_TOKEN_STATUSES.has(status) });
    });
    req.on("error", () => {
      client.close();
      resolve({ ok: false, shouldRemove: false });
    });

    req.write(body);
    req.end();
  });
}

export async function sendApnsToUser(
  userId: number,
  payload: { title: string; body: string; url?: string; badge?: number },
) {
  if (!apnsEnabled) return;
  const tokens = await storage.getApnsTokensForUser(userId);
  await Promise.all(
    tokens.map(async (t) => {
      try {
        const { shouldRemove } = await sendOne(t.deviceToken, payload);
        if (shouldRemove) await storage.removeApnsToken(t.deviceToken);
      } catch (err) {
        console.error("APNs send failed:", err instanceof Error ? err.message : err);
      }
    }),
  );
}
