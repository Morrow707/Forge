import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Columns2,
  FlipHorizontal2,
  Layers,
  Link2,
  Link2Off,
  Pause,
  Play,
  StepBack,
  StepForward,
  VideoOff,
  X,
  Flag,
  Film,
} from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CameraMetricCaveat } from "@/components/camera-metric-caveat";
import { ClipPickerDialog, type CompareClip, type CompareSubject } from "@/components/clip-picker";
import { getJson, resolveApiUrl } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { drawSkeleton, nearestSkeletonFrame } from "@/lib/skeleton-draw";
import type { PoseFrame } from "@/lib/pose-tracking";
import {
  COMPARE_SPEEDS,
  alignableReps,
  clampTime,
  driftToleranceSeconds,
  estimateFps,
  linkedTime,
  marksForRep,
  otherSide,
  sidesToDrive,
  stepFrame,
  swapMarks,
  type Side,
  type SyncMarks,
  type TransportTarget,
} from "@/lib/video-sync";

export type { CompareClip, CompareSubject };

/**
 * Two clips, side by side or one over the other, with a transport that can drive either or both.
 *
 * Phase 1 of docs/video-review-plan.md. The time model is in lib/video-sync.ts (one offset from
 * two sync marks); this file is the <video> plumbing around it. Nothing here is saved -- a saved
 * review (Phase 2) will be the two clip references, the marks, the mode and overlay settings
 * below, and a timed event log against the LEFT clip's time.
 *
 * Transport rule: every play() and pause() on a <video> goes through driveSides, and driveSides
 * asks sidesToDrive which sides a control reaches. When the link is off, a control on one side
 * never touches the other. transport-respects-unlink.test.ts scans this file for that.
 */

type OverlaySettings = {
  opacity: number; // 0..100, the right clip's alpha over the left
  mirror: boolean; // flip the right clip horizontally (a left-hander against a right-hander)
  scale: number; // right clip's scale about its centre
  dx: number; // nudge, as a fraction of the frame width
  dy: number; // nudge, as a fraction of the frame height
};

const DEFAULT_OVERLAY: OverlaySettings = { opacity: 50, mirror: false, scale: 1, dx: 0, dy: 0 };
const RIGHT_SKELETON_COLOR = "#fb923c";
/** Overlay canvas is capped at this width; iOS WebView struggles compositing two 4K frames a tick. */
const MAX_CANVAS_WIDTH = 1280;

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec)) return "0:00.00";
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

/** The rectangle a (vw x vh) frame occupies inside a (cw x ch) box under object-fit: contain. */
function containRect(vw: number, vh: number, cw: number, ch: number) {
  if (!vw || !vh || !cw || !ch) return { x: 0, y: 0, w: cw, h: ch };
  const scale = Math.min(cw / vw, ch / vh);
  const w = vw * scale;
  const h = vh * scale;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

type FrameSample = { presentedFrames: number; mediaTime: number };

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: FrameSample) => void) => number;
};

function useClipFrames(clip: CompareClip | null): { frames: PoseFrame[] | null; failed: boolean; retry: () => void } {
  const inHand = clip?.skeletonFrames ?? null;
  const url = inHand ? null : (clip?.framesUrl ?? null);
  const q = useQuery<{ skeletonFrames: PoseFrame[] }>({
    queryKey: [url],
    queryFn: () => getJson(url!),
    enabled: !!url,
    staleTime: Infinity,
  });
  return {
    frames: inHand ?? (url ? (q.data?.skeletonFrames ?? null) : null),
    failed: !!url && q.isError,
    retry: () => void q.refetch(),
  };
}

export function VideoCompareDialog({
  open,
  onOpenChange,
  subject,
  initialLeft = null,
  initialRight = null,
  title = "Compare",
  sideFooter,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: CompareSubject;
  initialLeft?: CompareClip | null;
  initialRight?: CompareClip | null;
  title?: string;
  /** Extra per-side controls from the caller (set-video-review's best/worst flags). */
  sideFooter?: (clip: CompareClip, side: Side) => ReactNode;
}) {
  const [clips, setClips] = useState<{ left: CompareClip | null; right: CompareClip | null }>({
    left: initialLeft,
    right: initialRight,
  });
  // Re-seed from the caller each time the dialog opens: the workout page reopens it with the
  // flagged best/worst, and a stale pair from a previous open would be wrong. Not the
  // hydrate-in-an-effect shape -- these are props, not a query, and nothing is saved back.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setClips({ left: initialLeft, right: initialRight });
      setMarks({ syncL: 0, syncR: 0 });
    }
    wasOpen.current = open;
  }, [open, initialLeft, initialRight]);

  const [picking, setPicking] = useState<Side | null>(null);
  const [mode, setMode] = useState<"split" | "overlay">("split");
  const [overlay, setOverlay] = useState<OverlaySettings>(DEFAULT_OVERLAY);
  const [linked, setLinked] = useState(true);
  const [speed, setSpeed] = useState<number>(1);
  const [marks, setMarks] = useState<SyncMarks>({ syncL: 0, syncR: 0 });
  const [playing, setPlaying] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  const [times, setTimes] = useState<{ left: number; right: number }>({ left: 0, right: 0 });
  const [durations, setDurations] = useState<{ left: number; right: number }>({ left: 0, right: 0 });
  const [loadErrors, setLoadErrors] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  const [showSkeleton, setShowSkeleton] = useState(true);

  const leftVideo = useRef<HTMLVideoElement>(null);
  const rightVideo = useRef<HTMLVideoElement>(null);
  const leftCanvas = useRef<HTMLCanvasElement>(null);
  const rightCanvas = useRef<HTMLCanvasElement>(null);
  const overlayCanvas = useRef<HTMLCanvasElement>(null);
  const videoRefs = useMemo(() => ({ left: leftVideo, right: rightVideo }), []);
  const canvasRefs = useMemo(() => ({ left: leftCanvas, right: rightCanvas }), []);

  // Which side is the ruler while linked: the side the last control was aimed at. The follower
  // is corrected towards it in the animation loop.
  const masterRef = useRef<Side>("left");
  const linkedRef = useRef(linked);
  linkedRef.current = linked;
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const fpsRef = useRef<{ left: number | null; right: number | null }>({ left: null, right: null });
  const fpsSamples = useRef<{ left: FrameSample | null; right: FrameSample | null }>({ left: null, right: null });

  const leftFrames = useClipFrames(clips.left);
  const rightFrames = useClipFrames(clips.right);
  const framesRef = useRef<{ left: PoseFrame[] | null; right: PoseFrame[] | null }>({ left: null, right: null });
  framesRef.current = { left: leftFrames.frames, right: rightFrames.frames };
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const showSkeletonRef = useRef(showSkeleton);
  showSkeletonRef.current = showSkeleton;

  const video = useCallback((side: Side) => videoRefs[side].current, [videoRefs]);
  const durationOf = useCallback((side: Side) => {
    const v = videoRefs[side].current;
    return v && Number.isFinite(v.duration) ? v.duration : null;
  }, [videoRefs]);

  const seekSide = useCallback(
    (side: Side, t: number) => {
      const v = videoRefs[side].current;
      if (!v) return;
      const clamped = clampTime(t, durationOf(side));
      v.currentTime = clamped;
      setTimes((prev) => (prev[side] === clamped ? prev : { ...prev, [side]: clamped }));
    },
    [videoRefs, durationOf],
  );

  /** THE ONLY PLACE A <video> IS PLAYED OR PAUSED. See the file comment. */
  function driveSides(target: TransportTarget, action: "play" | "pause") {
    const sides = sidesToDrive(target, linked);
    const master: Side = target === "both" ? "left" : target;
    masterRef.current = master;
    if (action === "play" && sides.length === 2) {
      // Put the follower where the link says before both start, so they start together.
      const follower = otherSide(master);
      const m = video(master);
      if (m) seekSide(follower, linkedTime(master, m.currentTime, marks, durationOf(follower)));
    }
    for (const side of sides) {
      const v = videoRefs[side].current;
      if (!v) continue;
      if (action === "play") {
        void v.play().catch(() => {});
      } else {
        v.pause();
      }
    }
  }

  function scrub(target: TransportTarget, t: number) {
    const master: Side = target === "both" ? "left" : target;
    masterRef.current = master;
    seekSide(master, t);
    const sides = sidesToDrive(target, linked);
    if (sides.length === 2) {
      const follower = otherSide(master);
      seekSide(follower, linkedTime(master, clampTime(t, durationOf(master)), marks, durationOf(follower)));
    }
  }

  function step(target: TransportTarget, direction: 1 | -1) {
    driveSides(target, "pause");
    const master: Side = target === "both" ? "left" : target;
    const v = video(master);
    if (!v) return;
    scrub(target, stepFrame(v.currentTime, direction, fpsRef.current[master], durationOf(master)));
  }

  function markSync(side: Side) {
    const v = video(side);
    if (!v) return;
    setMarks((prev) => (side === "left" ? { ...prev, syncL: v.currentTime } : { ...prev, syncR: v.currentTime }));
  }

  function alignToRep(repNumber: number) {
    const next = marksForRep(clips.left?.repBreakdown, clips.right?.repBreakdown, repNumber);
    if (!next) return;
    setMarks(next);
    driveSides("both", "pause");
    seekSide("left", next.syncL);
    seekSide("right", next.syncR);
  }

  function swapSides() {
    driveSides("both", "pause");
    setClips((prev) => ({ left: prev.right, right: prev.left }));
    setMarks((prev) => swapMarks(prev));
  }

  function putClip(side: Side, clip: CompareClip) {
    driveSides(side, "pause");
    setClips((prev) => ({ ...prev, [side]: clip }));
    setMarks((prev) => (side === "left" ? { ...prev, syncL: 0 } : { ...prev, syncR: 0 }));
    setLoadErrors((prev) => ({ ...prev, [side]: false }));
  }

  // Speed applies to both clips: the offset is in clip seconds and playbackRate stretches wall
  // time, so one rate on both keeps them linked (lib/video-sync.ts).
  useEffect(() => {
    for (const side of ["left", "right"] as const) {
      const v = videoRefs[side].current;
      if (v) v.playbackRate = speed;
    }
  }, [speed, videoRefs, clips.left?.key, clips.right?.key]);

  // Frame-rate estimation through requestVideoFrameCallback where the browser has it. Nothing
  // else depends on it: stepping falls back to 1/30 s and drawing runs on rAF regardless.
  const watchFrameRate = useCallback(
    (side: Side) => {
      const v = videoRefs[side].current as VideoWithFrameCallback | null;
      if (!v || typeof v.requestVideoFrameCallback !== "function") return;
      fpsSamples.current[side] = null;
      fpsRef.current[side] = null;
      const tick = (_now: number, meta: FrameSample) => {
        const first = fpsSamples.current[side];
        if (!first) fpsSamples.current[side] = meta;
        else {
          const fps = estimateFps(first, meta);
          if (fps) {
            fpsRef.current[side] = fps;
            return; // enough samples; stop asking
          }
        }
        if (videoRefs[side].current === v) v.requestVideoFrameCallback!(tick);
      };
      v.requestVideoFrameCallback(tick);
    },
    [videoRefs],
  );

  // The draw loop: skeletons in split mode, the whole composite in overlay mode, and drift
  // correction of the follower while linked. rAF rather than timeupdate because timeupdate is
  // ~4 Hz and a skeleton that lags the body by a quarter second reads as wrong tracking.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const vl = leftVideo.current;
      const vr = rightVideo.current;

      // Drift correction. Only while linked, only when the master is playing, and only when the
      // follower is more than a tolerance off -- a seek is a keyframe decode, not free.
      if (linkedRef.current && vl && vr) {
        const master = masterRef.current;
        const m = master === "left" ? vl : vr;
        const f = master === "left" ? vr : vl;
        if (!m.paused && !m.ended) {
          const want = linkedTime(master, m.currentTime, marksRef.current, Number.isFinite(f.duration) ? f.duration : null);
          if (Math.abs(f.currentTime - want) > driftToleranceSeconds(speedRef.current, fpsRef.current[otherSide(master)])) {
            f.currentTime = want;
          }
        }
      }

      if (modeRef.current === "split") {
        for (const side of ["left", "right"] as const) {
          const v = side === "left" ? vl : vr;
          const c = canvasRefs[side].current;
          if (!v || !c) continue;
          const cw = c.clientWidth;
          const ch = c.clientHeight;
          if (c.width !== cw || c.height !== ch) {
            c.width = cw;
            c.height = ch;
          }
          const ctx = c.getContext("2d");
          if (!ctx) continue;
          ctx.clearRect(0, 0, c.width, c.height);
          const frames = framesRef.current[side];
          if (!showSkeletonRef.current || !frames?.length) continue;
          const frame = nearestSkeletonFrame(frames, v.currentTime);
          if (!frame) continue;
          const r = containRect(v.videoWidth, v.videoHeight, cw, ch);
          drawSkeleton(ctx, frame.landmarks, cw, ch, {
            transform: (x, y) => ({ x: r.x + x * r.w, y: r.y + y * r.h }),
          });
        }
        return;
      }

      // Overlay: left as the base, right composited on top with the overlay settings.
      const c = overlayCanvas.current;
      if (!c || !vl) return;
      const vw = vl.videoWidth || 640;
      const vh = vl.videoHeight || 360;
      const scaleDown = Math.min(1, MAX_CANVAS_WIDTH / vw);
      const W = Math.round(vw * scaleDown);
      const H = Math.round(vh * scaleDown);
      if (c.width !== W || c.height !== H) {
        c.width = W;
        c.height = H;
      }
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      try {
        ctx.drawImage(vl, 0, 0, W, H);
      } catch {
        // A frame not yet decodable throws in some engines; the next tick draws it.
      }
      const lf = showSkeletonRef.current ? nearestSkeletonFrame(framesRef.current.left, vl.currentTime) : null;
      if (lf) drawSkeleton(ctx, lf.landmarks, W, H);

      if (!vr) return;
      const o = overlayRef.current;
      const rr = containRect(vr.videoWidth || vw, vr.videoHeight || vh, W, H);
      const sx = o.mirror ? -o.scale : o.scale;
      const cx = W / 2 + o.dx * W;
      const cy = H / 2 + o.dy * H;
      ctx.save();
      ctx.globalAlpha = o.opacity / 100;
      ctx.translate(cx, cy);
      ctx.scale(sx, o.scale);
      try {
        ctx.drawImage(vr, rr.x - W / 2, rr.y - H / 2, rr.w, rr.h);
      } catch {
        // as above
      }
      ctx.restore();
      const rf = showSkeletonRef.current ? nearestSkeletonFrame(framesRef.current.right, vr.currentTime) : null;
      if (rf) {
        drawSkeleton(ctx, rf.landmarks, W, H, {
          color: RIGHT_SKELETON_COLOR,
          alpha: Math.max(0.35, o.opacity / 100),
          transform: (x, y) => ({
            x: cx + sx * (rr.x + x * rr.w - W / 2),
            y: cy + o.scale * (rr.y + y * rr.h - H / 2),
          }),
        });
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [open, canvasRefs]);

  const reps = alignableReps(clips.left?.repBreakdown, clips.right?.repBreakdown);
  const bothPlaying = playing.left && playing.right;
  const anyPlaying = playing.left || playing.right;

  function videoEl(side: Side) {
    const clip = clips[side];
    const v = videoRefs[side];
    return (
      <video
        ref={v}
        // Drawn onto a canvas in overlay mode; without this the canvas taints and drawImage
        // throws (same fix as VideoAnalysisDialog).
        crossOrigin="anonymous"
        src={clip ? resolveApiUrl(clip.videoUrl) : undefined}
        playsInline
        muted
        preload="auto"
        className={cn(
          "block h-full w-full object-contain",
          mode === "overlay" && "pointer-events-none absolute h-px w-px opacity-0",
        )}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          el.playbackRate = speedRef.current;
          setDurations((prev) => ({ ...prev, [side]: el.duration }));
          watchFrameRate(side);
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setTimes((prev) => (Math.abs(prev[side] - t) < 0.01 ? prev : { ...prev, [side]: t }));
        }}
        onPlay={() => setPlaying((prev) => ({ ...prev, [side]: true }))}
        onPause={() => setPlaying((prev) => ({ ...prev, [side]: false }))}
        onEnded={() => setPlaying((prev) => ({ ...prev, [side]: false }))}
        onError={() => setLoadErrors((prev) => ({ ...prev, [side]: true }))}
      />
    );
  }

  function sideHeader(side: Side) {
    const clip = clips[side];
    const frames = side === "left" ? leftFrames : rightFrames;
    return (
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setPicking(side)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs text-white/90 hover:text-white"
        >
          <Film className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{clip ? clip.label : `Choose a ${side} clip`}</span>
          {clip?.sublabel && <span className="hidden truncate text-white/50 sm:inline">· {clip.sublabel}</span>}
        </button>
        {frames.failed && (
          <button type="button" onClick={frames.retry} className="shrink-0 text-[10px] text-amber-300 underline">
            skeleton didn't load — retry
          </button>
        )}
      </div>
    );
  }

  function sideTransport(side: Side) {
    const clip = clips[side];
    const dur = durations[side] || 0;
    const disabled = !clip || loadErrors[side];
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7 shrink-0"
            disabled={disabled}
            aria-label={playing[side] ? `Pause ${side}` : `Play ${side}`}
            onClick={() => driveSides(side, playing[side] ? "pause" : "play")}
          >
            {playing[side] ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
          <Button size="icon" variant="outline" className="h-7 w-7 shrink-0" disabled={disabled} aria-label={`Step ${side} back one frame`} onClick={() => step(side, -1)}>
            <StepBack className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="h-7 w-7 shrink-0" disabled={disabled} aria-label={`Step ${side} forward one frame`} onClick={() => step(side, 1)}>
            <StepForward className="h-3.5 w-3.5" />
          </Button>
          <input
            type="range"
            min={0}
            max={dur || 1}
            step={0.001}
            value={Math.min(times[side], dur || 1)}
            disabled={disabled}
            onChange={(e) => scrub(side, Number(e.target.value))}
            className="h-1.5 min-w-0 flex-1 accent-primary"
            aria-label={`Scrub ${side}`}
          />
          <span className="w-16 shrink-0 text-right font-mono text-[10px] text-white/80">{fmtTime(times[side])}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => markSync(side)}
            className="flex items-center gap-1 rounded-full border border-white/20 px-2 py-0.5 text-[10px] font-semibold text-white/80 hover:text-white disabled:opacity-40"
          >
            <Flag className="h-3 w-3" />
            Mark sync here
          </button>
          <span className="font-mono text-[10px] text-white/50">
            sync {fmtTime(side === "left" ? marks.syncL : marks.syncR)}
          </span>
        </div>
        {clip && sideFooter ? <div>{sideFooter(clip, side)}</div> : null}
      </div>
    );
  }

  function pane(side: Side) {
    const clip = clips[side];
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        {sideHeader(side)}
        <div className="relative min-h-[140px] flex-1 overflow-hidden rounded-md bg-black">
          {!clip ? (
            <button
              type="button"
              onClick={() => setPicking(side)}
              className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-white/70 hover:text-white"
            >
              <Film className="h-8 w-8" />
              Choose a clip
            </button>
          ) : loadErrors[side] ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-white/70">
              <VideoOff className="h-6 w-6" />
              This video couldn't be loaded — it may not have finished uploading, or the file is missing.
            </div>
          ) : null}
          {videoEl(side)}
          {clip && !loadErrors[side] && (
            <canvas ref={canvasRefs[side]} className="pointer-events-none absolute inset-0 h-full w-full" />
          )}
        </div>
        {sideTransport(side)}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="inset-0 top-0 left-0 flex h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-black p-0 text-white [&>button]:hidden"
        hideClose
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <DialogTitle className="truncate text-sm text-white">{title}</DialogTitle>
          <div className="flex items-center gap-1">
            <div className="flex overflow-hidden rounded-md border border-white/20 text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setMode("split")}
                className={cn("flex items-center gap-1 px-2 py-1", mode === "split" ? "bg-white text-black" : "text-white/70")}
              >
                <Columns2 className="h-3.5 w-3.5" />
                Split
              </button>
              <button
                type="button"
                onClick={() => setMode("overlay")}
                className={cn("flex items-center gap-1 px-2 py-1", mode === "overlay" ? "bg-white text-black" : "text-white/70")}
              >
                <Layers className="h-3.5 w-3.5" />
                Overlay
              </button>
            </div>
            <DialogClose className="ml-1 rounded-sm text-white/70 hover:text-white">
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </DialogClose>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-2">
          {mode === "split" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row">
              {pane("left")}
              {pane("right")}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {sideHeader("left")}
                {sideHeader("right")}
              </div>
              <div className="relative min-h-[180px] flex-1 overflow-hidden rounded-md bg-black">
                <canvas ref={overlayCanvas} className="block h-full w-full object-contain" />
                {videoEl("left")}
                {videoEl("right")}
                {(!clips.left || !clips.right) && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
                    Choose a clip for both sides to overlay them.
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-white/80 sm:grid-cols-4">
                <label className="flex items-center gap-2">
                  <span className="w-12 shrink-0">Opacity</span>
                  <input type="range" min={0} max={100} step={5} value={overlay.opacity} onChange={(e) => setOverlay((o) => ({ ...o, opacity: Number(e.target.value) }))} className="h-1.5 flex-1 accent-primary" aria-label="Overlay opacity" />
                </label>
                <label className="flex items-center gap-2">
                  <span className="w-12 shrink-0">Scale</span>
                  <input type="range" min={0.5} max={1.5} step={0.01} value={overlay.scale} onChange={(e) => setOverlay((o) => ({ ...o, scale: Number(e.target.value) }))} className="h-1.5 flex-1 accent-primary" aria-label="Overlay scale" />
                </label>
                <label className="flex items-center gap-2">
                  <span className="w-12 shrink-0">Left/right</span>
                  <input type="range" min={-0.5} max={0.5} step={0.005} value={overlay.dx} onChange={(e) => setOverlay((o) => ({ ...o, dx: Number(e.target.value) }))} className="h-1.5 flex-1 accent-primary" aria-label="Overlay horizontal nudge" />
                </label>
                <label className="flex items-center gap-2">
                  <span className="w-12 shrink-0">Up/down</span>
                  <input type="range" min={-0.5} max={0.5} step={0.005} value={overlay.dy} onChange={(e) => setOverlay((o) => ({ ...o, dy: Number(e.target.value) }))} className="h-1.5 flex-1 accent-primary" aria-label="Overlay vertical nudge" />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant={overlay.mirror ? "default" : "outline"} className="h-7 text-xs" onClick={() => setOverlay((o) => ({ ...o, mirror: !o.mirror }))} aria-pressed={overlay.mirror}>
                  <FlipHorizontal2 className="h-3.5 w-3.5" />
                  Mirror
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOverlay(DEFAULT_OVERLAY)}>
                  Reset overlay
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {sideTransport("left")}
                {sideTransport("right")}
              </div>
            </div>
          )}

          {/* Shared transport: both sides, the link, speed, rep alignment, swap. */}
          <div className="shrink-0 space-y-2 rounded-md border border-white/15 p-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                disabled={!clips.left || !clips.right}
                onClick={() => driveSides("both", anyPlaying ? "pause" : "play")}
              >
                {bothPlaying || anyPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {anyPlaying ? "Pause both" : "Play both"}
              </Button>
              <Button size="icon" variant="outline" className="h-7 w-7" disabled={!clips.left || !clips.right} aria-label="Step both back one frame" onClick={() => step("both", -1)}>
                <StepBack className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="outline" className="h-7 w-7" disabled={!clips.left || !clips.right} aria-label="Step both forward one frame" onClick={() => step("both", 1)}>
                <StepForward className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant={linked ? "default" : "outline"}
                className="h-7 text-xs"
                aria-pressed={linked}
                onClick={() => {
                  driveSides("both", "pause");
                  setLinked((l) => !l);
                }}
              >
                {linked ? <Link2 className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
                {linked ? "Linked" : "Unlinked"}
              </Button>
              <Select value={String(speed)} onValueChange={(v) => setSpeed(Number(v))}>
                <SelectTrigger className="h-7 w-20 border-white/20 bg-transparent text-xs text-white" aria-label="Playback speed">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPARE_SPEEDS.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s}x
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant={showSkeleton ? "default" : "outline"}
                className="h-7 text-xs"
                aria-pressed={showSkeleton}
                onClick={() => setShowSkeleton((s) => !s)}
                disabled={!leftFrames.frames?.length && !rightFrames.frames?.length}
              >
                Skeleton
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!clips.left && !clips.right} onClick={swapSides}>
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Swap
              </Button>
            </div>
            {reps.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase text-white/60">Align to rep</span>
                {reps.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => alignToRep(n)}
                    className="rounded-full border border-white/20 px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10 hover:text-white"
                  >
                    {n}
                  </button>
                ))}
                {/* Rep starts come from the camera's own rep detection: aligning to one is only
                    as good as that detection. The caveat is permanent here -- it is the numbers
                    on this screen that are in question. */}
                <CameraMetricCaveat variant="inline" className="basis-full text-white/60" />
              </div>
            )}
            {linked && (
              <p className="text-[10px] text-white/50">
                Linked: right = left − {fmtTime(marks.syncL)} + {fmtTime(marks.syncR)}. Mark a sync point on each side to line
                up a moment.
              </p>
            )}
          </div>
        </div>

      </DialogContent>
      {picking && (
        <ClipPickerDialog
          open
          onOpenChange={(o) => !o && setPicking(null)}
          subject={subject}
          sideLabel={picking}
          excludeKey={clips[picking]?.key}
          suggestFrom={clips[otherSide(picking)]}
          onPick={(clip) => putClip(picking, clip)}
        />
      )}
    </Dialog>
  );
}
