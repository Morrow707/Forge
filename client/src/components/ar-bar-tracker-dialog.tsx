import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Circle, Square, AlertTriangle, X } from "lucide-react";
import {
  isArBodyTrackingSupported,
  startArPreview,
  stopArPreview,
  updateArPreviewRect,
  startArRecording,
  stopArRecording,
  resetArImplementTracking,
  onBodyTracking,
  framingHint,
  type BodyTrackingFrame,
  type ImplementTrackResult,
} from "@/lib/native-ar-preview";
import { arJointsToWorldLandmarks } from "@/lib/ar-body-landmarks";
import {
  POSE_LANDMARKS,
  detectFormFaults,
  worldVerticalSign,
  tiltDegreesFromPoints,
  usesSharedBarEquipment,
  type PoseFrame,
} from "@/lib/pose-tracking";
import { summarizeTrackedSet, type RepMetrics, type TrackedPoint } from "@/lib/bar-tracking";
import { videoFilenameForBlob } from "@/lib/video-recording";

/** ARKit-native bar-path/full mode tracking -- the third and last tracker
 * mode converted off MediaPipe (see ArJumpTrackerDialog/ArSprintTrackerDialog
 * for the first two). This one was last and hardest because, unlike a jump
 * or a sprint, it needs to follow a HELD IMPLEMENT, not just a body joint --
 * see ArImplementTracker.swift for that algorithm and, specifically, for
 * why real depth (a real 3D wrist position to unproject a found pixel
 * against) replaces implement-tracking.ts's shoulder-width scale guess with
 * something categorically tighter.
 *
 * Left/right fusion here mirrors bar-tracker-dialog.tsx's own
 * leftImplementTrackerRef/rightImplementTrackerRef pattern -- weighted-
 * average each side's implement reading against that side's wrist, gated by
 * a frame-to-frame plausibility check -- with one honest simplification:
 * ARKit's body skeleton has no per-joint continuous confidence the way
 * MediaPipe's landmark.visibility does (a joint is either in this frame's
 * anchor or it isn't), so wrist confidence here is a constant 1 rather than
 * a graduated score. The implement tracker's own ramping confidence (see
 * ArImplementTracker's lockStreak) still does the real work of shifting
 * weight from "trust the wrist" to "trust the tracked implement" as a lock
 * holds, same as the MediaPipe version.
 *
 * Deliberately NOT ported in this pass, to keep this reviewable rather than
 * a blind, unverifiable-on-device reimplementation of bar-tracker-dialog.tsx's
 * full accumulated sophistication -- MediaPipe-only for now:
 * - Hands-model grip-point refinement (refineGripPoint) -- no ARKit
 *   equivalent wired up.
 * - Occlusion-gap interpolation -- less load-bearing here since ARKit body
 *   tracking is generally more robust to brief occlusion than 2D pose
 *   estimation, but a real gap in coverage nonetheless.
 * - legDriveAsymmetry / armDriveAsymmetry / trustScores on RepMetrics --
 *   all caller-populated fields bar-tracker-dialog.tsx fills in; left null
 *   here. The core numbers (peak/mean velocity, path deviation, per-rep
 *   breakdown, power, ROM, velocity loss) all come from summarizeTrackedSet
 *   unmodified and are fully populated.
 */

const MAX_PLAUSIBLE_GRIP_OFFSET_M = 0.35;
const LIVE_TILT_HISTORY_SIZE = 5;

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function isPlausibleVelocity(
  prev: { x: number; y: number; t: number } | null,
  next: { x: number; y: number; t: number },
): boolean {
  if (!prev) return true;
  const dt = (next.t - prev.t) / 1000;
  if (dt <= 0) return true;
  // A real barbell/dumbbell/kettlebell can't cover more than ~3m/s in any
  // direction -- same ceiling bar-tracker-dialog.tsx's own
  // MAX_PLAUSIBLE_VELOCITY_MPS uses, catching a single bad frame (tracker
  // briefly latching onto something else) before it corrupts the trace.
  const MAX_PLAUSIBLE_VELOCITY_MPS = 3;
  const dist = Math.hypot(next.x - prev.x, next.y - prev.y);
  return dist / dt <= MAX_PLAUSIBLE_VELOCITY_MPS;
}

export function ArBarTrackerDialog({
  open,
  onOpenChange,
  mode,
  exerciseName,
  movementType,
  equipment,
  heightIn,
  targetReps,
  loadKg,
  recordVideo,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "bar_path" | "full";
  exerciseName: string;
  movementType?: string | null;
  equipment?: string | null;
  heightIn?: number | null;
  targetReps?: number;
  loadKg?: number;
  recordVideo?: boolean;
  onCapture: (metrics: RepMetrics, videoUrl?: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tracking, setTracking] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<BodyTrackingFrame | null>(null);
  const [recordedReps, setRecordedReps] = useState(0);
  const [liveTiltDeg, setLiveTiltDeg] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const traceRef = useRef<TrackedPoint[]>([]);
  const framesRef = useRef<PoseFrame[]>([]);
  const tiltReadingsRef = useRef<number[]>([]);
  const liveTiltHistoryRef = useRef<number[]>([]);
  const verticalSignRef = useRef<1 | -1>(1);
  const prevFusedLeftRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const prevFusedRightRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const trackingRef = useRef(false);

  const usesSharedBar = usesSharedBarEquipment(equipment);

  useEffect(() => {
    if (!open) return;
    setTracking(false);
    setError(null);
    setFrame(null);
    setRecordedReps(0);
    setLiveTiltDeg(null);
    traceRef.current = [];
    framesRef.current = [];
    tiltReadingsRef.current = [];
    liveTiltHistoryRef.current = [];
    verticalSignRef.current = 1;
    prevFusedLeftRef.current = null;
    prevFusedRightRef.current = null;
    trackingRef.current = false;
    isArBodyTrackingSupported().then(setSupported);
  }, [open]);

  // One AR session per dialog open, trackImplement:true so
  // ArImplementTracker runs -- see native-ar-preview.ts's own comment on
  // startArPreview's second argument.
  useEffect(() => {
    if (!open) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    let cancelled = false;
    startArPreview(rect, true).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not start camera");
    });
    function onResize() {
      const r = containerRef.current?.getBoundingClientRect();
      if (r) void updateArPreviewRect(r);
    }
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      void stopArPreview();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return onBodyTracking(setFrame);
  }, [open]);

  useEffect(() => {
    if (!frame || !frame.tracked || !trackingRef.current) return;
    const worldLm = arJointsToWorldLandmarks(frame.joints);
    framesRef.current.push({ t: frame.timestamp, landmarks: [], worldLandmarks: worldLm });

    const sign = worldVerticalSign(worldLm);
    if (sign != null) verticalSignRef.current = sign;

    const leftWristWorld = worldLm[POSE_LANDMARKS.LEFT_WRIST];
    const rightWristWorld = worldLm[POSE_LANDMARKS.RIGHT_WRIST];
    // Captured once, outside fuseSide below -- `frame` itself narrows to the
    // tracked variant here in the outer scope, but that narrowing doesn't
    // carry into a nested function's own reference to the same closed-over
    // variable (TS re-widens it there, since fuseSide could in principle be
    // called after frame changed).
    const t = frame.timestamp;

    // Weighted fusion of each side's implement reading against that side's
    // wrist -- see this file's own header comment for why wrist confidence
    // is a constant 1 here rather than MediaPipe's graduated visibility
    // score. A side with no wrist this frame contributes nothing (stays
    // null), same as bar-tracker-dialog.tsx's own gate.
    function fuseSide(
      wristWorld: { x: number; y: number; z: number; visibility: number } | undefined,
      implement: ImplementTrackResult | null | undefined,
      prevRef: React.MutableRefObject<{ x: number; y: number; t: number } | null>,
    ): { x: number; y: number } | null {
      if (!wristWorld || wristWorld.visibility <= 0) return null;
      const wristConf = 1;
      const barConf = implement ? implement.confidence : 0;
      const total = wristConf + barConf;
      let fused: { x: number; y: number } | null =
        total > 0
          ? {
              x: (wristConf * wristWorld.x + barConf * (implement ? implement.x : 0)) / total,
              y: (wristConf * wristWorld.y + barConf * (implement ? implement.y : 0)) / total,
            }
          : null;
      // Same MAX_PLAUSIBLE_VELOCITY_MPS-style frame-to-frame check
      // bar-tracker-dialog.tsx applies to its own fused points -- catches a
      // fused jump the native-side plausibility gate (implement vs wrist,
      // within one frame) can't, since that one has no notion of the
      // PREVIOUS frame's fused position.
      if (fused && !isPlausibleVelocity(prevRef.current, { ...fused, t })) {
        fused = null;
      }
      if (fused) prevRef.current = { x: fused.x, y: fused.y, t };
      return fused;
    }

    const fusedLeft = fuseSide(leftWristWorld, frame.leftImplement, prevFusedLeftRef);
    const fusedRight = fuseSide(rightWristWorld, frame.rightImplement, prevFusedRightRef);

    if (usesSharedBar && fusedLeft && fusedRight) {
      const rawTilt = tiltDegreesFromPoints(fusedLeft, fusedRight, verticalSignRef.current);
      if (rawTilt != null) {
        liveTiltHistoryRef.current.push(rawTilt);
        if (liveTiltHistoryRef.current.length > LIVE_TILT_HISTORY_SIZE) liveTiltHistoryRef.current.shift();
        tiltReadingsRef.current.push(rawTilt);
      }
      setLiveTiltDeg(liveTiltHistoryRef.current.length > 0 ? medianOf(liveTiltHistoryRef.current) : null);
    }

    // Combined bar point: average of both fused sides when both are
    // available (a real two-handed grip), otherwise whichever single side
    // is -- same fallback bar-tracking.ts's own deriveBarPoint uses for a
    // partially-occluded bar, applied here to the fused points instead of
    // raw wrists.
    const combined =
      fusedLeft && fusedRight
        ? { x: (fusedLeft.x + fusedRight.x) / 2, y: (fusedLeft.y + fusedRight.y) / 2 }
        : (fusedLeft ?? fusedRight);
    if (combined) {
      traceRef.current.push({ t: frame.timestamp, x: combined.x, y: combined.y, z: 0 });
      const live = summarizeTrackedSet(traceRef.current, loadKg, heightIn);
      if (live) setRecordedReps(live.repBreakdown.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  function startTracking() {
    traceRef.current = [];
    framesRef.current = [];
    tiltReadingsRef.current = [];
    liveTiltHistoryRef.current = [];
    prevFusedLeftRef.current = null;
    prevFusedRightRef.current = null;
    trackingRef.current = true;
    setRecordedReps(0);
    setLiveTiltDeg(null);
    setTracking(true);
    // Clears any lock held from a previous set within this same AR
    // session -- see resetImplementTracking's own comment.
    resetArImplementTracking().catch(() => {});
    if (recordVideo) {
      startArRecording().catch(() => {});
    }
  }

  async function stopTracking() {
    trackingRef.current = false;
    setTracking(false);
    const metrics = summarizeTrackedSet(traceRef.current, loadKg, heightIn);
    if (!metrics) {
      toast.error("Couldn't get a clean read -- make sure the bar stays in frame throughout the set.");
      return;
    }
    metrics.formFaults = detectFormFaults(
      framesRef.current,
      metrics.barPathDeviationCm,
      "lift",
      movementType,
      equipment,
      tiltReadingsRef.current,
    );

    if (!recordVideo) {
      onCapture(metrics);
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      const blob = await stopArRecording();
      const formData = new FormData();
      formData.append("video", blob, videoFilenameForBlob(blob, "form-check"));
      const res = await apiRequest("POST", "/api/athlete/form-video", formData);
      const { url } = await res.json();
      onCapture(metrics, url);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Saved the set, but the clip failed to upload");
      onCapture(metrics);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-0 top-0 left-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-black p-0 overflow-hidden [&>button]:hidden">
        <div className="relative flex h-full w-full flex-col">
          <div ref={containerRef} className="relative flex-1" style={{ background: "transparent" }}>
            <button
              type="button"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>

            {tracking && (
              <div className="absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-sm font-bold text-white backdrop-blur-sm">
                <Circle className="h-2.5 w-2.5 animate-pulse fill-destructive text-destructive" />
                {recordedReps}
                {targetReps ? `/${targetReps}` : ""} reps
                {mode === "full" && usesSharedBar && liveTiltDeg != null && ` · tilt ${liveTiltDeg.toFixed(0)}°`}
              </div>
            )}

            {!tracking && frame && !frame.tracked && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md bg-black/60 px-3 py-2 text-center text-sm text-white backdrop-blur-sm">
                Step back so your whole body and the bar are in frame
              </div>
            )}
            {!tracking && frame?.tracked && framingHint(frame.distanceMeters) !== "good" && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md bg-amber-500/80 px-3 py-2 text-center text-sm font-semibold text-black">
                {framingHint(frame.distanceMeters) === "too close" ? "Step back" : "Come closer"}
              </div>
            )}

            {error && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-sm text-white">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {supported === false && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-sm text-white">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                ARKit tracking isn't supported on this device.
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 bg-black/70 px-3 py-4 backdrop-blur-sm">
            {!tracking && (
              <Button size="lg" onClick={startTracking} disabled={!supported || saving}>
                <Circle className="h-4 w-4 fill-current" />
                Start Set
              </Button>
            )}
            {tracking && (
              <Button size="lg" variant="secondary" onClick={stopTracking} disabled={saving}>
                <Square className="h-4 w-4" />
                {saving ? "Saving…" : "Stop Set"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
