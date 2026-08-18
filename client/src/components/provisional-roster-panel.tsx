import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Copy, Check, Trash2, UserPlus } from "lucide-react";

type ProvisionalAthlete = {
  id: number;
  name: string;
  claimCode: string;
  sport: string | null;
  position: string | null;
  createdAt: string;
};

/** Pending claim codes from a player-intake-sheet import (see
 * PlayerIntakeImportDialog) that nobody has claimed yet -- shown so a
 * coach can re-share a link someone lost, or clear out a slot for someone
 * who isn't actually joining. A claimed slot disappears from here on its
 * own (claiming deletes the provisional row -- see claimProvisionalAthlete
 * in storage.ts), so nothing here needs a "claimed" state of its own.
 * Renders nothing when the list is empty, same as the other roster
 * sections that only matter once there's something to show. */
export function ProvisionalRosterPanel() {
  const qc = useQueryClient();
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const { data: provisional = [] } = useQuery<ProvisionalAthlete[]>({
    queryKey: ["/api/coach/roster/provisional"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/coach/roster/provisional/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/roster/provisional"] });
      toast.success("Removed");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not remove"),
  });

  if (provisional.length === 0) return null;

  function copyClaimUrl(slot: ProvisionalAthlete) {
    const url = `${window.location.origin}/claim/${slot.claimCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(slot.id);
      setTimeout(() => setCopiedId((c) => (c === slot.id ? null : c)), 1500);
    });
  }

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <UserPlus className="h-4 w-4" />
          Pending Claim Codes ({provisional.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {provisional.map((slot) => (
          <div
            key={slot.id}
            className="flex items-center justify-between gap-2 rounded-md border border-border p-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{slot.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[slot.sport, slot.position].filter(Boolean).join(" · ") || "No sport/position on file"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button type="button" size="sm" variant="outline" onClick={() => copyClaimUrl(slot)}>
                {copiedId === slot.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => deleteMutation.mutate(slot.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
