import type { ComponentProps, ReactNode } from "react";
import { Link } from "wouter";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSignupAvailability } from "@/hooks/use-signup-availability";

/** EVERY WAY INTO /signup GOES THROUGH HERE.
 *
 * While public sign-up is closed the site stays up and every "Get started" becomes a quiet
 * "Coming soon" that leads nowhere; a visitor holding the invite code sees the real button.
 * One component rather than a condition at eight call sites, because the ninth call site is
 * the one that forgets, and client/src/lib/signup-is-closed-everywhere.test.ts refuses a bare
 * link to /signup anywhere else.
 *
 * Until the server has answered, the button is drawn disabled with the open label so the page
 * does not flash between the two states on load. */
export function SignupCta({
  children,
  className,
  size,
  variant,
}: {
  children: ReactNode;
  className?: string;
  size?: ComponentProps<typeof Button>["size"];
  variant?: ComponentProps<typeof Button>["variant"];
}) {
  const { canSignUp } = useSignupAvailability();
  if (canSignUp === false) {
    return (
      <Button size={size} variant="outline" className={className} disabled aria-disabled="true">
        <Clock className="h-4 w-4" />
        Coming soon
      </Button>
    );
  }
  if (canSignUp === undefined) {
    return (
      <Button size={size} variant={variant} className={className} disabled aria-disabled="true">
        {children}
      </Button>
    );
  }
  return (
    <Link href="/signup">
      <Button size={size} variant={variant} className={className}>
        {children}
      </Button>
    </Link>
  );
}

/** The inline text form ("Don't have an account? Sign up"). Closed, it says "Coming soon". */
export function SignupLink({ className, children }: { className?: string; children: ReactNode }) {
  const { canSignUp } = useSignupAvailability();
  if (canSignUp === false) return <span className={className}>Coming soon</span>;
  if (canSignUp === undefined) return <span className={className}>{children}</span>;
  return (
    <Link href="/signup" className={className}>
      {children}
    </Link>
  );
}
