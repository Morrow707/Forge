import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PoseLandmarker, type Landmark } from "@mediapipe/tasks-vision";
import { POSE_LANDMARKS } from "@/lib/pose-tracking";
import { X, Play, Pause } from "lucide-react";

export type MotionReplayFrame = { t: number; landmarks: Landmark[] };

const SKELETON_COLOR = "#2dd4bf";
const JOINT_RADIUS = 5;
// Purely visual, not a real camera projection -- rotate-around-Y plus a
// flat scale-to-fit, no perspective depth falloff. Good enough for "see the
// rep's shape from another angle," which is the actual point of this v1;
// a true perspective projection can come later if the flat version isn't
// enough on its own.
const ROTATE_SENSITIVITY = 0.01;

function project(
  point: { x: number; y: number; z: number },
  center: { x: number; y: number; z: number },
  rotationY: number,
  scale: number,
  canvasCenterX: number,
  canvasCenterY: number,
): { x: number; y: number } {
  const cx = point.x - center.x;
  const cy = point.y - center.y;
  const cz = point.z - center.z;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const rx = cx * cos + cz * sin;
  // Bridge output (see ar-body-landmarks.ts) already flips Y to
  // down-positive to match pose-tracking.ts's convention, and canvas Y is
  // also down-positive, so this needs no extra sign flip -- moving down in
  // real space already moves down on screen.
  const ry = cy;
  return { x: canvasCenterX + rx * scale, y: canvasCenterY + ry * scale };
}

// Recorded-clip viewer for a buffered stream of ARKit body-tracking frames
// (see ar-body-landmarks.ts's arJointsToWorldLandmarks) -- drag to rotate
// around the athlete, scrub/play through the rep. Deliberately a flat
// canvas + hand-rolled rotation math rather than a native SceneKit view or
// a new WebGL/Three.js dependency: this project has neither today, and a
// rotatable stick-figure skeleton doesn't need either to be useful. Reuses
// PoseLandmarker.POSE_CONNECTIONS for bone topology -- the same list
// video-analysis-dialog.tsx's 2D skeleton overlay already draws with, just
// applied to a 3D-rotated projection instead of a flat one.
export function ArMotionReplayViewer({
  open,
  onOpenChange,
  frames,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frames: MotionReplayFrame[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const rotationYRef = useRef(0);
  const draggingRef = useRef<{ lastX: number } | null>(null);
  // Forces the draw effect below to re-run on drag -- rotationYRef itself
  // is a ref (mutating it doesn't trigger a re-render), and a setState
  // updater that returns the same value React already bails out on
  // (Object.is-equal skips the render), so this needs a value that
  // genuinely changes on every drag move.
  const [rotationTick, setRotationTick] = useState(0);

  const duration = frames.length ? frames[frames.length - 1].t - frames[0].t : 0;

  // Recentered once per opened clip, not per frame -- centering on each
  // frame's own hip position independently would cancel out exactly the
  // real translation (a walking lunge, a sprint stride) that's often the
  // actual point of watching a clip back in 3D.
  const centerRef = useRef({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    if (!open || frames.length === 0) return;
    setFrameIndex(0);
    setPlaying(false);
    rotationYRef.current = 0;
    let sumX = 0,
      sumY = 0,
      sumZ = 0,
      count = 0;
    for (const f of frames) {
      // Landmark arrays are always full-length (see ar-body-landmarks.ts's
      // emptyLandmarks) with unmatched joints zeroed out at visibility 0,
      // not missing entries -- so this has to check visibility to fall
      // back to the right hip, an array-index "??" would never trigger.
      const left = f.landmarks[POSE_LANDMARKS.LEFT_HIP];
      const right = f.landmarks[POSE_LANDMARKS.RIGHT_HIP];
      const hip = left.visibility ? left : right.visibility ? right : null;
      if (hip) {
        sumX += hip.x;
        sumY += hip.y;
        sumZ += hip.z;
        count++;
      }
    }
    centerRef.current = count ? { x: sumX / count, y: sumY / count, z: sumZ / count } : { x: 0, y: 0, z: 0 };
  }, [open, frames]);

  // Advances at a flat 30fps rather than pacing against each frame's own
  // recorded timestamp -- frames were captured at roughly that rate already
  // (see ArCameraPreviewPlugin.swift's emitIntervalSeconds), so this is a
  // reasonable approximation for a v1 viewer without the extra complexity
  // of variable-timestamp playback.
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const interval = window.setInterval(() => {
      setFrameIndex((i) => {
        const next = i + 1;
        if (next >= frames.length) {
          setPlaying(false);
          return i;
        }
        return next;
      });
    }, 1000 / 30);
    return () => window.clearInterval(interval);
  }, [playing, frames.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || frames.length === 0) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    const frame = frames[Math.min(frameIndex, frames.length - 1)];
    const scale = Math.min(width, height) * 0.6;
    const center = centerRef.current;
    const rotationY = rotationYRef.current;

    const projected = frame.landmarks.map((lm) =>
      lm.visibility ? project(lm, center, rotationY, scale, width / 2, height / 2) : null,
    );

    ctx.strokeStyle = SKELETON_COLOR;
    ctx.lineWidth = 3;
    for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
      const a = projected[start];
      const b = projected[end];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.fillStyle = SKELETON_COLOR;
    for (const p of projected) {
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, JOINT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [frames, frameIndex, rotationTick]);

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = { lastX: e.clientX };
  }
  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = draggingRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.lastX;
    drag.lastX = e.clientX;
    rotationYRef.current += dx * ROTATE_SENSITIVITY;
    setRotationTick((t) => t + 1);
  }
  function handlePointerUp() {
    draggingRef.current = null;
  }

  const currentT = frames.length ? frames[Math.min(frameIndex, frames.length - 1)].t - frames[0].t : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="inset-0 top-0 left-0 flex h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-black p-0 [&>button]:hidden"
        hideClose
      >
        <div className="flex shrink-0 items-center justify-between px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <DialogTitle className="text-sm text-white">3D Replay · drag to rotate</DialogTitle>
          <DialogClose className="rounded-sm text-white/70 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-ring">
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>

        <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden bg-black">
          {frames.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-white/70">
              No recorded frames -- record a clip first.
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          )}
        </div>

        {frames.length > 0 && (
          <div className="shrink-0 space-y-1.5 border-t border-white/10 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setPlaying((p) => !p)}
                className="h-8 w-8 shrink-0 text-white hover:bg-white/10 hover:text-white"
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <input
                type="range"
                min={0}
                max={frames.length - 1}
                step={1}
                value={frameIndex}
                onChange={(e) => {
                  setPlaying(false);
                  setFrameIndex(Number(e.target.value));
                }}
                className="flex-1 accent-primary"
              />
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-white/70">
                {currentT.toFixed(1)}s / {duration.toFixed(1)}s
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
