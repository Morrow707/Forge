import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { ForgeMark } from "@/components/forge-mark";
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
 */
export default function GuardianPendingPage() {
  const { logoutMutation } = useAuth();
  const [sent, setSent] = useState(false);

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-6 text-center">
        <ForgeMark className="mx-auto h-14 w-14 rounded-xl" />
        <div className="space-y-3">
          <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
          <h1 className="font-display text-2xl font-extrabold uppercase tracking-wide">
            One more step
          </h1>
          <p className="text-sm text-muted-foreground">
            Because you're under 18, a parent or guardian has to set up their own linked account
            before you can start training on Forge. We emailed them when you signed up.
          </p>
          <p className="text-sm text-muted-foreground">
            Ask them to open that email and follow the link. As soon as they finish, everything
            here unlocks for you.
          </p>
        </div>

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
