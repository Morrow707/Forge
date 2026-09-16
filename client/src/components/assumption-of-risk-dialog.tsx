import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
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

/** Shown once to an athlete, the first time they open their dashboard.
 *
 * The gap it closes: the risk terms are accepted at signup by an adult, and for a minor by their
 * guardian on a different screen entirely. Either way the person actually under the bar may never
 * have read a word of it. A guardian's agreement is the legal instrument and this changes nothing
 * about that -- what it changes is whether the athlete has seen it.
 *
 * SO THIS IS NOT A WAIVER THE ATHLETE IS GIVING, and it does not say it is. A minor cannot waive
 * their own claim and the release's own section 8 says so. The button says "I understand", not
 * "I agree", and the record is stored with no givenByUserId, which is what distinguishes an
 * athlete's own acknowledgment from a guardian's consent for them.
 *
 * ONE WAY OUT, deliberately, unlike the biometric prompt beside it. Declining the camera is a
 * real choice because training without it works fine. There is no version of using a training app
 * where the risks of training do not apply, so pretending otherwise with a "Not now" would be
 * offering a choice that isn't one. What is honest is that this asks for nothing in return: no
 * rights are being surrendered by reading it, which is why it can be dismissed by understanding
 * it rather than by agreeing to anything.
 */
export function AssumptionOfRiskDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();

  const acknowledge = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/account/assumption-of-risk", {});
      return (await res.json()) as PublicUser;
    },
    onSuccess: (user) => {
      // The fresh user carries assumptionOfRiskRequired false, so it does not reappear on the
      // next render rather than waiting on a refetch.
      qc.setQueryData(["/api/auth/me"], user);
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save that right now"),
  });

  return (
    <Dialog
      open={open}
      // Not dismissible by clicking away or pressing escape. It is one screen, once, and the
      // whole point is that it was put in front of somebody.
      onOpenChange={(next) => {
        if (!next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" hideClose>
        <DialogHeader>
          <ShieldAlert className="h-7 w-7 text-primary" />
          <DialogTitle>Before you train</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-left text-sm text-muted-foreground">
              <p>
                Lifting, jumping and sprinting can injure you, sometimes seriously. That is true
                of training itself, and no app changes it.
              </p>
              <p>
                <span className="font-semibold text-foreground">Nobody at Forge is watching.</span>{" "}
                We don't check whether today's weight is right for you, spot you, or see your
                position. A weight or a program here is a suggestion worked out from what you have
                logged — not an instruction from someone who can see you.
              </p>
              <p>
                Measurements from your camera are estimates from a phone. They are not safety
                equipment: a set that looks good in Forge is not a set anyone has confirmed was
                safe.
              </p>
              <p className="font-semibold text-foreground">
                Stop if something hurts, even when the program says keep going.
              </p>
              <p>
                <a
                  href="/assumption-of-risk"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-primary hover:underline"
                >
                  Read the full assumption of risk and release
                </a>
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            className="w-full"
            onClick={() => acknowledge.mutate()}
            disabled={acknowledge.isPending}
          >
            {acknowledge.isPending ? "Saving..." : "I understand"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
