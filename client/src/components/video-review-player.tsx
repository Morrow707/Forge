import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack } from "lucide-react";
import { CameraMetricCaveat } from "@/components/camera-metric-caveat";
import { ReadFailed } from "@/components/read-failed";
import { useQuery } from "@tanstack/react-query";
import { getJson, resolveApiUrl } from "@/lib/queryClient";
import { drawEvents } from "@/lib/review-draw";
import { drawSkeleton, nearestSkeletonFrame } from "@/lib/skeleton-draw";
import { visibleAt, speedAt, type ReviewEvent } from "@shared/video-review";
import type { PoseFrame } from "@/lib/pose-tracking";
import { cn } from "@/lib/utils";

/**
 * A saved review, played back.
 *
 * READ-ONLY, AND THAT IS THE POINT. The athlete and their guardian see exactly what the coach
 * left them -- the clip, the drawings, at the moments they were made -- and cannot alter it.
 * The coach's editor is a different component that writes the same event log this one reads.
 *
 * PLAYBACK IS RE-RENDERING, NOT A VIDEO. The event log is replayed against the video's own
 * currentTime: visibleAt says which marks belong on screen at this instant, review-draw paints
 * them. Nothing was ever burned into a file, which is why a review is kilobytes and why
 * scrubbing backwards works at all.
 *
 * The right clip, when there is one, is driven through the same sync offset the compare tool
 * used -- so a review made side-by-side replays side-by-side, in step.
 */

type ReviewClip = {
  videoUrl: string;
  source: "set" | "skill" | "reference";
  label: string;
  setId?: number | null;
};

type SavedReview = {
  id: number;
  title: string;
  leftClip: ReviewClip;
  rightClip: ReviewClip | null;
  syncL: number;
  syncR: number;
  mode: "split" | "overlay";
  purgedAt: string | null;
  events: { t: number; kind: string; payload: unknown; side: string; holdSeconds: number | null }[];
};

export function VideoReviewPlayerDialog({
  open,
  onOpenChange,
  /** Where to fetch it from -- the athlete, guardian and coach routes all return the same shape. */
  fetchUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchUrl: string;
}) {
  const { data, isLoading, isError, refetch } = useQuery<SavedReview>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{data?.title ?? "Review"}</DialogTitle>
        </DialogHeader>
        {/* isError BEFORE the spinner and before the player, per CLAUDE.md: a failed read is
            never rendered as "there is nothing here", and an editor never opens on one. */}
        {isError ? (
          <ReadFailed what="this review" onRetry={() => void refetch()} />
        ) : isLoading || !data ? (
          <div className="h-64 w-full animate-pulse rounded-lg bg-surface" />
        ) : (
          <ReviewPlayback review={data} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewPlayback({ review }: { review: SavedReview }) {
  const leftRef = useRef<HTMLVideoElement | null>(null);
  const rightRef = useRef<HTMLVideoElement | null>(null);
  const leftCanvas = useRef<HTMLCanvasElement | null>(null);
  const rightCanvas = useRef<HTMLCanvasElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [duration, setDuration] = useState(0);

  const events: ReviewEvent[] = useMemo(
    () =>
      review.events.map((e) => ({
        t: e.t,
        side: e.side as ReviewEvent["side"],
        holdSeconds: e.holdSeconds,
        payload: e.payload as ReviewEvent["payload"],
      })),
    [review.events],
  );

  // Saved skeletons, fetched per clip and only when the clip has one. Never shipped with a list
  // (see shared/video-clips.ts) -- ~450 frames of 33 landmarks each.
  const [leftFrames, setLeftFrames] = useState<PoseFrame[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const setId = review.leftClip.setId;
    if (!setId) {
      setLeftFrames(null);
      return;
    }
    void getJson(`/api/athlete/clips/${setId}/frames`)
      .then((r: { frames?: PoseFrame[] }) => {
        if (!cancelled) setLeftFrames(r?.frames ?? null);
      })
      // A missing skeleton is ordinary -- most web-captured clips have none. The review still
      // plays; only the overlay and joint-snapped guides lose their anchor.
      .catch(() => {
        if (!cancelled) setLeftFrames(null);
      });
    return () => {
      cancelled = true;
    };
  }, [review.leftClip.setId]);

  /** The right clip's time for a given left time, through the saved marks. Identical to the
   * compare tool's linkedTime -- a review made in sync replays in sync. */
  const rightTimeFor = (leftT: number) => leftT - review.syncL + review.syncR;

  // One rAF loop drives the clock, the follower and the painting. rAF rather than timeupdate:
  // timeupdate fires about four times a second, which is visibly coarse for a drawing that is
  // meant to appear on a particular frame of a lift.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const l = leftRef.current;
      if (l) {
        setT(l.currentTime);
        if (Number.isFinite(l.duration)) setDuration(l.duration);
        const r = rightRef.current;
        if (r) {
          const want = rightTimeFor(l.currentTime);
          // Only correct real drift. Seeking every frame makes the follower stutter on iOS.
          if (Math.abs(r.currentTime - want) > 0.08 && want >= 0 && want <= (r.duration || 0)) {
            r.currentTime = want;
          }
        }
        paint(leftCanvas.current, l, "left", l.currentTime);
        paint(rightCanvas.current, rightRef.current, "right", l.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  function paint(
    canvas: HTMLCanvasElement | null,
    video: HTMLVideoElement | null,
    side: "left" | "right",
    now: number,
  ) {
    if (!canvas || !video) return;
    const box = { width: canvas.clientWidth, height: canvas.clientHeight };
    if (box.width === 0 || box.height === 0) return;
    // Match the backing store to the CSS box so lines are crisp rather than resampled.
    if (canvas.width !== box.width || canvas.height !== box.height) {
      canvas.width = box.width;
      canvas.height = box.height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, box.width, box.height);
    const frame = side === "left" ? nearestSkeletonFrame(leftFrames, now) : null;
    // drawSkeleton takes the landmark array, not the frame wrapper.
    if (frame) drawSkeleton(ctx, frame.landmarks, box.width, box.height);
    drawEvents(ctx, visibleAt(events, now, side), box, frame);
  }

  function toggle() {
    const l = leftRef.current;
    const r = rightRef.current;
    if (!l) return;
    if (l.paused) {
      l.playbackRate = speedAt(events, l.currentTime);
      void l.play().catch(() => {});
      if (r) {
        r.playbackRate = l.playbackRate;
        void r.play().catch(() => {});
      }
      setPlaying(true);
    } else {
      l.pause();
      r?.pause();
      setPlaying(false);
    }
  }

  function seek(to: number) {
    const l = leftRef.current;
    if (!l) return;
    l.currentTime = to;
    const r = rightRef.current;
    if (r) r.currentTime = rightTimeFor(to);
  }

  return (
    <div className="space-y-3">
      {review.purgedAt && (
        // The notes survived the footage. Saying so is the whole reason the row is kept: a
        // review that simply vanished would read as data loss rather than as retention.
        <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-muted-foreground">
          The clip for this review has passed its retention limit and is gone. The coach's notes
          below are kept.
        </p>
      )}

      <div className={cn("grid gap-2", review.rightClip ? "sm:grid-cols-2" : "grid-cols-1")}>
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video
            ref={leftRef}
            src={resolveApiUrl(review.leftClip.videoUrl)}
            className="block w-full"
            playsInline
            preload="metadata"
          />
          <canvas ref={leftCanvas} className="pointer-events-none absolute inset-0 h-full w-full" />
          <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
            {review.leftClip.label}
          </span>
        </div>
        {review.rightClip && (
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video
              ref={rightRef}
              src={resolveApiUrl(review.rightClip.videoUrl)}
              className="block w-full"
              playsInline
              preload="metadata"
              muted
            />
            <canvas ref={rightCanvas} className="pointer-events-none absolute inset-0 h-full w-full" />
            <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
              {review.rightClip.label}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button size="sm" variant="outline" onClick={() => seek(0)} aria-label="Back to start">
          <SkipBack className="h-4 w-4" />
        </Button>
        {/* A plain range input, matching the compare tool -- there is no Slider primitive in
            this UI kit and adding one for a scrub bar is not worth the surface. */}
        <input
          type="range"
          min={0}
          max={Math.max(duration, 0.1)}
          step={1 / 60}
          value={t}
          onChange={(e) => seek(Number(e.target.value))}
          className="h-1.5 flex-1 accent-primary"
          aria-label="Scrub the review"
        />
        <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
          {t.toFixed(2)}s
        </span>
      </div>

      {/* Any angle or measurement in a review is a camera number and carries the caveat like
          every other surface. Never exempt this one: a drawn angle looks more authoritative
          than a figure in a table, not less. */}
      <CameraMetricCaveat variant="inline" />
    </div>
  );
}
