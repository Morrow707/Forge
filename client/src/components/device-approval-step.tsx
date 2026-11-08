import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { beginDeviceApprovalClaim } from "@/lib/device-approval-claim";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MailCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type Status = "pending" | "approved" | "denied" | "expired";

/** "We don't recognize this device" -- the step between a correct password and a session on a
 * device this account has never used. Shared by login.tsx and admin-login.tsx, shown once
 * loginMutation's response is { deviceApprovalRequired, pollToken, emailHint }.
 *
 * Waits ON SCREEN: it polls the server every few seconds and signs in by itself the moment the
 * email link has been approved, so the person opens their mail, taps approve, and comes back to
 * an app that is already in. On denial it says so and stops; the denier is being walked to a
 * new password on the other device, and this one has nothing left to do.
 *
 * email/password ride along only for applyLoginSuccess's keychain save, exactly as
 * MfaLoginStep does -- never sent with the poll or the claim. */
export function DeviceApprovalStep({
  email,
  password,
  pollToken: initialPollToken,
  emailHint,
  onBack,
}: {
  email: string;
  password: string;
  pollToken: string;
  emailHint: string;
  onBack: () => void;
}) {
  const { deviceApprovalCompleteMutation } = useAuth();
  const [pollToken, setPollToken] = useState(initialPollToken);
  const [resending, setResending] = useState(false);

  const { data, isError } = useQuery<{ status: Status }>({
    queryKey: ["/api/auth/device-approval/status", pollToken],
    queryFn: () => getJson(`/api/auth/device-approval/status?pollToken=${encodeURIComponent(pollToken)}`),
    // Stops on its own once there is nothing left to wait for.
    refetchInterval: (q) => (q.state.data?.status === "pending" || !q.state.data ? 3000 : false),
    retry: false,
  });
  const status: Status | undefined = data?.status;

  // The guard is keyed on the POLL TOKEN and lives outside this component, because
  // the approval is spent once on the server and a remount must not be able to
  // spend it again -- see lib/device-approval-claim.ts for the fifty-claim burst
  // that a component-state guard allowed.
  useEffect(() => {
    if (status !== "approved") return;
    if (!beginDeviceApprovalClaim(pollToken)) return;
    deviceApprovalCompleteMutation.mutate({ pollToken, email, password });
  }, [status, pollToken, email, password, deviceApprovalCompleteMutation]);

  async function resend() {
    setResending(true);
    try {
      const res = await apiRequest("POST", "/api/auth/device-approval/resend", { pollToken });
      const body = (await res.json()) as { pollToken: string };
      // A resend is a NEW approval row with a new token (the action token is only
      // ever in the clear at creation), so the fresh token has never been claimed
      // and nothing has to forget the old one.
      setPollToken(body.pollToken);
      deviceApprovalCompleteMutation.reset();
      toast.success("Sent another email");
    } catch (err) {
      toast.error((err as ApiError).message || "Couldn't resend the email");
    } finally {
      setResending(false);
    }
  }

  const denied = status === "denied";
  const expired = status === "expired";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {denied ? <ShieldAlert className="h-5 w-5 text-destructive" /> : <MailCheck className="h-5 w-5" />}
          {denied ? "This sign-in was denied" : "We don't recognize this device"}
        </CardTitle>
        <CardDescription>
          {denied
            ? "The owner of this account said this wasn't them. Every device has been signed out and they are choosing a new password."
            : expired
              ? "That email link has expired. Send a new one to try again."
              : `We sent an email to ${emailHint}. Open it and approve this device, and this screen will sign you in on its own.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!denied && !expired && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
            {deviceApprovalCompleteMutation.isError
              ? // The approval was granted and the claim did not land. It is claimed
                // once per token on purpose, so the way back in is a fresh approval --
                // the button below -- and saying so beats a spinner that never resolves.
                "Approved, but we couldn't finish signing you in. Send the email again to try once more."
              : status === "approved" || deviceApprovalCompleteMutation.isPending
                ? "Approved. Signing you in…"
                : isError
                  ? "Still waiting. Having trouble reaching the server, retrying…"
                  : "Waiting for you to approve it from your email…"}
          </div>
        )}
        {!denied && (
          <Button type="button" variant="outline" className="w-full" onClick={resend} disabled={resending}>
            {resending ? "Sending…" : expired ? "Send a new email" : "Send the email again"}
          </Button>
        )}
        <div className="text-sm">
          <button type="button" onClick={onBack} className="text-muted-foreground hover:underline">
            Back
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
