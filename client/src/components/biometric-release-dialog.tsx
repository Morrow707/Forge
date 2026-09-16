import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PublicUser } from "@shared/schema";

/** Asked once, before an adult athlete's first tracked set.
 *
 * Wiring the biometric release into signup covered new accounts and nobody else. Every athlete who
 * joined before it has nothing on file and cannot be asked at a signup they already passed, so
 * they get asked here instead — at the moment it is actually about something, which is also the
 * moment they can give an informed answer.
 *
 * The server refuses to store skeleton frames or path traces without the release regardless of
 * this dialog (see the capture gate in submitWorkoutLog). This exists so that refusal is a
 * question someone was asked rather than a set that silently came back empty.
 *
 * "Not now" is a real answer and leaves them exactly where they were: the set still logs, the reps
 * and weight still save, and they are asked again next time they reach for the camera. An
 * agreement that is the only way out of a dialog is not an agreement.
 */
export function BiometricReleaseDialog({
  open,
  onOpenChange,
  onAgreed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the release is recorded, so the caller can carry on into what the athlete was
   * trying to do — being asked a question should not cost them the tap that prompted it. */
  onAgreed: () => void;
}) {
  const qc = useQueryClient();

  const agree = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/account/biometric-release", {});
      return (await res.json()) as PublicUser;
    },
    onSuccess: (user) => {
      // The fresh user carries biometricReleaseRequired false, so nothing asks again.
      qc.setQueryData(["/api/auth/me"], user);
      onOpenChange(false);
      onAgreed();
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save that right now"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <ScanLine className="h-7 w-7 text-primary" />
          <DialogTitle>Before we track this set</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-left text-sm text-muted-foreground">
              <p>
                Tracking a set records video on your phone and measures your movement from it —
                your joint positions frame by frame, and figures like bar speed, range of motion
                and jump height.
              </p>
              <p>
                The analysis runs on your own device. Your video and those measurements are
                visible to you, your coach, and nobody else outside Forge. We never sell or trade
                them.
              </p>
              <p>
                You can train without this. Say no and your sets still log normally — you just
                won't get the camera measurements.
              </p>
              <p>
                <a
                  href="/legal"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-primary hover:underline"
                >
                  Read the full video and biometric release
                </a>
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          {/* Listed first and styled quietly, but a real answer with no penalty — see this
              component's own comment on why refusing has to lead somewhere. */}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button type="button" onClick={() => agree.mutate()} disabled={agree.isPending}>
            {agree.isPending ? "Saving..." : "I agree — track my sets"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
