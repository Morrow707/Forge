import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { ColorField } from "@/components/color-field";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Ticket } from "lucide-react";
import type { PublicUser } from "@shared/schema";

/** Account-level self-service: name, email, and password, none of which
 * had any in-app edit path before -- a coach in particular had no way to
 * fix their own name short of asking someone to edit the database, and
 * neither role could change their password without logging out first and
 * using the forgot-password email flow. Available to every role.
 * Personal accent color (coach-only, any staff member) rides along here
 * too since it's the same "about me, not the org" category as the rest
 * of this dialog. */
export function AccountSettingsDialog({
  user,
  open,
  onOpenChange,
}: {
  user: PublicUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();

  const [name, setName] = useState(user.name);
  const nameMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/account/profile", { name: name.trim() });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast.success("Name updated");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't update name"),
  });

  const [emailPassword, setEmailPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const emailMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/account/email", { password: emailPassword, newEmail });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast.success("Email updated");
      setEmailPassword("");
      setNewEmail("");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't update email"),
  });

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/account/password", { currentPassword, newPassword });
    },
    onSuccess: () => {
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't update password"),
  });

  const [accentColor, setAccentColor] = useState(user.personalAccentColor ?? "");
  const accentMutation = useMutation({
    mutationFn: async (next: string | null) => {
      await apiRequest("PATCH", "/api/coach/personal-accent", { accentColor: next });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast.success("Personal accent updated");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't update accent color"),
  });

  const [redeemCode, setRedeemCode] = useState("");
  const redeemMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach/redeem-code", { code: redeemCode.trim() });
      return (await res.json()) as { trialExpiresAt: string };
    },
    onSuccess: (data) => {
      const until = new Date(data.trialExpiresAt).toLocaleDateString();
      toast.success(`Code redeemed -- full access unlocked through ${until}`);
      setRedeemCode("");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't redeem that code"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Account Settings</DialogTitle>
          <DialogDescription>Your name, login email, and password.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="account-name">Name</Label>
            <div className="flex items-center gap-2">
              <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
              <Button
                type="button"
                variant="outline"
                onClick={() => nameMutation.mutate()}
                disabled={!name.trim() || name.trim() === user.name || nameMutation.isPending}
              >
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-1.5 border-t border-border pt-4">
            <Label>Email</Label>
            <p className="text-xs text-muted-foreground">Currently {user.email}</p>
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="New email address"
            />
            <PasswordInput
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              placeholder="Current password, to confirm"
              autoComplete="current-password"
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => emailMutation.mutate()}
              disabled={!newEmail.trim() || !emailPassword || emailMutation.isPending}
            >
              Update email
            </Button>
          </div>

          <div className="space-y-1.5 border-t border-border pt-4">
            <Label>Password</Label>
            <PasswordInput
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
            />
            <PasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (at least 6 characters)"
              autoComplete="new-password"
              minLength={6}
            />
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
            />
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-destructive">Passwords don't match</p>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => passwordMutation.mutate()}
              disabled={
                !currentPassword ||
                newPassword.length < 6 ||
                newPassword !== confirmPassword ||
                passwordMutation.isPending
              }
            >
              Update password
            </Button>
          </div>

          {user.role === "coach" && (
            <div className="space-y-1.5 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Your own accent color for hover/focus highlights -- just for your view, on top of
                whatever your program's branding already sets. Leave blank to use the program's own
                color.
              </p>
              <ColorField label="Personal accent" value={accentColor || "#F65B23"} onChange={setAccentColor} />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => accentMutation.mutate(accentColor || null)}
                  disabled={accentMutation.isPending}
                >
                  Save accent color
                </Button>
                {user.personalAccentColor && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setAccentColor("");
                      accentMutation.mutate(null);
                    }}
                    disabled={accentMutation.isPending}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          )}

          {user.role === "coach" && user.isPrimaryCoach && (
            <div className="space-y-1.5 border-t border-border pt-4">
              <Label className="flex items-center gap-1.5">
                <Ticket className="h-4 w-4" />
                Redeem a code
              </Label>
              <p className="text-xs text-muted-foreground">
                Have a promo code for free trial access? Enter it here.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                  placeholder="CODE"
                  className="font-mono uppercase"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => redeemMutation.mutate()}
                  disabled={!redeemCode.trim() || redeemMutation.isPending}
                >
                  Redeem
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
