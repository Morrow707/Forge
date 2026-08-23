import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

/** Self-service password change for an already-logged-in user -- previously
 * the only way to change a password was the forgot-password email flow,
 * even while logged in. Requires the current password (same re-entry gate
 * DeleteAccountDialog uses) so a session left open on a shared device can't
 * be used to silently take over the account. Every other device gets
 * logged out on success -- this one stays signed in. */
export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  const mismatch = newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword;

  const changeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/account/change-password", { currentPassword, newPassword }),
    onSuccess: () => {
      toast.success("Password changed -- your other devices have been logged out.");
      reset();
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't change your password"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Change password
          </DialogTitle>
          <DialogDescription>
            Changing your password logs every other device out -- this one stays signed in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <PasswordInput
              id="current-password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
            {mismatch && <p className="text-xs text-destructive">Passwords don't match.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => changeMutation.mutate()}
            disabled={
              !currentPassword ||
              newPassword.length < 6 ||
              newPassword !== confirmPassword ||
              changeMutation.isPending
            }
          >
            {changeMutation.isPending ? "Changing…" : "Change password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
