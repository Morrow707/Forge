import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { TriangleAlert } from "lucide-react";

/** Self-service, permanent account deletion -- Apple 5.1.1(v) / Google
 * Play's account-deletion requirement, available from any role's account
 * menu. Password re-entry gates it since this is irreversible: there is no
 * undo, no "restore my account" flow, nothing to fall back on. */
export function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/account/delete", { password });
    },
    onSuccess: () => {
      qc.setQueryData(["/api/auth/me"], null);
      qc.clear();
      toast.success("Your account has been deleted.");
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not delete account"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPassword("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlert className="h-5 w-5" />
            Delete account
          </DialogTitle>
          <DialogDescription>
            This permanently deletes your account and everything tied to it -- programs, logged
            workouts, and video. There is no way to undo this. Enter your password to confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="delete-account-password">Password</Label>
          <PasswordInput
            id="delete-account-password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Confirm your password"
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!password || deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? "Deleting…" : "Permanently delete my account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
