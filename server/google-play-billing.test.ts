import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  buildServiceAccountJwt,
  decodeRtdnPush,
  interpretSubscriptionV2,
  readServiceAccount,
  rtdnPushAuthorized,
  tierForGooglePlayProductId,
  addOnForGooglePlayProductId,
} from "./google-play-billing";
import {
  ALL_FREE_AGENT_TIER_IDS,
  FREE_AGENT_ADD_ON_ORDER,
  GOOGLE_PLAY_PACKAGE_NAME,
  googlePlayProductIdForFreeAgentAddOn,
  googlePlayProductIdForFreeAgentTier,
} from "@shared/free-agent-tiers";

// The Android twin of apple-iap.ts, held to the same rules: nothing is granted that Google did
// not confirm, every product ever sold is recognised, and a notification is only a reason to
// re-ask Google, never a fact in itself.
describe("Google Play Billing", () => {
  it("every tier and add-on has a Play product id Play will accept, and both map back", () => {
    for (const tier of ALL_FREE_AGENT_TIER_IDS) {
      const id = googlePlayProductIdForFreeAgentTier(tier);
      expect(id).toMatch(/^[a-z][a-z0-9_.]*$/);
      expect(tierForGooglePlayProductId(id)).toBe(tier);
      expect(addOnForGooglePlayProductId(id)).toBeNull();
    }
    for (const addOn of FREE_AGENT_ADD_ON_ORDER) {
      const id = googlePlayProductIdForFreeAgentAddOn(addOn);
      expect(id).toMatch(/^[a-z][a-z0-9_.]*$/);
      expect(addOnForGooglePlayProductId(id)).toBe(addOn);
      expect(tierForGooglePlayProductId(id)).toBeNull();
    }
    expect(tierForGooglePlayProductId("freeagent_nope")).toBeNull();
  });

  it("signs the service-account JWT with RS256 so Google's token endpoint can verify it", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const jwt = buildServiceAccountJwt({ client_email: "svc@example.iam.gserviceaccount.com", private_key: pem }, 1_700_000_000);
    const [header, claims, signature] = jwt.split(".");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64"))).toBe(true);
    const decoded = JSON.parse(Buffer.from(claims, "base64").toString("utf8"));
    expect(decoded.scope).toBe("https://www.googleapis.com/auth/androidpublisher");
    expect(decoded.exp - decoded.iat).toBe(3600);
  });

  it("reads the service account from raw JSON or base64, and fails closed on anything else", () => {
    const json = JSON.stringify({ client_email: "a@b", private_key: "-----BEGIN PRIVATE KEY-----" });
    expect(readServiceAccount({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: json })?.client_email).toBe("a@b");
    expect(readServiceAccount({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: Buffer.from(json).toString("base64") })?.client_email).toBe("a@b");
    expect(readServiceAccount({})).toBeNull();
    expect(readServiceAccount({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: "{}" })).toBeNull();
    expect(readServiceAccount({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: "not json" })).toBeNull();
  });

  it("grants only an active, grace-period or cancelled-but-paid subscription for a product the app sells", () => {
    const product = googlePlayProductIdForFreeAgentTier("basic");
    const expiry = "2030-01-01T00:00:00Z";
    const active = interpretSubscriptionV2("tok", {
      subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
      lineItems: [{ productId: product, expiryTime: expiry }],
      latestOrderId: "GPA.1",
    });
    expect(active?.productId).toBe(product);
    expect(active?.state).toBe("active");
    expect(active?.isTestPurchase).toBe(false);
    expect(active?.expiresAt.toISOString()).toBe("2030-01-01T00:00:00.000Z");
    expect(interpretSubscriptionV2("tok", { subscriptionState: "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", lineItems: [{ productId: product, expiryTime: expiry }] })?.state).toBe("in_grace_period");
    expect(interpretSubscriptionV2("tok", { subscriptionState: "SUBSCRIPTION_STATE_CANCELED", lineItems: [{ productId: product, expiryTime: expiry }] })?.state).toBe("canceled");
    expect(interpretSubscriptionV2("tok", { subscriptionState: "SUBSCRIPTION_STATE_EXPIRED", lineItems: [{ productId: product, expiryTime: expiry }] })).toBeNull();
    expect(interpretSubscriptionV2("tok", { subscriptionState: "SUBSCRIPTION_STATE_ON_HOLD", lineItems: [{ productId: product, expiryTime: expiry }] })).toBeNull();
    expect(interpretSubscriptionV2("tok", { subscriptionState: "SUBSCRIPTION_STATE_ACTIVE", lineItems: [{ productId: "someone_elses_product", expiryTime: expiry }] })).toBeNull();
    expect(interpretSubscriptionV2("tok", { subscriptionState: "SUBSCRIPTION_STATE_ACTIVE", lineItems: [{ productId: product }] })).toBeNull();
    expect(interpretSubscriptionV2("tok", { subscriptionState: "SUBSCRIPTION_STATE_ACTIVE", testPurchase: {}, lineItems: [{ productId: product, expiryTime: expiry }] })?.isTestPurchase).toBe(true);
  });

  it("decodes a Pub/Sub push into renewed, revoked or ignored, and refuses another app's package", () => {
    const push = (payload: unknown) => ({ message: { data: Buffer.from(JSON.stringify(payload)).toString("base64") } });
    const sub = (notificationType: number) => ({
      packageName: GOOGLE_PLAY_PACKAGE_NAME,
      subscriptionNotification: { notificationType, purchaseToken: "tok", subscriptionId: "freeagent_basic" },
    });
    expect(decodeRtdnPush(push(sub(2)))?.kind).toBe("renewed");
    expect(decodeRtdnPush(push(sub(4)))?.kind).toBe("renewed");
    expect(decodeRtdnPush(push(sub(13)))?.kind).toBe("revoked");
    expect(decodeRtdnPush(push(sub(12)))?.kind).toBe("revoked");
    expect(decodeRtdnPush(push(sub(6)))?.kind).toBe("ignored"); // IN_GRACE_PERIOD: access unchanged
    expect(decodeRtdnPush(push({ packageName: GOOGLE_PLAY_PACKAGE_NAME, testNotification: { version: "1.0" } }))?.kind).toBe("ignored");
    expect(decodeRtdnPush(push({ ...sub(2), packageName: "com.other.app" }))).toBeNull();
    expect(decodeRtdnPush({ message: {} })).toBeNull();
    expect(decodeRtdnPush({ message: { data: "@@not-base64-json@@" } })).toBeNull();
  });

  it("the push is accepted only with the shared token, and never when none is configured", () => {
    expect(rtdnPushAuthorized("abc", { GOOGLE_PLAY_RTDN_TOKEN: "abc" })).toBe(true);
    expect(rtdnPushAuthorized("abd", { GOOGLE_PLAY_RTDN_TOKEN: "abc" })).toBe(false);
    expect(rtdnPushAuthorized("", { GOOGLE_PLAY_RTDN_TOKEN: "" })).toBe(false);
    expect(rtdnPushAuthorized(undefined, {})).toBe(false);
  });

  it("the webhook re-asks Google about the token before writing, and the verify route checks the product matches", () => {
    const index = readFileSync("server/index.ts", "utf8");
    const hook = index.slice(index.indexOf('"/api/webhooks/google-play"'));
    expect(hook.indexOf("verifyGooglePlayPurchase(")).toBeGreaterThan(0);
    expect(hook.indexOf("verifyGooglePlayPurchase(")).toBeLessThan(hook.indexOf("applyGooglePlayNotification("));
    expect(hook.indexOf("rtdnPushAuthorized(")).toBeLessThan(hook.indexOf("decodeRtdnPush("));
    const routes = readFileSync("server/routes.ts", "utf8");
    const route = routes.slice(routes.indexOf('"/api/athlete/google-play/verify"'));
    expect(route.indexOf("verified.productId !== parsed.data.productId")).toBeLessThan(route.indexOf("applyGooglePlayVerification("));
  });

  it("the Android plugin never grants on its own: acknowledge is a separate call made after the server verified", () => {
    const bridge = readFileSync("client/src/lib/google-play-billing.ts", "utf8");
    const verifyAt = bridge.indexOf('"/api/athlete/google-play/verify"');
    const ackAt = bridge.indexOf("GooglePlayBilling.acknowledge(");
    expect(verifyAt).toBeGreaterThan(0);
    expect(ackAt).toBeGreaterThan(verifyAt);
    const java = readFileSync("android/app/src/main/java/com/foreperformancesystems/forge/GooglePlayBillingPlugin.java", "utf8");
    expect(java).toContain('@CapacitorPlugin(name = "GooglePlayBilling")');
    expect(java).toContain("acknowledgePurchase(");
    expect(readFileSync("android/app/src/main/java/com/foreperformancesystems/forge/MainActivity.java", "utf8")).toContain("registerPlugin(GooglePlayBillingPlugin.class)");
    expect(readFileSync("android/app/build.gradle", "utf8")).toContain("com.android.billingclient:billing:");
  });
});
