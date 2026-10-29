import { Link } from "wouter";
import { Capacitor } from "@capacitor/core";
import { cn } from "@/lib/utils";

/**
 * THE SENTENCE AND THE TWO LINKS APPLE REQUIRES BESIDE EVERY SUBSCRIPTION (Guideline 3.1.2,
 * the second 1.0 rejection, 2026-10-29): a functional link to the Privacy Policy and to the
 * Terms of Use (EULA), in the app, on the surface where the purchase is made, with the
 * subscription's length and its auto-renewal stated. The title and price are on each card
 * already; this is the half the reviewer could not find.
 *
 * The links are the app's OWN routes (/privacy and /eula render the attorney-reviewed text
 * from the API), so they work with no session and never hand a buyer to a browser -- which is
 * what native-paywall-never-points-at-the-web.test.ts exists to refuse. The App Store sentence
 * is drawn only inside the iOS app: on the web a Stripe subscription is managed on Stripe's
 * portal and Apple's wording about an Apple ID would be false there.
 *
 * `every-purchase-surface-links-the-legal-documents.test.ts` discovers every surface that
 * starts a purchase and requires this component on it, so a sixth purchase surface cannot ship
 * without the links the first five were rejected for lacking.
 */
export function SubscriptionLegalLinks({ compact = false, className }: { compact?: boolean; className?: string }) {
  const ios = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  const links = (
    <span className="whitespace-nowrap">
      <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
        Privacy Policy
      </Link>
      <span aria-hidden="true"> · </span>
      <Link href="/eula" className="underline underline-offset-2 hover:text-foreground">
        Terms of Use (EULA)
      </Link>
    </span>
  );
  if (compact) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)} data-testid="subscription-legal-links">
        Monthly, renews until cancelled. {links}
      </p>
    );
  }
  return (
    <div className={cn("space-y-1 text-xs text-muted-foreground", className)} data-testid="subscription-legal-links">
      <p>
        Every plan and add-on is a monthly subscription that renews automatically until you cancel
        it.
        {ios && (
          <>
            {" "}
            Payment is charged to your Apple ID when you confirm the purchase. The subscription
            renews unless it is cancelled at least 24 hours before the end of the current period,
            and you can manage or cancel it in your App Store account settings.
          </>
        )}
      </p>
      <p>{links}</p>
    </div>
  );
}
