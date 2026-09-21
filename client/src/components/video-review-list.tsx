import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Film, Share2, Lock } from "lucide-react";
import { ReadFailed } from "@/components/read-failed";
import { getJson } from "@/lib/queryClient";
import { lazyDialog } from "@/components/lazy-dialog";
import { format } from "date-fns";

// Both dialogs are lazy: each pulls in a canvas renderer, and most visits to either page never
// open one. Same treatment as the analysis and compare dialogs.
const VideoReviewPlayerDialog = lazyDialog(() =>
  import("@/components/video-review-player").then((m) => ({ default: m.VideoReviewPlayerDialog })),
);
const VideoReviewEditorDialog = lazyDialog(() =>
  import("@/components/video-review-editor").then((m) => ({ default: m.VideoReviewEditorDialog })),
);

type ReviewRow = {
  id: number;
  title: string;
  leftClip: { videoUrl: string; label: string };
  sharedWithAthleteAt: string | null;
  sentToCoachAt?: string | null;
  purgedAt: string | null;
  updatedAt: string;
};

/**
 * The list of saved reviews, for whoever is looking.
 *
 * One component, two modes, because the difference is genuinely small: a coach opens the editor
 * and sees their unshared drafts marked as such; an athlete or guardian opens the read-only
 * player and only ever receives rows that were shared, because the ROUTE decides that -- not
 * this component. Nothing here filters on `sharedWithAthleteAt`; a list that enforced its own
 * privacy in the client would be one refresh away from showing a draft.
 */
export function VideoReviewList({
  fetchUrl,
  mode,
  /** Where to fetch one review from, given its id. Differs per role. */
  reviewUrl,
  emptyHint,
}: {
  fetchUrl: string;
  /** "coach" edits a coach's own review; "self" edits an athlete's own (Phase 4b); "read-only"
   * watches somebody else's. The mode decides which editor routes are written to, and the
   * route decides what may be read -- never this component. */
  mode: "coach" | "self" | "read-only";
  reviewUrl: (id: number) => string;
  emptyHint: string;
}) {
  const { data, isLoading, isError, refetch } = useQuery<ReviewRow[]>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
  });
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<ReviewRow | null>(null);

  // isError before any emptiness claim: "no reviews yet" and "we could not ask" are different
  // things, and a coach reading the second as the first thinks their work vanished.
  if (isError) return <ReadFailed what="saved reviews" onRetry={() => void refetch()} />;
  if (isLoading) return <div className="h-20 w-full animate-pulse rounded-lg bg-surface" />;

  const reviews = data ?? [];
  if (reviews.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyHint}</p>;
  }

  return (
    <div className="space-y-2">
      {reviews.map((r) => (
        <Card key={r.id}>
          <CardContent className="flex items-center gap-3 p-4">
            <Film className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {r.leftClip?.label} &middot; {format(new Date(r.updatedAt), "d MMM yyyy")}
                {r.purgedAt ? " · clip expired, notes kept" : ""}
              </p>
            </div>
            {mode === "self" &&
              (r.sentToCoachAt ? (
                <span className="flex items-center gap-1 text-xs text-emerald-500">
                  <Share2 className="h-3.5 w-3.5" /> Sent
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" /> Only you
                </span>
              ))}
            {mode === "coach" &&
              (r.sharedWithAthleteAt ? (
                <span className="flex items-center gap-1 text-xs text-emerald-500">
                  <Share2 className="h-3.5 w-3.5" /> Shared
                </span>
              ) : (
                // A draft is labelled on the coach's own screen so they can tell at a glance
                // what the athlete can and cannot see.
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="h-3.5 w-3.5" /> Draft
                </span>
              ))}
            {/* Watch is where the export lives (Phase 5): burning a review requires playing
                it through, and the player is the screen that already has both videos and the
                voice-over loaded. A coach gets both buttons. */}
            {mode === "coach" && (
              <Button size="sm" variant="ghost" onClick={() => setOpenId(r.id)}>
                Watch
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => (mode === "read-only" ? setOpenId(r.id) : setEditing(r))}
            >
              {mode === "read-only" ? "Watch" : "Edit"}
            </Button>
          </CardContent>
        </Card>
      ))}

      {openId != null && (
        <VideoReviewPlayerDialog
          open={openId != null}
          onOpenChange={(o) => !o && setOpenId(null)}
          fetchUrl={reviewUrl(openId)}
          // Exporting is publishing, so it is offered only to a coach on their own reviews.
          // The server refuses anybody else regardless; this is what stops a button being
          // drawn that always fails.
          canExport={mode === "coach"}
        />
      )}
      {editing && (
        <VideoReviewEditorDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          reviewId={editing.id}
          title={editing.title}
          clipUrl={editing.leftClip.videoUrl}
          clipLabel={editing.leftClip.label}
          variant={mode === "self" ? "self" : "coach"}
          // For a self-review the flag on the button is "sent to my coach", not "shared with
          // the athlete" -- the athlete IS the subject, so the coach-facing flag would read as
          // permanently on.
          initialShared={
            mode === "self" ? !!editing.sentToCoachAt : !!editing.sharedWithAthleteAt
          }
          onSaved={() => void refetch()}
        />
      )}
    </div>
  );
}
