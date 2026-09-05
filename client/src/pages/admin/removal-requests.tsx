import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getJson, apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { ShieldAlert } from "lucide-react";

type RemovalRequest = {
  id: number;
  athleteId: number;
  athleteName: string;
  guardianName: string;
  source: string;
  sourceId: number;
  label: string;
  reason: string | null;
  createdAt: string;
};

/** The queue behind a guardian's "please take this down".
 *
 * Approving here really deletes the video, through the same path the
 * retention job uses -- a request marked answered with the file still on
 * disk would be the worst of both worlds. Denying is a real option and
 * carries a note, because the parent sees whatever is written here. */
export default function AdminRemovalRequestsPage() {
  const qc = useQueryClient();
  const [notes, setNotes] = useState<Record<number, string>>({});

  const { data: requests, isLoading } = useQuery<RemovalRequest[]>({
    queryKey: ["/api/admin/removal-requests"],
    queryFn: () => getJson("/api/admin/removal-requests"),
  });

  const resolve = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "approved" | "denied" }) => {
      const res = await apiRequest("PATCH", `/api/admin/removal-requests/${id}`, {
        status,
        resolutionNote: notes[id]?.trim() || undefined,
      });
      return (await res.json()) as { deleted: boolean };
    },
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/removal-requests"] });
      toast.success(
        variables.status === "denied"
          ? "Marked as not removed."
          : result.deleted
            ? "Video deleted."
            : "Marked removed -- the file was already gone.",
      );
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't update that request"),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-extrabold uppercase tracking-wide">
          Removal requests
        </h1>
        <p className="text-sm text-muted-foreground">
          Guardians asking for a video of their athlete to be taken down. Approving deletes the
          file. Nothing here happens on its own.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (requests ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            No open requests. Nothing is waiting on you.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(requests ?? []).map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base">{r.label}</CardTitle>
                    <CardDescription>
                      {r.guardianName} asked, on behalf of {r.athleteName}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {r.reason && (
                  <p className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
                    {r.reason}
                  </p>
                )}
                <div className="space-y-1.5">
                  <Input
                    placeholder="Note back to the guardian (optional)"
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={resolve.isPending}
                    onClick={() => resolve.mutate({ id: r.id, status: "denied" })}
                  >
                    Don't remove
                  </Button>
                  <Button
                    size="sm"
                    disabled={resolve.isPending}
                    onClick={() => resolve.mutate({ id: r.id, status: "approved" })}
                  >
                    Delete the video
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
