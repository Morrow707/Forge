// StoreKit 2 (iOS App Store subscription) verification -- scaffolding
// only, same "framework, not live" status as billing.ts. Unlike Stripe,
// there's no npm SDK to lean on here: Apple signs each transaction as a
// JWS (JSON Web Signature) using a certificate chain rooted at Apple's own
// CA, and verifying one for real means walking that x5c certificate chain
// against Apple's root, not just checking a signature against a shared
// secret. That's real, testable work against a live App Store Connect
// subscription group and sandbox purchases -- neither exists yet, so
// rather than ship a JWS-parsing function nobody can exercise end to end,
// this documents exactly what a real implementation needs to do and where
// it plugs in, so building it later is "fill in verifyAppleTransaction,"
// not "figure out the architecture from scratch."
//
// What a real launch needs, in order:
//   1. An App Store Connect subscription group with Products matching
//      PRICING.free_agent's ios_cents tiers (billing.ts).
//   2. The `jose` package (or Apple's own app-store-server-library) to
//      decode the JWS header, extract the x5c certificate chain, verify it
//      chains to Apple's published root CA, then verify the payload
//      signature against the leaf certificate's public key.
//   3. The decoded payload's `originalTransactionId` is the stable id to
//      store as subscriptions.appleOriginalTransactionId (see
//      shared/schema.ts) -- Apple can reissue transactionId on renewal,
//      originalTransactionId never changes for the life of the
//      subscription.
//   4. Apple's Server Notifications V2 (a webhook, same shape idea as
//      Stripe's) for renewal/cancellation/refund events -- this app has no
//      route registered for it yet; it would live in index.ts next to the
//      Stripe webhook, registered the same way (before express.json(),
//      since it also needs the raw body for signature verification).

export const APPLE_IAP_LIVE = process.env.APPLE_IAP_LIVE === "true";

export type VerifiedAppleTransaction = {
  originalTransactionId: string;
  productId: string;
  expiresAt: Date;
};

/** Not implemented -- see this file's own comment for exactly what real
 * verification requires. Always returns null so any caller (none exist
 * yet) fails closed rather than silently trusting an unverified receipt. */
export async function verifyAppleTransaction(_signedTransactionInfo: string): Promise<VerifiedAppleTransaction | null> {
  return null;
}
