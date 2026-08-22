import { useState, type FormEvent } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

/** Second step of login for an MFA-enabled coach/admin -- shared by login.tsx
 * and admin-login.tsx, shown in place of the normal password card once
 * loginMutation's response comes back as { mfaRequired: true, mfaToken }
 * instead of a logged-in user. email/password are only held here to hand
 * back to mfaVerifyMutation for the post-login keychain save (see
 * use-auth.tsx's applyLoginSuccess) -- never sent anywhere as part of this
 * step's own request. */
export function MfaLoginStep({
  email,
  password,
  mfaToken,
  onBack,
}: {
  email: string;
  password: string;
  mfaToken: string;
  onBack: () => void;
}) {
  const { mfaVerifyMutation } = useAuth();
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mfaVerifyMutation.mutate({ mfaToken, code, email, password });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Two-factor authentication
        </CardTitle>
        <CardDescription>
          {useBackupCode
            ? "Enter one of your saved backup codes."
            : "Enter the 6-digit code from your authenticator app."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mfa-code">{useBackupCode ? "Backup code" : "Code"}</Label>
            <Input
              id="mfa-code"
              autoComplete="one-time-code"
              autoFocus
              inputMode={useBackupCode ? "text" : "numeric"}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={useBackupCode ? "XXXX-XXXX" : "123456"}
              maxLength={useBackupCode ? 9 : 6}
            />
          </div>
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!code.trim() || mfaVerifyMutation.isPending}
          >
            {mfaVerifyMutation.isPending ? "Verifying…" : "Verify"}
          </Button>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm">
          <button type="button" onClick={onBack} className="text-muted-foreground hover:underline">
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              setUseBackupCode((v) => !v);
              setCode("");
            }}
            className="font-semibold text-primary hover:underline"
          >
            {useBackupCode ? "Use authenticator code instead" : "Use a backup code instead"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
