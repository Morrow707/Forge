import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

type InstitutionalAgreementStatus = {
  required: boolean;
  accepted: boolean;
  acceptedAt: string | null;
  documentText: string;
};

/** Shown only to the primary coach of an org billing account who hasn't
 * accepted the Institutional Service Agreement yet -- see
 * server/seed-data/legal-documents-draft.ts's INSTITUTIONAL_AGREEMENT_DRAFT.
 * Same "flag, don't block" treatment as the other account banners in this
 * app: nothing in this app currently blocks anything on the missing
 * acceptance, so this is a persistent reminder, not a gate. Fetches its own
 * status rather than reading it off the cached user object, since
 * "required" depends on billingTier/primary status the client doesn't
 * otherwise need to know about. */
export function InstitutionalAgreementBanner() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: status } = useQuery<InstitutionalAgreementStatus>({
    queryKey: ["/api/coach/institutional-agreement"],
    queryFn: () => getJson("/api/coach/institutional-agreement"),
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach/institutional-agreement/accept");
      return (await res.json()) as InstitutionalAgreementStatus;
    },
    onSuccess: (updated) => {
      qc.setQueryData(["/api/coach/institutional-agreement"], updated);
      toast.success("Institutional Service Agreement accepted");
      setOpen(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't record acceptance"),
  });

  if (!status?.required || status.accepted) return null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-500 md:px-8">
        <span className="flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          Your organization's account needs to accept the Institutional Service Agreement.
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-amber-500 hover:text-amber-500"
          onClick={() => setOpen(true)}
        >
          Review
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Institutional Service Agreement</DialogTitle>
            <DialogDescription>
              Applies to your organization's paid account, in addition to the individual Terms of
              Service every coach and athlete already accepts.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground">
            {status.documentText}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Not now
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => acceptMutation.mutate()}
              disabled={acceptMutation.isPending}
            >
              {acceptMutation.isPending ? "Saving…" : "Accept"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
