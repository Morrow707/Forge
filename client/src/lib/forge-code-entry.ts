import { Capacitor } from "@capacitor/core";

/* A FORGE CODE IS TYPED ON THE WEB AND NEVER IN THE NATIVE APP (App Review, 2026-11-06).
 *
 * Apple rejected 1.0 (build 695) under Guideline 3.1.1: "the app uses promo code to unlock or
 * enable subscription." A Forge code (shared/promo-codes.ts) writes Forge's own trial row and
 * grants the paid Free Agent features for a window, which is exactly "unlocking functionality
 * with a mechanism other than In-App Purchase" -- whatever the comment beside the box used to
 * argue. Apple's remedy is its own: an offer code for the In-App Purchase, redeemed on Apple's
 * sheet (`redeemAppleOfferCode`, the "App Store code" button), which stays.
 *
 * So every surface that takes a Forge code -- the Upgrade screen's box, the optional field at
 * sign-up, the primary coach's box in Account Settings -- asks this before it draws, and the
 * native app draws none of them. Google Play's billing policy reads the same way, so the answer
 * is "web only" rather than "not iOS". The routes behind the boxes are untouched: a code typed
 * on the website still works, and an account that redeemed one before this keeps what it was
 * given, which is Forge's own trial and not a store product.
 *
 * `a-forge-code-is-never-typed-in-the-native-app.test.ts` discovers every surface that posts a
 * code and holds each behind this. */
export function forgeCodeEntryIsAllowed(): boolean {
  return !Capacitor.isNativePlatform();
}
