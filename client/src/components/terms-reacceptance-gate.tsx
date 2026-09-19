import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getJson, apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReadFailed } from "@/components/read-failed";
import { ScrollText } from "lucide-react";

export type TermsStatus = {
  needsAcceptance: boolean;
  /** True for a minor athlete: their guardian answers this, on the guardian dashboard. */
  guardianDecides: boolean;
  version: string;
  text: string;
};

/** THE RE-ACCEPTANCE GATE. Section 16 of the signup Terms of Use promises that a material change
 * is put in front of an existing user and accepted in the app before they carry on, so this is
 * the app keeping a promise the document makes, not a nag.
 *
 * Mounted once in App.tsx beside the router rather than on any one screen: the point is that
 * there is no route that gets around it.
 *
 * A MINOR IS NOT LOCKED OUT. When the server says `guardianDecides`, the athlete sees nothing at
 * all and keeps training -- the guardian is asked on their own dashboard. A minor cannot accept
 * these terms, and a dialog they cannot dismiss and cannot satisfy would just be a locked door
 * with no key on their side of it.
 *
 * A failed status read renders ReadFailed, never a spinner: an unanswered read must not leave
 * somebody staring at a blocking overlay that has nothing in it (see the "Hydrate-in-an-effect"
 * section of CLAUDE.md).
 */
export function TermsReacceptanceGate() {
  const { user, logoutMutation } = useAuth();
  const qc = useQueryClient();
  const [agreed, setAgreed] = useState(false);

  const needs = user?.needsTermsAcceptance === true;

  const {
    data: status,
    isError,
    refetch,
  } = useQuery<TermsStatus>({
    queryKey: ["/api/auth/terms-status"],
    queryFn: () => getJson("/api/auth/terms-status"),
    enabled: needs,
  });

  const accept = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/accept-terms", { agreed: true });
      return (await res.json()) as { acceptedAt: string };
    },
    onSuccess: () => {
      // The flag lives on the user object, so re-reading it is what makes this dialog go away.
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries({ queryKey: ["/api/auth/terms-status"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't record that right now"),
  });

  if (!needs) return null;
  // The minor keeps using the app while their guardian is asked.
  if (status?.guardianDecides) return null;
  // Nothing to show until we know which of the two this is -- drawing the blocking dialog first
  // and hiding it a moment later would flash a locked screen at a minor who is not being asked.
  if (!isError && !status) return null;

  return (
    <Dialog
      open
      // Deliberately ignored. There is no close control, no escape, no click-away: accepting or
      // signing out are the two ways past this, which is what "before continuing" means.
      onOpenChange={() => {}}
    >
      <DialogContent
        className="sm:max-w-lg"
        hideClose
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <ScrollText className="h-7 w-7 text-primary" />
          <DialogTitle>Forge's Terms of Use have changed</DialogTitle>
        </DialogHeader>
        {isError || !status ? (
          <ReadFailed what="the updated Terms of Use" onRetry={() => void refetch()} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Please read the updated terms and accept them to keep using Forge.
            </p>
            <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-background/40 p-3 text-sm whitespace-pre-wrap">
              {status.text}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={agreed}
                onCheckedChange={(v) => setAgreed(v === true)}
                className="mt-0.5"
              />
              <span>I have read the updated Terms of Use and agree to them</span>
            </label>
            <div className="flex items-center justify-between gap-3">
              {/* Not a dismissal -- the only other honest answer to "accept these or stop". */}
              <button
                type="button"
                className="text-sm text-muted-foreground underline underline-offset-4"
                onClick={() => logoutMutation.mutate()}
              >
                Sign out instead
              </button>
              <Button
                type="button"
                disabled={!agreed || accept.isPending}
                onClick={() => accept.mutate()}
              >
                {accept.isPending ? "Saving..." : "Accept"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
