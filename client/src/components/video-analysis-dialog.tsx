import { useEffect, useRef, useState } from "react";
import { shareOrDownloadBlob } from "@/lib/share-file";
import { resolveApiUrl } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { angleAtVertex, MIN_VISIBILITY, type PoseFrame } from "@/lib/pose-tracking";
import { analyzeVideoPose } from "@/lib/video-pose-analysis";
import { resolveVideoDuration } from "@/lib/video-recording";
import { MEASURABLE_JOINTS, findNearestJoint, measureJoint } from "@/lib/joint-angles";
import {
  X,
  PersonStanding,
  Compass,
  Pencil,
  Ruler,
  Timer,
  Play,
  Pause,
  StepBack,
  StepForward,
  Undo2,
  Trash2,
  Loader2,
  FlipHorizontal2,
  VideoOff,
  Download,
} from "lucide-react";

type Tool = "none" | "angle" | "draw" | "ruler";
type PixelPoint = { x: number; y: number };
type Stroke = { points: PixelPoint[]; color: string };

const SKELETON_COLOR = "#2dd4bf";
const ANGLE_COLOR = "#fbbf24";
const RULER_COLOR = "#38bdf8";
const DRAW_COLORS = ["#fbbf24", "#f65b23", "#38bdf8", "#ffffff"];
// 2x added alongside the existing slow-mo options -- those cover "study
// this moment frame by frame," but a longer clip also needs a fast way to
// scan past the parts that don't matter, which nothing here offered before.
const SPEEDS = [0.1, 0.25, 0.5, 1, 2];
const FRAME_STEP_SEC = 1 / 30;

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function nearestFrame(frames: PoseFrame[], tSec: number): PoseFrame | null {
  if (!frames.length) return null;
  let best = frames[0];
  let bestDist = Math.abs(best.t - tSec);
  for (const f of frames) {
    const d = Math.abs(f.t - tSec);
    if (d < bestDist) {
      bestDist = d;
      best = f;
    }
  }
  return best;
}

function drawSkeleton(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], width: number, height: number) {
  ctx.strokeStyle = SKELETON_COLOR;
  ctx.lineWidth = 3;
  ctx.fillStyle = SKELETON_COLOR;
  for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!a || !b || a.visibility < MIN_VISIBILITY || b.visibility < MIN_VISIBILITY) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }
  for (const lm of landmarks) {
    if (lm.visibility < MIN_VISIBILITY) continue;
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Small white-outlined dots at every measurable joint (distinct from the
// skeleton's own teal joint dots) -- an affordance so it's obvious which
// points on the body are tappable while the Angle tool is active, the same
// way OnForm's skeleton lights up tappable joints.
function drawJointHints(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], width: number, height: number) {
  for (const joint of MEASURABLE_JOINTS) {
    const p = landmarks[joint.triple[1]];
    if (!p || p.visibility < MIN_VISIBILITY) continue;
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, 7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = ANGLE_COLOR;
    ctx.stroke();
  }
}

function drawAngleLabel(ctx: CanvasRenderingContext2D, x: number, y: number, deg: number, color: string) {
  const text = `${Math.round(deg)}°`;
  ctx.font = "600 13px sans-serif";
  const padding = 5;
  const textWidth = ctx.measureText(text).width;
  const boxW = textWidth + padding * 2;
  const boxH = 20;
  const bx = x + 10;
  const by = y - boxH - 6;
  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, boxW, boxH);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, bx + padding, by + boxH - 6);
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawStroke(ctx: CanvasRenderingContext2D, points: PixelPoint[], color: string) {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

/** Full-screen review tool for any already-recorded video (a form-check
 * clip, a per-set video, a skill clip) -- modeled on OnForm's own analysis
 * toolset (skeleton tracking with tap-a-joint angles, a manual angle tool,
 * a drawing toolbox, a ruler, a stopwatch, slow-motion/frame-step playback),
 * per OnForm's own knowledge base and app-listing descriptions. Runs the
 * same on-device pose model the live camera trackers use, just against a
 * finished video instead of a live stream -- see video-pose-analysis.ts.
 * Nothing here uploads or modifies the source video; this is read-only
 * review layered on top of it. */
export function VideoAnalysisDialog({
  open,
  onOpenChange,
  videoUrl,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyzedUrlRef = useRef<string | null>(null);

  const poseFramesRef = useRef<PoseFrame[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<PixelPoint[] | null>(null);
  const manualAnglePointsRef = useRef<PixelPoint[]>([]);
  const rulerPointsRef = useRef<PixelPoint[]>([]);

  const [showSkeleton, setShowSkeleton] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [analyzeMessage, setAnalyzeMessage] = useState<string | null>(null);

  const [activeTool, setActiveTool] = useState<Tool>("none");
  const [drawColor, setDrawColor] = useState(DRAW_COLORS[0]);

  const [selectedJointKey, setSelectedJointKey] = useState<string | null>(null);
  const [manualAnglePointCount, setManualAnglePointCount] = useState(0);
  const [manualAngleDeg, setManualAngleDeg] = useState<number | null>(null);
  const [flipAngle, setFlipAngle] = useState(false);

  const [rulerPixelDist, setRulerPixelDist] = useState<number | null>(null);
  const [calibration, setCalibration] = useState<{ pixelsPerInch: number } | null>(null);
  const [calibrateInput, setCalibrateInput] = useState("");

  const [showStopwatch, setShowStopwatch] = useState(false);
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [markOut, setMarkOut] = useState<number | null>(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  // Set when the <video> element's src fails to load -- most often a
  // videoUrl whose file no longer exists on the server (see /uploads'
  // own comment in server/routes.ts). Without this, a missing file just
  // silently never fires onLoadedMetadata: duration stays 0, the play
  // button does nothing, and there's no indication anywhere that
  // anything's wrong, which is exactly the "00:00, nothing plays" dead
  // end this exists to replace with an actual explanation.
  const [loadError, setLoadError] = useState(false);

  function resetForNewVideo() {
    poseFramesRef.current = [];
    analyzedUrlRef.current = null;
    strokesRef.current = [];
    currentStrokeRef.current = null;
    manualAnglePointsRef.current = [];
    rulerPointsRef.current = [];
    setShowSkeleton(false);
    setAnalyzing(false);
    setAnalyzeMessage(null);
    setActiveTool("none");
    setSelectedJointKey(null);
    setManualAnglePointCount(0);
    setManualAngleDeg(null);
    setFlipAngle(false);
    setRulerPixelDist(null);
    setCalibration(null);
    setCalibrateInput("");
    setShowStopwatch(false);
    setMarkIn(null);
    setMarkOut(null);
    setDuration(0);
    setCurrentTime(0);
    setPlaying(false);
    setSpeed(1);
    setLoadError(false);
  }

  // Re-runs whenever the dialog opens on a (possibly new) video -- Dialog
  // unmounts its content when closed, so there's no separate open/videoUrl
  // effect needed; this fires once per open via the key on DialogContent's
  // child below being remounted... in practice simplest to just reset
  // inline the first time the video element mounts.
  const lastOpenRef = useRef(false);
  if (open && !lastOpenRef.current) {
    resetForNewVideo();
  }
  lastOpenRef.current = open;

  // toggleSkeleton is async and calls redraw() again after an await -- a
  // plain `redraw` reference inside that continuation would still be the
  // closure captured when toggleSkeleton was invoked (the render BEFORE
  // setShowSkeleton took effect), so it would redraw with the stale,
  // pre-toggle showSkeleton value -- exactly backwards from what the
  // toggle just did. redrawRef always points at the latest render's
  // redraw, kept current below, so a delayed call always sees current
  // state instead of whatever was true when the toggle was first tapped.
  const redrawRef = useRef<() => void>(() => {});

  function redraw() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.clientWidth === 0) return;
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    // The video is centered (not stretched) within its flex container and
    // sizes itself from its own aspect ratio -- its rendered box moves and
    // resizes on every rotation/resize, and offsetLeft/Top/Width/Height
    // read wherever that box actually landed just now, so the canvas
    // (sharing the same offsetParent) tracks it exactly instead of the
    // canvas's own width/height staying stale relative to a video that's
    // since resized out from under it -- same alignment guarantee the CSS
    // inset-0 trick gave when the video used to fill its wrapper exactly,
    // just recomputed here since a centered+contained box doesn't.
    canvas.style.width = `${video.clientWidth}px`;
    canvas.style.height = `${video.clientHeight}px`;
    canvas.style.left = `${video.offsetLeft}px`;
    canvas.style.top = `${video.offsetTop}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let frame: PoseFrame | null = null;
    if (showSkeleton && poseFramesRef.current.length) {
      frame = nearestFrame(poseFramesRef.current, video.currentTime);
      if (frame) {
        drawSkeleton(ctx, frame.landmarks, canvas.width, canvas.height);
        if (activeTool === "angle") drawJointHints(ctx, frame.landmarks, canvas.width, canvas.height);
      }
    }

    if (selectedJointKey && frame) {
      const joint = MEASURABLE_JOINTS.find((j) => j.key === selectedJointKey);
      const measured = joint ? measureJoint(frame.landmarks, frame.worldLandmarks, joint) : null;
      if (measured) {
        const deg = flipAngle ? 360 - measured.insideDeg : measured.insideDeg;
        drawAngleLabel(ctx, measured.at.x * canvas.width, measured.at.y * canvas.height, deg, ANGLE_COLOR);
      }
    }

    const mpts = manualAnglePointsRef.current;
    if (mpts.length >= 2) {
      ctx.strokeStyle = ANGLE_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mpts[0].x, mpts[0].y);
      ctx.lineTo(mpts[1].x, mpts[1].y);
      ctx.stroke();
      if (mpts.length === 3) {
        ctx.beginPath();
        ctx.moveTo(mpts[1].x, mpts[1].y);
        ctx.lineTo(mpts[2].x, mpts[2].y);
        ctx.stroke();
        const insideDeg = angleAtVertex(mpts[0], mpts[1], mpts[2]);
        drawAngleLabel(ctx, mpts[1].x, mpts[1].y, flipAngle ? 360 - insideDeg : insideDeg, ANGLE_COLOR);
      }
    }
    for (const p of mpts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = ANGLE_COLOR;
      ctx.fill();
    }

    const rpts = rulerPointsRef.current;
    if (rpts.length === 2) {
      ctx.strokeStyle = RULER_COLOR;
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.moveTo(rpts[0].x, rpts[0].y);
      ctx.lineTo(rpts[1].x, rpts[1].y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const p of rpts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = RULER_COLOR;
      ctx.fill();
    }

    for (const stroke of strokesRef.current) drawStroke(ctx, stroke.points, stroke.color);
    if (currentStrokeRef.current) drawStroke(ctx, currentStrokeRef.current, drawColor);
  }
  redrawRef.current = redraw;

  // Any viewport resize moves and resizes the video's own centered+contained
  // box -- without this, the canvas stays sized/positioned for wherever that
  // box was before the resize until some unrelated state change happens to
  // trigger another redraw. The app is portrait-locked (see Info.plist's own
  // comment on why device rotation isn't in play here), but this still
  // matters for iPad's upside-down portrait and any other resize cause. The
  // rAF delay lets WebKit finish its own layout pass first; reading
  // offsetLeft/clientWidth at the exact moment resize/orientationchange
  // fires can catch the video's box mid-transition.
  useEffect(() => {
    if (!open) return;
    function handleResize() {
      requestAnimationFrame(() => redrawRef.current());
    }
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [open]);

  // A genuine frame change (scrubbing, or starting playback) invalidates
  // every frame-anchored annotation -- a freehand circle drawn around a
  // dropped elbow at 0:03 has no meaning once the athlete's moved to 0:04.
  // The skeleton-linked joint angle is deliberately exempt: it's supposed
  // to keep tracking as the body moves, that's the entire point of it.
  function handleFrameChanged() {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    manualAnglePointsRef.current = [];
    setManualAnglePointCount(0);
    setManualAngleDeg(null);
    rulerPointsRef.current = [];
    setRulerPixelDist(null);
    redraw();
  }

  async function toggleSkeleton() {
    if (showSkeleton) {
      setShowSkeleton(false);
      requestAnimationFrame(() => redrawRef.current());
      return;
    }
    setShowSkeleton(true);
    if (analyzedUrlRef.current === videoUrl) {
      requestAnimationFrame(() => redrawRef.current());
      return;
    }
    setAnalyzing(true);
    setAnalyzeMessage(null);
    setAnalyzeProgress(0);
    try {
      const frames = await analyzeVideoPose(videoUrl, setAnalyzeProgress);
      poseFramesRef.current = frames;
      analyzedUrlRef.current = videoUrl;
      if (frames.length === 0) {
        setAnalyzeMessage("Couldn't find a body clearly enough in this clip to track it.");
        setShowSkeleton(false);
      }
    } catch (err: any) {
      setAnalyzeMessage(err?.message || "Couldn't analyze this video.");
      setShowSkeleton(false);
    } finally {
      setAnalyzing(false);
      requestAnimationFrame(() => redrawRef.current());
    }
  }

  function selectTool(tool: Tool) {
    const next = activeTool === tool ? "none" : tool;
    setActiveTool(next);
    if (next !== "none" && videoRef.current && !videoRef.current.paused) videoRef.current.pause();
  }

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>): PixelPoint {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (activeTool === "none") return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const point = pointFromEvent(e);

    if (activeTool === "angle") {
      if (showSkeleton && poseFramesRef.current.length) {
        const frame = nearestFrame(poseFramesRef.current, video.currentTime);
        if (frame) {
          const nx = point.x / canvas.width;
          const ny = point.y / canvas.height;
          const joint = findNearestJoint(frame.landmarks, nx, ny);
          if (joint) {
            setSelectedJointKey(joint.key);
            manualAnglePointsRef.current = [];
            setManualAnglePointCount(0);
            setManualAngleDeg(null);
            redraw();
            return;
          }
        }
      }
      setSelectedJointKey(null);
      const pts = manualAnglePointsRef.current;
      const nextPts = pts.length >= 3 ? [point] : [...pts, point];
      manualAnglePointsRef.current = nextPts;
      setManualAnglePointCount(nextPts.length);
      if (nextPts.length === 3) {
        const insideDeg = angleAtVertex(nextPts[0], nextPts[1], nextPts[2]);
        setManualAngleDeg(insideDeg);
      } else {
        setManualAngleDeg(null);
      }
      redraw();
      return;
    }

    if (activeTool === "draw") {
      e.currentTarget.setPointerCapture(e.pointerId);
      currentStrokeRef.current = [point];
      redraw();
      return;
    }

    if (activeTool === "ruler") {
      const pts = rulerPointsRef.current;
      if (pts.length >= 2) {
        rulerPointsRef.current = [point];
        setRulerPixelDist(null);
      } else {
        const nextPts = [...pts, point];
        rulerPointsRef.current = nextPts;
        if (nextPts.length === 2) {
          setRulerPixelDist(Math.hypot(nextPts[1].x - nextPts[0].x, nextPts[1].y - nextPts[0].y));
        }
      }
      redraw();
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (activeTool !== "draw" || !currentStrokeRef.current) return;
    currentStrokeRef.current.push(pointFromEvent(e));
    redraw();
  }

  function handlePointerUp() {
    if (activeTool === "draw" && currentStrokeRef.current) {
      if (currentStrokeRef.current.length > 1) strokesRef.current.push({ points: currentStrokeRef.current, color: drawColor });
      currentStrokeRef.current = null;
      redraw();
    }
  }

  function undoStroke() {
    strokesRef.current = strokesRef.current.slice(0, -1);
    redraw();
  }

  function clearStrokes() {
    strokesRef.current = [];
    redraw();
  }

  function clearAngle() {
    setSelectedJointKey(null);
    manualAnglePointsRef.current = [];
    setManualAnglePointCount(0);
    setManualAngleDeg(null);
    redraw();
  }

  function applyCalibration() {
    const inches = Number(calibrateInput);
    if (!rulerPixelDist || !Number.isFinite(inches) || inches <= 0) return;
    setCalibration({ pixelsPerInch: rulerPixelDist / inches });
    setCalibrateInput("");
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  }

  // Everything this dialog's tools produce -- a measured joint angle, a
  // ruler reading, a circled fault -- used to be purely on-screen: close
  // the dialog and it's gone, with no way to actually hand that specific
  // insight to anyone. This composites the current frame with whatever the
  // overlay canvas is already showing (skeleton, angle label, ruler,
  // freehand strokes -- exactly what's visible on screen, since that's
  // literally what's drawn in canvasRef) into one image and downloads it,
  // so a coach can save/share the moment instead of just having looked at
  // it once.
  function saveSnapshot() {
    const video = videoRef.current;
    const overlay = canvasRef.current;
    if (!video || !overlay) return;
    video.pause();
    const out = document.createElement("canvas");
    out.width = video.videoWidth || overlay.width;
    out.height = video.videoHeight || overlay.height;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, out.width, out.height);
    ctx.drawImage(overlay, 0, 0, out.width, out.height);
    out.toBlob((blob) => {
      if (!blob) return;
      const namePart = (title ?? "frame").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      void shareOrDownloadBlob(blob, `${namePart}-${Math.round(video.currentTime * 100)}.png`);
    }, "image/png");
  }

  function stepFrame(dir: 1 | -1) {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = Math.min(duration, Math.max(0, video.currentTime + dir * FRAME_STEP_SEC));
  }

  function changeSpeed(s: number) {
    setSpeed(s);
    if (videoRef.current) videoRef.current.playbackRate = s;
  }

  const measuredInches = rulerPixelDist != null && calibration ? rulerPixelDist / calibration.pixelsPerInch : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Full-screen (matching form-video-recorder-dialog.tsx's own pattern)
          rather than a centered card -- gives the video the whole viewport
          to work with instead of a fraction of it. safe-area insets on the
          header/footer keep the close button and playback controls clear of
          the notch/home indicator the same way the rest of the native app
          already accounts for them. */}
      <DialogContent
        className="inset-0 top-0 left-0 flex h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-black p-0 [&>button]:hidden"
        hideClose
      >
        <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <DialogTitle className="text-sm text-white">{title ?? "Video Analysis"}</DialogTitle>
          <DialogClose className="rounded-sm text-white/70 ring-offset-background transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-ring">
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
          {loadError ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-white/70">
              <VideoOff className="h-8 w-8" />
              This video couldn't be loaded — it may not have finished uploading, or the file is missing.
            </div>
          ) : (
            <>
              {/* Centers the video and lets it size itself from its own
                  aspect ratio (never stretched, never letterboxed) -- unlike
                  the fixed-vh-cap this replaced, this reflows correctly on
                  every rotation with no JS recalculation needed. The canvas
                  is a sibling, not nested inside this wrapper, because its
                  own position/size is now synced to the video's actual
                  rendered box directly in redraw() (see its own comment) --
                  a centered, intrinsically-sized box can't be targeted with
                  a plain CSS inset-0 the way a wrapper that always exactly
                  matched its child could. */}
              <div className="flex h-full w-full items-center justify-center">
                <video
                  ref={videoRef}
                  // Save Snapshot below draws this element onto a canvas --
                  // same cross-origin WebGL/canvas taint issue and same fix
                  // as video-pose-analysis.ts's offscreen analysis video
                  // (see its own comment): without this, tapping Save
                  // Snapshot throws the same "operation is insecure" error
                  // this element was otherwise silently exempt from since
                  // plain playback alone doesn't touch canvas/WebGL.
                  crossOrigin="anonymous"
                  src={resolveApiUrl(videoUrl)}
                  playsInline
                  className="block h-auto max-h-full w-auto max-w-full"
                  onLoadedMetadata={() => {
                    const v = videoRef.current;
                    // See resolveVideoDuration's own comment -- a
                    // MediaRecorder-produced clip reads back Infinity here
                    // otherwise, which fmtTime then displays as a
                    // stuck-looking "0:00" total duration.
                    if (v) resolveVideoDuration(v).then(setDuration);
                    redraw();
                  }}
                  onTimeUpdate={() => {
                    const v = videoRef.current;
                    if (v) setCurrentTime(v.currentTime);
                    redraw();
                  }}
                  onSeeked={handleFrameChanged}
                  onPlay={() => {
                    setPlaying(true);
                    handleFrameChanged();
                  }}
                  onPause={() => setPlaying(false)}
                  onError={() => setLoadError(true)}
                />
              </div>
              <canvas
                ref={canvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className={cn("absolute", activeTool !== "none" ? "touch-none" : "pointer-events-none")}
              />

              <div className="absolute right-2 top-2 flex flex-col gap-1.5">
                <RailButton icon={PersonStanding} active={showSkeleton} label="Skeleton" onClick={toggleSkeleton} />
                <RailButton icon={Compass} active={activeTool === "angle"} label="Angle" onClick={() => selectTool("angle")} />
                <RailButton icon={Pencil} active={activeTool === "draw"} label="Draw" onClick={() => selectTool("draw")} />
                <RailButton icon={Ruler} active={activeTool === "ruler"} label="Ruler" onClick={() => selectTool("ruler")} />
                <RailButton
                  icon={Timer}
                  active={showStopwatch}
                  label="Stopwatch"
                  onClick={() => setShowStopwatch((v) => !v)}
                />
                <RailButton icon={Download} active={false} label="Save Snapshot" onClick={saveSnapshot} />
              </div>
            </>
          )}

          {!loadError && analyzing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-sm text-white">
              <Loader2 className="h-5 w-5 animate-spin" />
              Analyzing movement… {Math.round(analyzeProgress * 100)}%
            </div>
          )}
        </div>

        <div className="shrink-0 space-y-2 bg-black px-4 py-2">
          {analyzeMessage && <p className="text-xs text-amber-400">{analyzeMessage}</p>}

          {activeTool === "draw" && (
            <div className="flex items-center gap-2">
              {DRAW_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDrawColor(c)}
                  className={cn(
                    "h-6 w-6 rounded-full border-2",
                    drawColor === c ? "border-white" : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Draw color ${c}`}
                />
              ))}
              <Button size="sm" variant="ghost" onClick={undoStroke}>
                <Undo2 className="h-3.5 w-3.5" />
                Undo
              </Button>
              <Button size="sm" variant="ghost" onClick={clearStrokes}>
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
          )}

          {(selectedJointKey || manualAngleDeg != null) && (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold">
                {selectedJointKey
                  ? MEASURABLE_JOINTS.find((j) => j.key === selectedJointKey)?.label
                  : "Angle"}
              </span>
              <Button size="sm" variant="outline" onClick={() => setFlipAngle((v) => !v)}>
                <FlipHorizontal2 className="h-3.5 w-3.5" />
                Inside / Outside
              </Button>
              <Button size="sm" variant="ghost" onClick={clearAngle}>
                Clear
              </Button>
            </div>
          )}
          {activeTool === "angle" && !selectedJointKey && manualAnglePointCount > 0 && manualAnglePointCount < 3 && (
            <p className="text-xs text-muted-foreground">
              {manualAnglePointCount === 1 ? "Tap the vertex of the angle." : "Tap the last point of the angle."}
            </p>
          )}

          {activeTool === "ruler" && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {rulerPixelDist == null && <p className="text-xs text-muted-foreground">Tap two points to measure.</p>}
              {rulerPixelDist != null && !calibration && (
                <>
                  <span className="text-xs text-muted-foreground">That's how many inches in real life?</span>
                  <Input
                    type="number"
                    value={calibrateInput}
                    onChange={(e) => setCalibrateInput(e.target.value)}
                    className="h-8 w-20"
                  />
                  <Button size="sm" onClick={applyCalibration}>
                    Calibrate
                  </Button>
                </>
              )}
              {measuredInches != null && (
                <>
                  <span className="font-semibold">{measuredInches.toFixed(1)} in</span>
                  <Button size="sm" variant="ghost" onClick={() => setCalibration(null)}>
                    Recalibrate
                  </Button>
                </>
              )}
            </div>
          )}

          {showStopwatch && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Button size="sm" variant="outline" onClick={() => setMarkIn(currentTime)}>
                Mark In
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMarkOut(currentTime)}>
                Mark Out
              </Button>
              {markIn != null && <span className="text-xs text-muted-foreground">In: {markIn.toFixed(2)}s</span>}
              {markOut != null && <span className="text-xs text-muted-foreground">Out: {markOut.toFixed(2)}s</span>}
              {markIn != null && markOut != null && (
                <span className="font-semibold">{Math.abs(markOut - markIn).toFixed(2)}s elapsed</span>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMarkIn(null);
                  setMarkOut(null);
                }}
              >
                Reset
              </Button>
            </div>
          )}
        </div>

        {!loadError && (
        <div className="shrink-0 space-y-1.5 border-t border-white/10 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {/* Two rows, not one -- three icon buttons + a scrubber + a time
              label + five speed buttons all on one line doesn't fit a
              portrait phone's width (that's what was clipping "0.25x" off
              the right edge). Transport controls get their own line; speed
              selection gets its own line below, so neither one can push the
              other off-screen regardless of how narrow the viewport is. */}
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={togglePlay} className="h-8 w-8 shrink-0">
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" onClick={() => stepFrame(-1)} className="h-8 w-8 shrink-0">
              <StepBack className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => stepFrame(1)} className="h-8 w-8 shrink-0">
              <StepForward className="h-4 w-4" />
            </Button>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.01}
              value={currentTime}
              onChange={(e) => {
                const t = Number(e.target.value);
                if (videoRef.current) videoRef.current.currentTime = t;
                setCurrentTime(t);
              }}
              className="flex-1 accent-primary"
            />
            <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {fmtTime(currentTime)} / {fmtTime(duration)}
            </span>
          </div>
          <div className="flex justify-center gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => changeSpeed(s)}
                className={cn(
                  "rounded px-2 py-1 text-xs font-semibold",
                  speed === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RailButton({
  icon: Icon,
  active,
  label,
  onClick,
}: {
  icon: typeof PersonStanding;
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-white/20 bg-black/50 text-white hover:bg-black/70",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
