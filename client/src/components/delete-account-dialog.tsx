import { useRef, useState } from "react";
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
import { cn } from "@/lib/utils";

/** How long a press has to be held before it counts as confirmed. Long
 * enough that a stray tap can't trigger it, short enough not to feel like
 * a chore on a genuinely-meant deletion. */
const HOLD_DURATION_MS = 1200;

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
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function cancelHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    setHolding(false);
  }

  function startHold() {
    if (!password || deleteMutation.isPending) return;
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      setHolding(false);
      deleteMutation.mutate();
    }, HOLD_DURATION_MS);
  }

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
        if (!next) {
          setPassword("");
          cancelHold();
        }
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
          {/* Press-and-hold instead of a second tap-to-confirm -- a single
              extra tap on a destructive action is easy to fire off without
              really meaning to; a held press for HOLD_DURATION_MS is much
              harder to trigger by accident, and the fill bar gives direct
              feedback on how much longer to hold. Cancels cleanly if the
              finger/pointer lifts or leaves before it completes. */}
          <button
            type="button"
            disabled={!password || deleteMutation.isPending}
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            className={cn(
              "relative w-full select-none overflow-hidden rounded-md bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            <span
              className={cn(
                "absolute inset-y-0 left-0 bg-destructive-foreground/25",
                holding && "transition-[width] ease-linear",
              )}
              style={{
                width: holding ? "100%" : "0%",
                transitionDuration: holding ? `${HOLD_DURATION_MS}ms` : "0ms",
              }}
            />
            <span className="relative">
              {deleteMutation.isPending
                ? "Deleting…"
                : holding
                  ? "Keep holding…"
                  : "Hold to permanently delete my account"}
            </span>
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
