import { useMutation } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Nothing in the app is actually gated on email verification -- same
 * "flag, don't block" philosophy as the rest of this app's soft nudges
 * (guardian notice, health-status flags). This is purely a visible
 * reminder with a resend action, shown for as long as the account stays
 * unverified -- no dismiss-forever, since an unconfirmed email is still
 * true tomorrow if it's true today. */
export function EmailVerificationBanner() {
  const resendMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/resend-verification"),
    onSuccess: () => toast.success("Verification email sent -- check your inbox."),
    onError: (err: ApiError) => toast.error(err.message || "Couldn't send that email"),
  });

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-500 md:px-8">
      <span className="flex items-center gap-1.5">
        <MailWarning className="h-3.5 w-3.5 shrink-0" />
        Please confirm your email address.
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-amber-500 hover:text-amber-500"
        onClick={() => resendMutation.mutate()}
        disabled={resendMutation.isPending}
      >
        {resendMutation.isPending ? "Sending…" : "Resend email"}
      </Button>
    </div>
  );
}
