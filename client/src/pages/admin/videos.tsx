import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getJson } from "@/lib/queryClient";
import { HardDrive, Video } from "lucide-react";

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

// getAdminVideos falls back to the literal string "(unknown)" for a row
// whose parent chain is broken (see storage.ts's own coalesce there) --
// parseISO can't parse that, and format() on the resulting Invalid Date
// throws, which crashed this ENTIRE page (React's top-level error
// boundary) the moment a single row like that showed up in a page of
// results. One bad row's date should never be able to take the whole list
// down with it.
function formatRowDate(date: string): string {
  const parsed = parseISO(date);
  return isNaN(parsed.getTime()) ? "Unknown date" : format(parsed, "MMM d, yyyy");
}

const PAGE_SIZE = 50;

/** Admin-only, READ-ONLY storage-visibility page for every user-uploaded
 * video on the platform (strength-set form checks, Skills clips, comment
 * attachments) -- lists total disk usage and every video, but deliberately
 * has no delete action of any kind. Videos only ever leave disk through
 * storage.sweepVideoRetentionCap, storage.sweepStaleAccountVideos, or a
 * one-time backlog cleanup -- none of which an admin triggers by hand, on
 * purpose: an admin reviewing this list has no way of knowing which video
 * an athlete or their coach still cares about.
 *
 * Paginated (Load More) rather than one giant list -- a stress test with
 * 20,000 real videos found the old unpaginated version taking 1-5s to load
 * since it stat'd every video on the platform on every visit. The running
 * "X GB total" figure is its own decoupled, server-cached fetch (see
 * /api/admin/videos/storage-summary) so it doesn't force that same full
 * scan just to show the first page of the list. */
export default function AdminVideos() {
  const [loadedPages, setLoadedPages] = useState(1);

  const { data: summary } = useQuery<{ totalBytes: number; totalCount: number; diskFreeBytes: number | null }>({
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
              attachments. Read-only -- videos are only ever removed automatically (a per-exercise retention cap, or
              an account going 12+ months inactive), never by an admin picking one out.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-2xl font-bold">{summary ? formatBytes(summary.totalBytes) : "…"}</p>
              <p className="text-sm text-muted-foreground">
                across {summary?.totalCount ?? "…"} video{summary?.totalCount === 1 ? "" : "s"}
              </p>
            </div>
            {summary && summary.diskFreeBytes !== null && (
              <div className="text-right">
                <p
                  className={`text-2xl font-bold ${summary.diskFreeBytes < 1024 * 1024 * 1024 ? "text-destructive" : ""}`}
                >
                  {formatBytes(summary.diskFreeBytes)}
                </p>
                <p className="text-sm text-muted-foreground">free on the uploads disk right now</p>
              </div>
            )}
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
