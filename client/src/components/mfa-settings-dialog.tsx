import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, Copy } from "lucide-react";

const STATUS_QUERY_KEY = ["/api/auth/mfa/status"];

type Step = "status" | "setup" | "backup-codes" | "disable";

/** Coach/admin-only account-menu dialog for enabling/disabling TOTP-based
 * two-factor auth (see requireRole on the /api/auth/mfa/* routes in
 * auth.ts). Optional-but-encouraged, not forced -- nothing here changes
 * what an account can do until the user opts in themselves. */
export function MfaSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("status");
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [password, setPassword] = useState("");

  const { data: status, isLoading } = useQuery<{ enabled: boolean }>({
    queryKey: STATUS_QUERY_KEY,
    queryFn: () => getJson("/api/auth/mfa/status"),
    enabled: open,
  });

  function reset() {
    setStep("status");
    setSetupData(null);
    setCode("");
    setBackupCodes(null);
    setPassword("");
  }

  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/mfa/setup");
      return (await res.json()) as { secret: string; otpauthUri: string };
    },
    onSuccess: (data) => {
      setSetupData(data);
      setStep("setup");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't start setup"),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/mfa/confirm", { code });
      return (await res.json()) as { backupCodes: string[] };
    },
    onSuccess: ({ backupCodes }) => {
      setBackupCodes(backupCodes);
      setStep("backup-codes");
      qc.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
    },
    onError: (err: ApiError) => toast.error(err.message || "Invalid code"),
  });

  const disableMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/mfa/disable", { password }),
    onSuccess: () => {
      toast.success("Two-factor authentication turned off");
      qc.invalidateQueries({ queryKey: STATUS_QUERY_KEY });
      reset();
    },
    onError: (err: ApiError) => toast.error(err.message || "Incorrect password"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Two-factor authentication
          </DialogTitle>
          <DialogDescription>
            {step === "status" &&
              "Adds a second step to logging in, so a leaked password alone isn't enough."}
            {step === "setup" &&
              "Scan this with an authenticator app (Google Authenticator, Authy, 1Password, etc.), then enter the code it shows."}
            {step === "backup-codes" &&
              "Save these somewhere safe -- each one works once, if you ever lose access to your authenticator app."}
            {step === "disable" && "Enter your password to turn two-factor authentication off."}
          </DialogDescription>
        </DialogHeader>

        {step === "status" &&
          (isLoading ? (
            <div className="h-16 animate-pulse rounded-md bg-surface" />
          ) : status?.enabled ? (
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-sm text-emerald-500">
                <ShieldCheck className="h-4 w-4" />
                Two-factor authentication is on.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full text-destructive"
                onClick={() => setStep("disable")}
              >
                <ShieldOff className="h-4 w-4" />
                Turn off
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              className="w-full"
              onClick={() => setupMutation.mutate()}
              disabled={setupMutation.isPending}
            >
              {setupMutation.isPending ? "Starting…" : "Enable two-factor authentication"}
            </Button>
          ))}

        {step === "setup" && setupData && (
          <div className="space-y-4">
            <div className="flex justify-center rounded-md bg-white p-3">
              <QRCodeSVG value={setupData.otpauthUri} size={180} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Can't scan? Enter this manually:</Label>
              <p className="break-all rounded-md border border-border bg-surface p-2 font-mono text-xs">
                {setupData.secret}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mfa-confirm-code">6-digit code</Label>
              <Input
                id="mfa-confirm-code"
                inputMode="numeric"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                maxLength={6}
              />
            </div>
          </div>
        )}

        {step === "backup-codes" && backupCodes && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface p-3 font-mono text-sm">
              {backupCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                navigator.clipboard.writeText(backupCodes.join("\n"));
                toast.success("Copied");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy codes
            </Button>
          </div>
        )}

        {step === "disable" && (
          <div className="space-y-1.5">
            <Label htmlFor="mfa-disable-password">Password</Label>
            <PasswordInput
              id="mfa-disable-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Confirm your password"
            />
          </div>
        )}

        {step === "setup" && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStep("status")}>
              Cancel
            </Button>
            <Button onClick={() => confirmMutation.mutate()} disabled={!code.trim() || confirmMutation.isPending}>
              {confirmMutation.isPending ? "Verifying…" : "Verify & enable"}
            </Button>
          </DialogFooter>
        )}
        {step === "backup-codes" && (
          <DialogFooter>
            <Button className="w-full" onClick={reset}>
              I've saved these -- done
            </Button>
          </DialogFooter>
        )}
        {step === "disable" && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStep("status")}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => disableMutation.mutate()}
              disabled={!password || disableMutation.isPending}
            >
              {disableMutation.isPending ? "Turning off…" : "Turn off"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
