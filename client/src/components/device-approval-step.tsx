import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { beginDeviceApprovalClaim } from "@/lib/device-approval-claim";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MailCheck, ShieldAlert, ShieldCheck } from "lucide-react";
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
 * MfaLoginStep does -- never sent with the poll or the claim.
 *
 * AN ACCOUNT WITH AN AUTHENTICATOR APP GETS A SECOND DOOR (Scott, 2026-11-13, Outlook down and
 * the email stuck): the email stays the default, and one button switches the step to a code from
 * the authenticator, which approves this device on the server in place of the email. See
 * /api/auth/device-approval/authenticator in server/auth.ts for why that is as strong. */
export function DeviceApprovalStep({
  email,
  password,
  pollToken: initialPollToken,
  emailHint,
  emailSent = true,
  authenticatorAvailable = false,
  onBack,
}: {
  email: string;
  password: string;
  pollToken: string;
  emailHint: string;
  emailSent?: boolean;
  authenticatorAvailable?: boolean;
  onBack: () => void;
}) {
  const { deviceApprovalCompleteMutation, deviceAuthenticatorMutation } = useAuth();
  const [pollToken, setPollToken] = useState(initialPollToken);
  const [resending, setResending] = useState(false);
  // Whether an approval email is actually out there to be approved. It starts from the login
  // answer and turns true the moment a resend succeeds; until then, "waiting for you to approve
  // it from your email" would describe an email that does not exist.
  const [emailOut, setEmailOut] = useState(emailSent);
  // The email did not go, so the code is the only way forward: open on it.
  const [usingAuthenticator, setUsingAuthenticator] = useState(authenticatorAvailable && !emailSent);
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);

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
    // Approved BY the authenticator code, which already signed this device in: there is
    // nothing left to claim, and a claim now would only meet a 409.
    if (deviceAuthenticatorMutation.isPending || deviceAuthenticatorMutation.isSuccess) return;
    if (!beginDeviceApprovalClaim(pollToken)) return;
    deviceApprovalCompleteMutation.mutate({ pollToken, email, password });
  }, [status, pollToken, email, password, deviceApprovalCompleteMutation, deviceAuthenticatorMutation.isPending, deviceAuthenticatorMutation.isSuccess]);

  function submitCode(e: FormEvent) {
    e.preventDefault();
    deviceAuthenticatorMutation.mutate({ pollToken, code: code.trim(), email, password });
  }

  async function resend() {
    setResending(true);
    try {
      const res = await apiRequest("POST", "/api/auth/device-approval/resend", { pollToken });
      const body = (await res.json()) as { pollToken: string };
      // A resend is a NEW approval row with a new token (the action token is only
      // ever in the clear at creation), so the fresh token has never been claimed
      // and nothing has to forget the old one.
      setPollToken(body.pollToken);
      setEmailOut(true);
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

  if (usingAuthenticator && !denied && !expired) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            We don't recognize this device
          </CardTitle>
          <CardDescription>
            {useBackupCode
              ? "Enter one of your saved backup codes to approve this device."
              : "Enter the 6-digit code from your authenticator app to approve this device."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitCode} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="device-authenticator-code">{useBackupCode ? "Backup code" : "Code"}</Label>
              <Input
                id="device-authenticator-code"
                autoComplete="one-time-code"
                autoFocus
                inputMode={useBackupCode ? "text" : "numeric"}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={useBackupCode ? "XXXX-XXXX" : "123456"}
                maxLength={useBackupCode ? 9 : 6}
              />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={!code.trim() || deviceAuthenticatorMutation.isPending}>
              {deviceAuthenticatorMutation.isPending ? "Verifying…" : "Verify"}
            </Button>
          </form>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
            <button
              type="button"
              onClick={() => {
                setUsingAuthenticator(false);
                setCode("");
              }}
              className="font-semibold text-primary hover:underline"
            >
              Use the email instead
            </button>
            <button
              type="button"
              onClick={() => {
                setUseBackupCode((v) => !v);
                setCode("");
              }}
              className="text-muted-foreground hover:underline"
            >
              {useBackupCode ? "Use authenticator code instead" : "Use a backup code instead"}
            </button>
          </div>
          <div className="mt-3 text-sm">
            <button type="button" onClick={onBack} className="text-muted-foreground hover:underline">
              Back
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

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
              : emailOut
                ? `We sent an email to ${emailHint}. Open it and approve this device, and this screen will sign you in on its own.`
                : `We couldn't send the email to ${emailHint}. Send it again, or use your authenticator app.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!denied && !expired && (emailOut || status === "approved" || deviceApprovalCompleteMutation.isPending || deviceApprovalCompleteMutation.isError) && (
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
        {!denied && !expired && authenticatorAvailable && (
          <Button
            type="button"
            className="w-full"
            onClick={() => {
              setUsingAuthenticator(true);
              setCode("");
            }}
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            Use my authenticator app instead
          </Button>
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
