import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getJson, apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { ShieldCheck, Lock } from "lucide-react";

type GuardianLinkStatus = { id: number; removable: boolean } | null;

/** Athlete-side view of their own guardian link -- see storage.removeGuardianLink's
 * own comment for the rule this renders: while an athlete is a known minor, there
 * is no remove control here at all, only a status line explaining why. The
 * button only appears once the account's own dateOfBirth resolves to 18+. */
export function GuardianAccessDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: link, isLoading } = useQuery<GuardianLinkStatus>({
    queryKey: ["/api/account/guardian-link"],
    queryFn: () => getJson("/api/account/guardian-link"),
    enabled: open,
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/guardian-links/${link?.id}`);
    },
    onSuccess: () => {
      qc.setQueryData(["/api/account/guardian-link"], null);
      toast.success("Guardian access removed");
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not remove guardian access"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Guardian access
          </DialogTitle>
          <DialogDescription>
            {isLoading
              ? "Checking..."
              : !link
                ? "No guardian account is linked to your profile."
                : link.removable
                  ? "A guardian account is linked to your profile. Since you're 18 or older, you can remove it."
                  : "A guardian account is linked to your profile. It can't be removed until you turn 18."}
          </DialogDescription>
        </DialogHeader>
        {!isLoading && link && !link.removable && (
          <p className="flex items-start gap-2 rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This stays in place while you're under 18, whether or not you'd rather it didn't.
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!isLoading && link?.removable && (
            <Button
              type="button"
              variant="destructive"
              disabled={removeMutation.isPending}
              onClick={() => removeMutation.mutate()}
            >
              {removeMutation.isPending ? "Removing…" : "Remove guardian access"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
