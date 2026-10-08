// StoreKit 2 (iOS App Store subscription) verification, real implementation
// on top of Apple's own @apple/app-store-server-library -- handles the JWS
// (JSON Web Signature) decode + certificate-chain verification against
// Apple's root CA that server/apple-iap.ts's earlier scaffolding comment
// documented as the actual hard part. Two things this still can't do for
// you:
//   1. The App Store Connect subscription group + three real Products
//      (matching appleProductIdForFreeAgentTier's ids) have to exist before
//      any real transaction can ever reach this code -- see that function's
//      own comment in shared/free-agent-tiers.ts.
//   2. Apple's root certificate itself has to be present on disk at
//      server/apple-root-certs/AppleRootCA-G3.cer -- see that directory's
//      README for the one-line fetch. It's a public, non-secret file (the
//      same root every browser and OS already trusts), just not something
//      this server can fetch for itself in every environment, so it's a
//      committed asset rather than a runtime download.
//
// Still governed by the same two-flag "ready, not live" posture as the rest
// of billing: APPLE_IAP_LIVE gates whether the client shows any purchase UI
// at all (see GET /api/config/billing in routes.ts), and PAYWALLS_DISABLED
// keeps every feature free regardless of subscription state during beta.
// Neither flag changes anything in this file -- verification either works
// or fails closed, independent of whether anything is actually paywalled.

import fs from "fs";
import path from "path";
import {
  SignedDataVerifier,
  Environment,
  NotificationTypeV2,
  Subtype,
  VerificationException,
  VerificationStatus,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import {
  APPLE_BUNDLE_ID,
  ALL_FREE_AGENT_TIER_IDS,
  FREE_AGENT_TIERS,
  FREE_AGENT_ADD_ON_ORDER,
  appleProductIdForFreeAgentTier,
  appleProductIdForFreeAgentAddOn,
  appleProductIdForCoachAddOn,
  type FreeAgentTierId, RETIRED_APPLE_PRODUCT_IDS } from "@shared/free-agent-tiers";
import { COACH_PURCHASABLE_ADD_ON_ORDER } from "@shared/billing-tiers";

export const APPLE_IAP_LIVE = process.env.APPLE_IAP_LIVE === "true";

// TestFlight and every real device using a Sandbox tester Apple ID transact
// through Apple's Sandbox environment REGARDLESS of whether this server
// itself is running in production (NODE_ENV) -- that's exactly the
// distinction SignedDataVerifier's environment param exists to check, so it
// can't be derived from NODE_ENV without rejecting every real transaction
// during the entire beta/TestFlight phase. Defaults to sandbox, matching
// "still in beta" -- flip to "production" only once this is a real App
// Store release being bought by real customers, not testers.
const APPLE_IAP_ENVIRONMENT: Environment =
  process.env.APPLE_IAP_ENVIRONMENT === "production" ? Environment.PRODUCTION : Environment.SANDBOX;

const APPLE_ROOT_CERT_PATH = path.join(process.cwd(), "server/apple-root-certs/AppleRootCA-G3.cer");

// The App Store Connect numeric app id ("Apple ID" on the app's General
// Information page). Only needed in the production environment, where the
// verifier library requires it -- it throws
// "appAppleId is required when the environment is Production" from its own
// constructor otherwise. That throw is the reason this exists: flipping
// APPLE_IAP_ENVIRONMENT to production without also setting this would leave
// real, charged purchases unverifiable, which is the one failure mode worse
// than not selling anything -- the athlete pays Apple and Forge never grants
// what they paid for.
const APPLE_APP_APPLE_ID = process.env.APPLE_APP_APPLE_ID
  ? Number(process.env.APPLE_APP_APPLE_ID)
  : undefined;

export type VerifiedAppleTransaction = {
  originalTransactionId: string;
  productId: string;
  expiresAt: Date;
  /** Which StoreKit environment the transaction was actually made in, as
   * Apple stamped it -- not what this server was configured to expect.
   * Sandbox means no money changed hands, which is every TestFlight and
   * simulator purchase. Recorded so a beta-era grant is still
   * distinguishable from a paid one long after the fact: everything else
   * written for the two is identical (status "active", a real period end),
   * and by the time that distinction matters nobody will remember which
   * rows came from which. */
  environment: string;
};

// ONE VERIFIER PER ENVIRONMENT, PRODUCTION TRIED FIRST, SANDBOX AS THE FALLBACK (2026-10-08).
// Apple's library binds a SignedDataVerifier to ONE environment and throws
// VerificationException(INVALID_ENVIRONMENT) for a payload signed in the other. With a single
// verifier, the launch-day switch to "production" would have refused every sandbox-signed
// purchase from that moment -- and App Review tests in-app purchases in the SANDBOX, as does
// every TestFlight tester and every sandbox Apple ID Scott uses. The reviewer would have paid
// at the sheet and been told "could not be verified". Apple's own guidance for exactly this is
// to verify against production and, on an environment mismatch, retry against sandbox; that is
// what verifyWithFallback does, in that order, and only that order. While the configured
// environment is sandbox there is no production verifier to build (it needs APPLE_APP_APPLE_ID)
// and none is tried. Every grant records which environment Apple stamped on the transaction,
// so a sandbox purchase verified on a production server is distinguishable forever.
const verifiers: Partial<Record<Environment, SignedDataVerifier | null>> = {};
let rootCertCache: Buffer | null | undefined;

function readRootCert(): Buffer | null {
  if (rootCertCache !== undefined) return rootCertCache;
  try {
    rootCertCache = fs.readFileSync(APPLE_ROOT_CERT_PATH);
  } catch {
    console.error(
      `Apple IAP: missing ${APPLE_ROOT_CERT_PATH} -- see server/apple-root-certs/README.md. ` +
        "Every Apple transaction/notification will fail verification until this is added.",
    );
    rootCertCache = null;
  }
  return rootCertCache;
}

// Lazy + memoized rather than constructed at module load -- a missing root
// cert file shouldn't crash the whole server on boot, just make every
// verification attempt fail closed with a clear, one-time log instead of a
// silent null forever. A misconfiguration (production with no app id) fails
// the same way: legible in the log, never thrown out of a request.
function getVerifier(environment: Environment = APPLE_IAP_ENVIRONMENT): SignedDataVerifier | null {
  if (environment in verifiers) return verifiers[environment] ?? null;
  const rootCert = readRootCert();
  if (!rootCert) {
    verifiers[environment] = null;
    return null;
  }
  try {
    verifiers[environment] = new SignedDataVerifier([rootCert], true, environment, APPLE_BUNDLE_ID, APPLE_APP_APPLE_ID);
  } catch (err) {
    console.error(
      `Apple IAP: could not build the ${environment} verifier --`,
      err instanceof Error ? err.message : err,
      environment === Environment.PRODUCTION && APPLE_APP_APPLE_ID === undefined
        ? "Set APPLE_APP_APPLE_ID (the numeric App Store Connect app id) -- it is required in the production environment."
        : "",
    );
    verifiers[environment] = null;
  }
  return verifiers[environment] ?? null;
}

/** The environments to try, in order: the configured one, then sandbox when the configured one
 * is production. Exported for the test; nothing else reads it. */
export function verifierEnvironmentsToTry(configured: Environment = APPLE_IAP_ENVIRONMENT): Environment[] {
  return configured === Environment.PRODUCTION ? [Environment.PRODUCTION, Environment.SANDBOX] : [Environment.SANDBOX];
}

function isEnvironmentMismatch(err: unknown): boolean {
  return err instanceof VerificationException && err.status === VerificationStatus.INVALID_ENVIRONMENT;
}

/** Runs `verify` against the configured environment's verifier and, on an environment
 * mismatch alone, against the sandbox verifier. Any other failure is thrown as it was, so a
 * bad signature is still a bad signature. Returns the verifier that ACCEPTED the payload
 * beside the result, because a notification carries a nested transaction that has to be
 * decoded by the same one. Throws when no verifier could be built at all. */
async function verifyWithFallback<T>(
  verify: (verifier: SignedDataVerifier) => Promise<T>,
): Promise<{ result: T; verifier: SignedDataVerifier; environment: Environment } | null> {
  let lastMismatch: unknown = null;
  let tried = 0;
  for (const environment of verifierEnvironmentsToTry()) {
    const verifier = getVerifier(environment);
    if (!verifier) continue;
    tried++;
    try {
      const result = await verify(verifier);
      if (environment !== APPLE_IAP_ENVIRONMENT) {
        console.warn(`Apple IAP: payload verified in ${environment} while this server is configured for ${APPLE_IAP_ENVIRONMENT} (a sandbox tester or App Review)`);
      }
      return { result, verifier, environment };
    } catch (err) {
      if (isEnvironmentMismatch(err)) {
        lastMismatch = err;
        continue;
      }
      throw err;
    }
  }
  if (tried === 0) return null;
  throw lastMismatch ?? new VerificationException(VerificationStatus.INVALID_ENVIRONMENT);
}

/** The one real caller (POST /api/athlete/apple-iap/verify in routes.ts)
 * fails closed on null -- a bad/forged/unparseable signedTransactionInfo,
 * a missing root cert, or a transaction for a product this app doesn't
 * recognize all resolve the same way: no entitlement is ever granted for
 * something that wasn't cryptographically verified end to end. */
/** Why a transaction was not verified. Each one is answered differently by the route
 * (appleVerifyRefusal) and by the phone: only "retired_product" tells the app to FINISH the
 * transaction so StoreKit stops replaying it; every other refusal leaves it unfinished, which is
 * the recoverable state. */
export type AppleVerifyRefusalReason = "not_configured" | "incomplete" | "unknown_product" | "retired_product" | "invalid";

export type AppleVerifyResult =
  | { ok: true; transaction: VerifiedAppleTransaction }
  | { ok: false; reason: AppleVerifyRefusalReason; productId?: string };

export async function verifyAppleTransaction(signedTransactionInfo: string): Promise<AppleVerifyResult> {
  try {
    const verified = await verifyWithFallback((v) => v.verifyAndDecodeTransaction(signedTransactionInfo));
    if (!verified) return { ok: false, reason: "not_configured" };
    const decoded = verified.result;
    if (!decoded.originalTransactionId || !decoded.productId || decoded.expiresDate == null) {
      console.error("Apple IAP: transaction decoded without an id, a product or an expiry", {
        originalTransactionId: decoded.originalTransactionId,
        productId: decoded.productId,
        expiresDate: decoded.expiresDate,
        environment: decoded.environment,
      });
      return { ok: false, reason: "incomplete", productId: decoded.productId };
    }
    // Every product Forge sells at Apple, not only the tiers. The first version of this check
    // asked tierForAppleProductId alone, which refused All Classes and Coaches Corner with a 502
    // ("isn't set up yet") the moment they went on sale, Apple having already taken the money.
    // Which KIND of product it is gets decided in applyAppleIapVerification; here the question
    // is only whether it is ours.
    if (isRetiredAppleProductId(decoded.productId)) {
      console.warn("Apple IAP: transaction for a retired product; the app will finish it", decoded.productId, decoded.environment);
      return { ok: false, reason: "retired_product", productId: decoded.productId };
    }
    if (!isKnownAppleProductId(decoded.productId)) {
      console.error("Apple IAP: transaction for a product this app does not sell", decoded.productId, decoded.environment);
      return { ok: false, reason: "unknown_product", productId: decoded.productId };
    }
    return {
      ok: true,
      transaction: {
        originalTransactionId: decoded.originalTransactionId,
        productId: decoded.productId,
        expiresAt: new Date(decoded.expiresDate),
        environment: String(decoded.environment ?? "unknown"),
      },
    };
  } catch (err) {
    console.error(
      "Apple IAP: transaction verification failed",
      err instanceof Error ? err.message : err,
      `(verifier environment ${APPLE_IAP_ENVIRONMENT}, bundle ${APPLE_BUNDLE_ID})`,
    );
    return { ok: false, reason: "invalid" };
  }
}

/** The HTTP answer for each refusal, shared by both verify routes. 502 is reserved for the
 * verifier not being configured -- it used to be the answer for EVERY refusal, so a transaction
 * for a product this app does not sell read as "Apple In-App Purchase isn't set up yet" on a
 * server where it was set up fine (build 643's console, 2026-10-08). 410 is the one the phone
 * acts on: a retired product is finished with StoreKit and never sent again. */
export function appleVerifyRefusal(refusal: Extract<AppleVerifyResult, { ok: false }>): { status: number; body: { message: string; retired?: true } } {
  switch (refusal.reason) {
    case "not_configured":
      return { status: 502, body: { message: "Apple In-App Purchase isn't set up yet." } };
    case "retired_product":
      return { status: 410, body: { message: `${refusal.productId ?? "This product"} is no longer sold; nothing is owed on it.`, retired: true } };
    case "unknown_product":
      return { status: 422, body: { message: `Forge does not sell ${refusal.productId ?? "this product"} in the app.` } };
    case "incomplete":
      return { status: 422, body: { message: "That purchase could not be read." } };
    case "invalid":
      return { status: 422, body: { message: "That purchase could not be verified with Apple." } };
  }
}

/** The product ids Forge sells at Apple: every tier ever sold, the Free Agent add-ons and the
 * coach add-ons, each derived from the same shared lists the client and the storage layer
 * read. */
export const KNOWN_APPLE_PRODUCT_IDS: ReadonlySet<string> = new Set([
  ...ALL_FREE_AGENT_TIER_IDS.map((tier) => appleProductIdForFreeAgentTier(tier)),
  ...FREE_AGENT_ADD_ON_ORDER.map((addOn) => appleProductIdForFreeAgentAddOn(addOn)),
  ...COACH_PURCHASABLE_ADD_ON_ORDER.map((addOn) => appleProductIdForCoachAddOn(addOn)),
]);

export function isKnownAppleProductId(productId: string): boolean {
  return KNOWN_APPLE_PRODUCT_IDS.has(productId);
}

export function isRetiredAppleProductId(productId: string): boolean {
  return RETIRED_APPLE_PRODUCT_IDS.includes(productId);
}

// Built from appleProductIdForFreeAgentTier rather than a second hand-typed
// table -- the earlier version of this file had its own literal product-id
// strings that quietly drifted out of sync with the real pricing model
// (shared/free-agent-tiers.ts moved to basic/ai_coach/ai_coach_video while
// this file kept mapping stale "base"/"pro"-named ids that didn't
// correspond to anything actually priced). One source, both directions.
//
// ALL_FREE_AGENT_TIER_IDS, NOT FREE_AGENT_TIER_ORDER, AND THE DIFFERENCE IS SOMEBODY'S
// SUBSCRIPTION. The order list is what is currently FOR SALE; AI Coach + Video was withdrawn
// from it on 2026-09-19 while the camera is unreliable. Athletes already paying for it still
// send that product id on every renewal and every restore, and a map built from the sale list
// would return null for them -- which reads as "unknown product", grants nothing, and quietly
// strips video form-check from a customer who is still being charged for it.
//
// Withdrawing a tier must never be able to do that. This map is about RECOGNISING what somebody
// bought, which has nothing to do with whether it is still on the price list.
const PRODUCT_ID_TO_TIER: Record<string, FreeAgentTierId> = Object.fromEntries(
  ALL_FREE_AGENT_TIER_IDS.map((tier) => [appleProductIdForFreeAgentTier(tier), tier]),
);

export function tierForAppleProductId(productId: string): FreeAgentTierId | null {
  return PRODUCT_ID_TO_TIER[productId] ?? null;
}

// subscriptions.tier (see shared/schema.ts) stores a coarse "base"|"pro"
// ENTITLEMENT level, not the customer-facing SKU -- the same column and
// vocabulary a coach's Stripe subscription also uses for an unrelated
// purpose (Coaches Corner access). Multiple Free Agent SKUs can carry the
// same entitlement: ai_coach_video includes video form-check (see
// FREE_AGENT_TIERS), so it grants "pro" here, matching
// the subscription row's own base/pro column, which is what the coach-side
// Coaches Corner gate still reads. Free Agent AI access no longer consults it
// at all -- hasAthletePaidForAiAccess reads the purchased SKU through
// entitlementsForFreeAgentTier, since base/pro cannot express three tiers --
// so this is now only about keeping the column meaningful, not about gating.
export function entitlementTierForFreeAgentTier(tier: FreeAgentTierId): "base" | "pro" {
  return FREE_AGENT_TIERS[tier].hasVideoFormCheck ? "pro" : "base";
}

// ---------- Apple Server Notifications V2 ----------
// Server-to-server renewal/cancellation/refund events -- without this, a
// subscription's currentPeriodEnd/status only ever update at the moment the
// athlete happens to reopen the app and re-verify, same gap Stripe's own
// webhook closes for the coach side. Registered in server/index.ts before
// express.json() the same way the Stripe webhook is, since JWS
// verification needs the raw signedPayload string, not a parsed body.
// Which notification types actually change subscription state this app
// cares about -- SUBSCRIBED/DID_RENEW extend access, EXPIRED/REVOKE/REFUND
// end it, DID_FAIL_TO_RENEW/GRACE_PERIOD_EXPIRED are Apple's own retry
// signals (no action needed here; currentPeriodEnd already reflects the
// real access window either way). Everything else (price changes, consent,
// metadata) doesn't touch entitlement and is deliberately ignored.
const RENEWAL_TYPES = new Set<string>([NotificationTypeV2.SUBSCRIBED, NotificationTypeV2.DID_RENEW]);
const REVOCATION_TYPES = new Set<string>([
  NotificationTypeV2.EXPIRED,
  NotificationTypeV2.REVOKE,
  NotificationTypeV2.REFUND,
]);

export type VerifiedAppleNotification = {
  kind: "renewed" | "revoked" | "ignored";
  notificationType: string;
  transaction: VerifiedAppleTransaction | null;
};

/** Verifies the notification's outer signedPayload, then -- for the two
 * kinds this app actually acts on -- the embedded signedTransactionInfo
 * too. The outer envelope proves Apple sent this notification; the inner
 * transaction proves which real subscription it's about (originalTransactionId
 * is how storage.updateSubscriptionByAppleOriginalTransactionId finds the
 * row), so a renewed/revoked classification with no verified transaction
 * inside it is treated as unverified, not silently applied. Returns null on
 * any verification failure -- same fail-closed contract as
 * verifyAppleTransaction. */
export async function verifyAppleNotification(signedPayload: string): Promise<VerifiedAppleNotification | null> {
  try {
    const verified = await verifyWithFallback((v) => v.verifyAndDecodeNotification(signedPayload));
    if (!verified) return null;
    const { verifier } = verified;
    const payload: ResponseBodyV2DecodedPayload = verified.result;
    const notificationType = payload.notificationType ?? "";
    const kind: VerifiedAppleNotification["kind"] = RENEWAL_TYPES.has(notificationType)
      ? "renewed"
      : REVOCATION_TYPES.has(notificationType)
        ? "revoked"
        : "ignored";
    if (kind === "ignored") return { kind, notificationType, transaction: null };

    const signedTransactionInfo = payload.data?.signedTransactionInfo;
    if (!signedTransactionInfo) return null;
    const decodedTx = await verifier.verifyAndDecodeTransaction(signedTransactionInfo);
    if (!decodedTx.originalTransactionId || !decodedTx.productId || decodedTx.expiresDate == null) return null;
    return {
      kind,
      notificationType,
      transaction: {
        originalTransactionId: decodedTx.originalTransactionId,
        productId: decodedTx.productId,
        expiresAt: new Date(decodedTx.expiresDate),
        environment: String(decodedTx.environment ?? "unknown"),
      },
    };
  } catch (err) {
    console.error("Apple IAP: notification verification failed", err);
    return null;
  }
}
