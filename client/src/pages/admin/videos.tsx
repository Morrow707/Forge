import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiRequest, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { Trash2, HardDrive, Video } from "lucide-react";

type AdminVideoRow = {
  source: "set" | "skill" | "comment";
  id: number;
  videoUrl: string;
  secondaryUrl: string | null;
  athleteId: number;
  athleteName: string;
  label: string;
  date: string;
  sizeBytes: number;
};

const SOURCE_LABEL: Record<AdminVideoRow["source"], string> = {
  set: "Strength",
  skill: "Skills",
  comment: "Comment",
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "–";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const PAGE_SIZE = 50;

/** Admin-only storage-management page for every user-uploaded video on the
 * platform (strength-set form checks, Skills clips, comment attachments) --
 * lists total disk usage, deletes one at a time, or bulk-deletes anything
 * older than N days. The one place on the platform this kind of deletion
 * exists at all; see set-video-review.tsx's own onRemove for the athlete-
 * facing equivalent, which now shares the same underlying disk cleanup.
 *
 * Paginated (Load More) rather than one giant list -- a stress test with
 * 20,000 real videos found the old unpaginated version taking 1-5s to load
 * since it stat'd every video on the platform on every visit. The running
 * "X GB total" figure is its own decoupled, server-cached fetch (see
 * /api/admin/videos/storage-summary) so it doesn't force that same full
 * scan just to show the first page of the list. */
export default function AdminVideos() {
  const queryClient = useQueryClient();
  const [olderThanDays, setOlderThanDays] = useState("90");
  const [loadedPages, setLoadedPages] = useState(1);

  const { data: summary } = useQuery<{ totalBytes: number; totalCount: number }>({
    queryKey: ["/api/admin/videos/storage-summary"],
    queryFn: () => getJson("/api/admin/videos/storage-summary"),
    staleTime: 60_000,
  });

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{
    videos: AdminVideoRow[];
    total: number;
  }>({
    queryKey: ["/api/admin/videos", loadedPages],
    queryFn: () => getJson(`/api/admin/videos?limit=${loadedPages * PAGE_SIZE}&offset=0`),
  });
  const videos = data?.videos ?? [];
  const total = data?.total ?? 0;
  const hasMore = videos.length < total;

  const deleteMutation = useMutation({
    mutationFn: async (video: AdminVideoRow) => {
      await apiRequest("DELETE", `/api/admin/videos/${video.source}/${video.id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/videos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/videos/storage-summary"] });
      toast.success("Video deleted");
    },
    onError: () => toast.error("Couldn't delete that video"),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (days: number) => {
      const res = await apiRequest("POST", "/api/admin/videos/bulk-delete", { olderThanDays: days });
      return (await res.json()) as { count: number };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/videos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/videos/storage-summary"] });
      toast.success(`Deleted ${result.count} video${result.count === 1 ? "" : "s"}`);
    },
    onError: () => toast.error("Couldn't bulk-delete videos"),
  });

  const bulkDeleteForAthleteMutation = useMutation({
    mutationFn: async (athleteId: number) => {
      const res = await apiRequest("POST", "/api/admin/videos/bulk-delete-for-athlete", { athleteId });
      return (await res.json()) as { count: number };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/videos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/videos/storage-summary"] });
      toast.success(`Deleted ${result.count} video${result.count === 1 ? "" : "s"}`);
    },
    onError: () => toast.error("Couldn't delete this athlete's videos"),
  });

  function handleBulkDelete() {
    const days = Number(olderThanDays);
    if (!Number.isFinite(days) || days < 1) {
      toast.error("Enter a valid number of days");
      return;
    }
    const cutoffLabel = format(new Date(Date.now() - days * 86400000), "MMM d, yyyy");
    if (
      window.confirm(
        `Permanently delete every video recorded before ${cutoffLabel} (older than ${days} days)? This can't be undone.`,
      )
    ) {
      bulkDeleteMutation.mutate(days);
    }
  }

  function handleDelete(video: AdminVideoRow) {
    if (
      window.confirm(`Permanently delete this video (${video.athleteName} — ${video.label})? This can't be undone.`)
    ) {
      deleteMutation.mutate(video);
    }
  }

  function handleDeleteForAthlete(athleteId: number, athleteName: string) {
    if (
      window.confirm(`Permanently delete every video/attachment for ${athleteName}? This can't be undone.`)
    ) {
      bulkDeleteForAthleteMutation.mutate(athleteId);
    }
  }

  return (
    <AppShell title="Video Storage">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Storage
            </CardTitle>
            <CardDescription>
              Every athlete-recorded video currently on disk, across strength sets, Skills sessions, and comment
              attachments. Deleting here removes the file permanently — it's not recoverable.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-2xl font-bold">
                {summary ? formatBytes(summary.totalBytes) : "…"}
              </p>
              <p className="text-sm text-muted-foreground">
                across {summary?.totalCount ?? "…"} video{summary?.totalCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Delete videos older than</span>
              <Input
                type="number"
                min={1}
                value={olderThanDays}
                onChange={(e) => setOlderThanDays(e.target.value)}
                className="h-9 w-20"
              />
              <span className="text-sm text-muted-foreground">days</span>
              <Button
                variant="outline"
                className="text-destructive"
                onClick={handleBulkDelete}
                disabled={bulkDeleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
                Bulk Delete
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading && <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>}
            {isError && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <p className="text-sm text-destructive">
                  Couldn't load this page: {error instanceof Error ? error.message : "unknown error"}
                </p>
                <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                  Retry
                </Button>
              </div>
            )}
            {!isLoading && !isError && videos.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <Video className="h-8 w-8 text-muted-foreground" />
                <p className="text-muted-foreground">No videos on disk right now.</p>
              </div>
            )}
            {!isLoading && videos.length > 0 && (
              <div className="divide-y divide-border">
                {videos.map((v) => (
                  <div key={`${v.source}-${v.id}`} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{SOURCE_LABEL[v.source]}</Badge>
                        <p className="text-sm font-semibold">{v.athleteName}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {v.label} · {format(parseISO(v.date), "MMM d, yyyy")} · {formatBytes(v.sizeBytes)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(v)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteForAthlete(v.athleteId, v.athleteName)}
                        disabled={bulkDeleteForAthleteMutation.isPending}
                        title={`Delete every video/attachment for ${v.athleteName}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete all for {v.athleteName}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {hasMore && (
              <div className="flex justify-center p-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLoadedPages((p) => p + 1)}
                  disabled={isLoading}
                >
                  Load more ({total - videos.length} remaining)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
