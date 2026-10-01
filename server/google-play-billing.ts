// Google Play Billing verification -- the Android twin of server/apple-iap.ts, same posture:
// the phone's purchase sheet never grants anything; a purchase token is sent here, this file
// asks Google's Play Developer API what that token is worth, and only a token Google confirms
// as an active subscription for a product this app sells becomes an entitlement. Fails closed
// on everything else: no service account, an unknown product, a token Google rejects, an
// expired subscription.
//
// Two flags, as on the Apple side. GOOGLE_PLAY_BILLING_LIVE gates whether the Android app shows
// a purchase UI at all (GET /api/billing/google-play-enabled); nothing in this file reads it.
// GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is the Play Console service account's key file (raw JSON
// or base64), with "View financial data" and the app's subscription access, and without it
// every verification returns null.
//
// Google's API is called with a JWT signed here by Node's own crypto (RS256, the service
// account's private key) exchanged for an access token -- a hundred lines that save a client
// library the server has no other use for. One token is cached for its lifetime.
//
// Real-time developer notifications (RTDN) arrive through a Pub/Sub push subscription at
// POST /api/webhooks/google-play (server/index.ts). The message carries only a purchase token
// and a notification type, never the subscription's state, so every notification is answered
// by re-asking the API about the token; the push itself is accepted only with the shared
// GOOGLE_PLAY_RTDN_TOKEN in its query string, which is how a push subscription without OIDC
// is authenticated.

import { createSign } from "node:crypto";
import {
  ALL_FREE_AGENT_TIER_IDS,
  FREE_AGENT_ADD_ON_ORDER,
  GOOGLE_PLAY_PACKAGE_NAME,
  googlePlayProductIdForFreeAgentAddOn,
  googlePlayProductIdForFreeAgentTier,
  type FreeAgentAddOnId,
  type FreeAgentTierId,
} from "@shared/free-agent-tiers";

export const GOOGLE_PLAY_BILLING_LIVE = process.env.GOOGLE_PLAY_BILLING_LIVE === "true";

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

export function readServiceAccount(env: NodeJS.ProcessEnv = process.env): ServiceAccount | null {
  const raw = (env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ?? "").trim();
  if (!raw) return null;
  const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.client_email !== "string" || typeof parsed?.private_key !== "string") return null;
    return parsed as ServiceAccount;
  } catch {
    return null;
  }
}

const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const TOKEN_URI = "https://oauth2.googleapis.com/token";

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** The signed JWT a service account trades for an access token. Exported for the test. */
export function buildServiceAccountJwt(account: ServiceAccount, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: SCOPE,
      aud: account.token_uri ?? TOKEN_URI,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(account.private_key));
  return `${header}.${claims}.${signature}`;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(fetchImpl: typeof fetch): Promise<string | null> {
  const account = readServiceAccount();
  if (!account) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: buildServiceAccountJwt(account),
  });
  const res = await fetchImpl(account.token_uri ?? TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    console.error("Google Play Billing: token exchange failed", res.status);
    return null;
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return json.access_token;
}

export type VerifiedGooglePlayPurchase = {
  purchaseToken: string;
  productId: string;
  expiresAt: Date;
  /** "active" | "canceled" | "expired" | ... as Google reports subscriptionState, lowercased. */
  state: string;
  /** Google's test purchases (license testers) cost nobody anything, same as Apple's sandbox. */
  isTestPurchase: boolean;
  orderId: string | null;
};

const TIER_BY_PRODUCT: Record<string, FreeAgentTierId> = Object.fromEntries(
  ALL_FREE_AGENT_TIER_IDS.map((tier) => [googlePlayProductIdForFreeAgentTier(tier), tier]),
);
const ADD_ON_BY_PRODUCT: Record<string, FreeAgentAddOnId> = Object.fromEntries(
  FREE_AGENT_ADD_ON_ORDER.map((addOn) => [googlePlayProductIdForFreeAgentAddOn(addOn), addOn]),
);

export function tierForGooglePlayProductId(productId: string): FreeAgentTierId | null {
  return TIER_BY_PRODUCT[productId] ?? null;
}
export function addOnForGooglePlayProductId(productId: string): FreeAgentAddOnId | null {
  return ADD_ON_BY_PRODUCT[productId] ?? null;
}

/** The shape of purchases.subscriptionsv2.get that this file reads. */
export type SubscriptionV2Response = {
  subscriptionState?: string;
  testPurchase?: unknown;
  latestOrderId?: string;
  lineItems?: { productId?: string; expiryTime?: string }[];
};

/** Turns Google's answer into a verified purchase, or null when it is not one this app grants:
 * no line item for a product the app sells, no expiry, or a state that is not active or in its
 * grace period. Exported so the test can feed it Google's shapes without a network. */
export function interpretSubscriptionV2(purchaseToken: string, body: SubscriptionV2Response): VerifiedGooglePlayPurchase | null {
  const item = (body.lineItems ?? []).find(
    (li) => li.productId && (tierForGooglePlayProductId(li.productId) || addOnForGooglePlayProductId(li.productId)),
  );
  if (!item?.productId || !item.expiryTime) return null;
  const expiresAt = new Date(item.expiryTime);
  if (Number.isNaN(expiresAt.getTime())) return null;
  const state = String(body.subscriptionState ?? "").replace(/^SUBSCRIPTION_STATE_/, "").toLowerCase();
  // ACTIVE and IN_GRACE_PERIOD keep access; CANCELED keeps access until expiry (the row's
  // currentPeriodEnd carries that); everything else (EXPIRED, ON_HOLD, PAUSED, PENDING) grants
  // nothing here and is reported as revoked by the notification path.
  if (!["active", "in_grace_period", "canceled"].includes(state)) return null;
  return {
    purchaseToken,
    productId: item.productId,
    expiresAt,
    state,
    isTestPurchase: body.testPurchase != null,
    orderId: body.latestOrderId ?? null,
  };
}

/** Asks Google what a purchase token is worth. Null fails closed. */
export async function verifyGooglePlayPurchase(
  purchaseToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VerifiedGooglePlayPurchase | null> {
  if (!purchaseToken) return null;
  const token = await accessToken(fetchImpl);
  if (!token) return null;
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(GOOGLE_PLAY_PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error("Google Play Billing: subscriptionsv2.get failed", res.status);
    return null;
  }
  return interpretSubscriptionV2(purchaseToken, (await res.json()) as SubscriptionV2Response);
}

// ---------- Real-time developer notifications ----------
// https://developer.android.com/google/play/billing/rtdn-reference -- the numeric types this
// app acts on. Renewals and recoveries extend; revocations, expiries and holds end access.
const RENEWAL_TYPES = new Set([1, 2, 4, 7, 9]); // RECOVERED, RENEWED, PURCHASED, RESTARTED, DEFERRED
const REVOCATION_TYPES = new Set([3, 5, 10, 12, 13]); // CANCELED(keeps access to expiry; handled by state), ON_HOLD, PAUSED, REVOKED, EXPIRED

export type GooglePlayNotification = {
  kind: "renewed" | "revoked" | "ignored";
  notificationType: number;
  purchaseToken: string | null;
  subscriptionId: string | null;
};

/** Decodes a Pub/Sub push body ({ message: { data: base64 } }) into the notification this app
 * cares about. A test notification or a one-time product notification is "ignored". */
export function decodeRtdnPush(body: unknown): GooglePlayNotification | null {
  const data = (body as { message?: { data?: unknown } })?.message?.data;
  if (typeof data !== "string") return null;
  let payload: {
    packageName?: string;
    subscriptionNotification?: { notificationType?: number; purchaseToken?: string; subscriptionId?: string };
    testNotification?: unknown;
  };
  try {
    payload = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.packageName && payload.packageName !== GOOGLE_PLAY_PACKAGE_NAME) return null;
  const sub = payload.subscriptionNotification;
  if (!sub?.purchaseToken || typeof sub.notificationType !== "number") {
    return { kind: "ignored", notificationType: -1, purchaseToken: null, subscriptionId: null };
  }
  const type = sub.notificationType;
  const kind = RENEWAL_TYPES.has(type) ? "renewed" : REVOCATION_TYPES.has(type) ? "revoked" : "ignored";
  return { kind, notificationType: type, purchaseToken: sub.purchaseToken, subscriptionId: sub.subscriptionId ?? null };
}

/** The shared secret a Pub/Sub push subscription carries in its URL (?token=...). */
export function rtdnPushAuthorized(queryToken: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = (env.GOOGLE_PLAY_RTDN_TOKEN ?? "").trim();
  return expected.length > 0 && typeof queryToken === "string" && queryToken === expected;
}
