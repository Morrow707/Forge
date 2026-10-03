import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReadFailed } from "@/components/read-failed";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { EyeOff, Eye, Check } from "lucide-react";

type Author = { id: number; name: string };
type Report = {
  id: number;
  reason: string;
  createdAt: string;
  reporter: Author | null;
  thread: { id: number; title: string; body: string; author: Author; hiddenAt: string | null } | null;
  reply: { id: number; body: string; author: Author; hiddenAt: string | null; threadId: number } | null;
};

/** The moderation queue for the Coaches Corner discussion. Every report a coach files lands
 * here until an admin resolves it. Hide is reversible; nothing is deleted. */
export default function AdminCoachesCornerReports() {
  const qc = useQueryClient();
  const { data = [], isLoading, isError, refetch } = useQuery<Report[]>({
    queryKey: ["/api/admin/discussion/reports"],
    queryFn: () => getJson("/api/admin/discussion/reports"),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/admin/discussion/reports"] });

  const hide = useMutation({
    mutationFn: async ({ kind, id, hidden }: { kind: "thread" | "reply"; id: number; hidden: boolean }) => {
      await apiRequest("PATCH", kind === "thread" ? `/api/admin/discussion/threads/${id}` : `/api/admin/discussion/replies/${id}`, {
        hidden,
        reason: hidden ? "Hidden by Forge after a report" : null,
      });
    },
    onSuccess: invalidate,
    onError: (err: ApiError) => toast.error(err.message || "Couldn't update"),
  });
  const resolve = useMutation({
    mutationFn: async ({ id, resolution }: { id: number; resolution: string }) => {
      await apiRequest("POST", `/api/admin/discussion/reports/${id}/resolve`, { resolution });
    },
    onSuccess: invalidate,
    onError: (err: ApiError) => toast.error(err.message || "Couldn't resolve"),
  });

  return (
    <AppShell title="Discussion reports">
      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Posts coaches have flagged on the Coaches Corner board. Hide what breaks the rules (an athlete
        named, abuse, spam), then resolve the report. Hiding is reversible and nothing is deleted.
      </p>
      {isError ? (
        <ReadFailed what="the reports" onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-surface" />
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing open.</p>
      ) : (
        <div className="space-y-3">
          {data.map((r) => {
            const target = r.reply
              ? { kind: "reply" as const, id: r.reply.id, body: r.reply.body, author: r.reply.author, hidden: Boolean(r.reply.hiddenAt), label: "Reply" }
              : r.thread
                ? { kind: "thread" as const, id: r.thread.id, body: `${r.thread.title}\n\n${r.thread.body}`, author: r.thread.author, hidden: Boolean(r.thread.hiddenAt), label: "Thread" }
                : null;
            return (
              <Card key={r.id}>
                <CardContent className="space-y-3 p-4">
                  <p className="text-xs text-muted-foreground">
                    Reported by {r.reporter?.name ?? "a coach"} {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}:{" "}
                    <span className="font-semibold text-foreground">{r.reason}</span>
                  </p>
                  {target ? (
                    <div className="rounded-md border border-border bg-surface p-3">
                      <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                        {target.label} by {target.author.name}
                        {target.hidden && " (hidden)"}
                      </p>
                      <p className="whitespace-pre-line text-sm">{target.body}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">The post no longer exists.</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {target && (
                      <Button size="sm" variant="outline" onClick={() => hide.mutate({ kind: target.kind, id: target.id, hidden: !target.hidden })} disabled={hide.isPending}>
                        {target.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        {target.hidden ? "Unhide" : "Hide"}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => resolve.mutate({ id: r.id, resolution: target?.hidden ? "Hidden" : "No action" })} disabled={resolve.isPending}>
                      <Check className="h-4 w-4" />
                      Resolve
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
