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
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import {
  APPLE_BUNDLE_ID,
  FREE_AGENT_TIER_ORDER,
  FREE_AGENT_TIERS,
  appleProductIdForFreeAgentTier,
  type FreeAgentTierId,
} from "@shared/free-agent-tiers";

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

export type VerifiedAppleTransaction = {
  originalTransactionId: string;
  productId: string;
  expiresAt: Date;
};

let cachedVerifier: SignedDataVerifier | null = null;
let verifierInitAttempted = false;

// Lazy + memoized rather than constructed at module load -- a missing root
// cert file shouldn't crash the whole server on boot (this is still
// "framework, not required" until APPLE_IAP_LIVE and real App Store Connect
// products exist), just make every verification attempt fail closed with a
// clear, one-time log instead of a silent null forever.
function getVerifier(): SignedDataVerifier | null {
  if (cachedVerifier) return cachedVerifier;
  if (verifierInitAttempted) return null;
  verifierInitAttempted = true;
  let rootCert: Buffer;
  try {
    rootCert = fs.readFileSync(APPLE_ROOT_CERT_PATH);
  } catch {
    console.error(
      `Apple IAP: missing ${APPLE_ROOT_CERT_PATH} -- see server/apple-root-certs/README.md. ` +
        "Every Apple transaction/notification will fail verification until this is added.",
    );
    return null;
  }
  cachedVerifier = new SignedDataVerifier([rootCert], true, APPLE_IAP_ENVIRONMENT, APPLE_BUNDLE_ID);
  return cachedVerifier;
}

/** The one real caller (POST /api/athlete/apple-iap/verify in routes.ts)
 * fails closed on null -- a bad/forged/unparseable signedTransactionInfo,
 * a missing root cert, or a transaction for a product this app doesn't
 * recognize all resolve the same way: no entitlement is ever granted for
 * something that wasn't cryptographically verified end to end. */
export async function verifyAppleTransaction(signedTransactionInfo: string): Promise<VerifiedAppleTransaction | null> {
  const verifier = getVerifier();
  if (!verifier) return null;
  try {
    const decoded = await verifier.verifyAndDecodeTransaction(signedTransactionInfo);
    if (!decoded.originalTransactionId || !decoded.productId || decoded.expiresDate == null) return null;
    if (!tierForAppleProductId(decoded.productId)) return null;
    return {
      originalTransactionId: decoded.originalTransactionId,
      productId: decoded.productId,
      expiresAt: new Date(decoded.expiresDate),
    };
  } catch (err) {
    console.error("Apple IAP: transaction verification failed", err);
    return null;
  }
}

// Built from appleProductIdForFreeAgentTier rather than a second hand-typed
// table -- the earlier version of this file had its own literal product-id
// strings that quietly drifted out of sync with the real pricing model
// (shared/free-agent-tiers.ts moved to ai_coach/ai_coach_video/family while
// this file kept mapping stale "base"/"pro"-named ids that didn't
// correspond to anything actually priced). One source, both directions.
const PRODUCT_ID_TO_TIER: Record<string, FreeAgentTierId> = Object.fromEntries(
  FREE_AGENT_TIER_ORDER.map((tier) => [appleProductIdForFreeAgentTier(tier), tier]),
);

export function tierForAppleProductId(productId: string): FreeAgentTierId | null {
  return PRODUCT_ID_TO_TIER[productId] ?? null;
}

// subscriptions.tier (see shared/schema.ts) stores a coarse "base"|"pro"
// ENTITLEMENT level, not the customer-facing SKU -- the same column and
// vocabulary a coach's Stripe subscription also uses for an unrelated
// purpose (Coaches Corner access). Multiple Free Agent SKUs can carry the
// same entitlement: ai_coach_video and family both include video form-check
// (see FREE_AGENT_TIERS), so both grant "pro" here, matching
// hasAthletePaidForAiAccess's existing sub.tier === "pro" check in
// routes.ts rather than introducing a second vocabulary for the same
// column.
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
  const verifier = getVerifier();
  if (!verifier) return null;
  try {
    const payload: ResponseBodyV2DecodedPayload = await verifier.verifyAndDecodeNotification(signedPayload);
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
      },
    };
  } catch (err) {
    console.error("Apple IAP: notification verification failed", err);
    return null;
  }
}
