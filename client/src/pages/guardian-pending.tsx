import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { BrandedMark } from "@/components/branded-mark";
import { useRememberedBrand } from "@/lib/remembered-brand";
import { computeBrandingStyle } from "@/lib/branding-style";
import { ShieldCheck, MailCheck, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, ApiError } from "@/lib/queryClient";

/** What a minor athlete sees instead of the app until a parent or guardian
 * finishes setting up their linked account.
 *
 * The server refuses everything else regardless (see the guardian gate in
 * server/routes.ts) -- this screen exists so that refusal reads as a step
 * they are waiting on rather than an app that is broken. The one action
 * available is nudging the parent, and it re-sends to the address already on
 * file rather than letting the athlete pick a new one.
 *
 * IT HAS TO KEEP CHECKING. The hold is released by something that happens in somebody else's
 * inbox, on another device, with nothing to tell this screen about it -- and /api/auth/me is
 * fetched once, at sign-in. Without the poll below, "as soon as they finish, everything here
 * unlocks for you" was untrue: an athlete whose parent had already finished sat on this screen
 * until they worked out how to force a reload, which on the native app means killing it. The
 * one promise this screen makes is the one it could not keep.
 */
export default function GuardianPendingPage() {
  const { user, logoutMutation } = useAuth();
  const qc = useQueryClient();
  // The second hold, under 13 only: the parent has claimed and still has one step to do.
  const verifying = user?.guardianVerificationRequired === true;
  const [sent, setSent] = useState(false);

  // Cheap (one row, no joins) and only ever runs while an athlete is actually being held here,
  // so 15s is a fast unlock rather than a load. Re-checking on focus covers the common shape:
  // the athlete is standing next to the parent watching them do it, and comes back to the app
  // the moment they are done.
  useEffect(() => {
    const recheck = () => qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
    const timer = setInterval(recheck, 15_000);
    window.addEventListener("focus", recheck);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", recheck);
    };
  }, [qc]);

  const resend = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/account/guardian-invite/resend");
    },
    onSuccess: () => {
      setSent(true);
      toast.success("We've sent it again.");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't send that right now"),
  });

  const brand = useRememberedBrand();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12" style={computeBrandingStyle(brand)}>
      <div className="w-full max-w-md space-y-6 text-center">
        <BrandedMark brand={brand} size="md" />
        <div className="space-y-3">
          <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
          <h1 className="font-display text-2xl font-extrabold uppercase tracking-wide">
            One more step
          </h1>
          {verifying ? (
            <>
              <p className="text-sm text-muted-foreground">
                Your parent or guardian has set up their account. Because you're under 13, the law
                asks them to confirm it's really them with a quick card check on their Forge
                guardian page. It costs nothing: the 50 cents is refunded straight away.
              </p>
              <p className="text-sm text-muted-foreground">
                As soon as they finish, everything here unlocks for you.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Because you're under 18, a parent or guardian has to set up their own linked account
                before you can start training on Forge. We emailed them when you signed up.
              </p>
              <p className="text-sm text-muted-foreground">
                Ask them to open that email and follow the link. As soon as they finish, everything
                here unlocks for you.
              </p>
            </>
          )}
        </div>

        {!verifying && (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-5 text-left">
          <div className="flex items-start gap-3">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              Can't find it? We'll send it again to the same address you gave us at signup.
            </p>
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={resend.isPending}
            onClick={() => resend.mutate()}
          >
            {resend.isPending ? "Sending..." : sent ? "Send it one more time" : "Resend the email"}
          </Button>
        </div>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => logoutMutation.mutate()}
          className="text-muted-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
