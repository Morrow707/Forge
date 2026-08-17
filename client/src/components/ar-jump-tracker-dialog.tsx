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
  onBodyTracking,
  framingHint,
  type BodyTrackingFrame,
} from "@/lib/native-ar-preview";
import { arJointsToWorldLandmarks } from "@/lib/ar-body-landmarks";
import { deriveJumpPoint } from "@/lib/pose-tracking";
import { summarizeJumpSet, type JumpSetMetrics } from "@/lib/jump-tracking";
import type { TrackedPoint } from "@/lib/bar-tracking";
import { videoFilenameForBlob } from "@/lib/video-recording";

/** ARKit-native jump tracking (vertical/broad/box) -- the first tracker
 * mode converted off MediaPipe (see the task this shipped under). Jump
 * mode was picked to go first specifically because it needs nothing but
 * body joints: no implement to follow (that still needs implement
 * tracking ported to Swift first -- see ArCameraPreviewPlugin.swift's own
 * TODO), so it's the one mode ready to move today. Reuses
 * jump-tracking.ts's summarizeJumpSet and pose-tracking.ts's
 * deriveJumpPoint completely unmodified -- both already just consume
 * world-space Landmark[], which ar-body-landmarks.ts bridges ARKit's real
 * joints into.
 *
 * The live skeleton (spheres at each joint, cylinders for bones) renders
 * natively, drawn directly into ArCameraPreviewPlugin's own AR scene at
 * ARKit's real world-space joint positions -- see
 * updateSkeletonVisual/orientBone there. Nothing on this side has to ask
 * for it or draw it; it's just part of what the native camera view shows
 * whenever a body is tracked.
 *
 * Also deliberately no form-fault detection (unlike the MediaPipe jump
 * mode in bar-tracker-dialog.tsx) -- detectFormFaults' valgus check
 * specifically needs 2D normalized-image-space landmarks (knee/ankle
 * width as a fraction of frame width), which this bridge doesn't produce
 * -- only real-world 3D joints. Passing world-space data into a
 * screen-space check would silently produce a wrong reading rather than
 * an honest gap, so formFaults stays empty here until that projection
 * exists. */
export function ArJumpTrackerDialog({
  open,
  onOpenChange,
  heightIn,
  recordVideo,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heightIn?: number | null;
  recordVideo?: boolean;
  onCapture: (metrics: JumpSetMetrics, videoUrl?: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tracking, setTracking] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<BodyTrackingFrame | null>(null);
  const [recordedReps, setRecordedReps] = useState(0);
  const [lastJumpCm, setLastJumpCm] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const traceRef = useRef<TrackedPoint[]>([]);
  const trackingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setTracking(false);
    setError(null);
    setFrame(null);
    setRecordedReps(0);
    setLastJumpCm(null);
    traceRef.current = [];
    trackingRef.current = false;
    isArBodyTrackingSupported().then(setSupported);
  }, [open]);

  // One AR session per dialog open -- not tied to the tracking/setup
  // distinction, so tapping Start/Stop doesn't tear down and restart the
  // camera.
  useEffect(() => {
    if (!open) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    let cancelled = false;
    startArPreview(rect).catch((err) => {
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
    const landmarks = arJointsToWorldLandmarks(frame.joints);
    const point = deriveJumpPoint(landmarks);
    if (!point) return;
    traceRef.current.push({ t: frame.timestamp, x: point.x, y: point.y, z: point.z });
    // Live feedback: recomputing off the trace so far every frame is cheap
    // for a jump set's small point count, and gives an honest running rep
    // count/height read instead of only revealing anything at Stop.
    const live = summarizeJumpSet(traceRef.current, heightIn);
    if (live) {
      setRecordedReps(live.repBreakdown.length);
      setLastJumpCm(live.repBreakdown[live.repBreakdown.length - 1].jumpHeightCm);
    }
  }, [frame, heightIn]);

  function startTracking() {
    traceRef.current = [];
    trackingRef.current = true;
    setRecordedReps(0);
    setLastJumpCm(null);
    setTracking(true);
    if (recordVideo) {
      startArRecording().catch(() => {
        // Tracking itself doesn't depend on this -- a failed recording
        // start just means no clip gets saved this set, not a lost capture.
      });
    }
  }

  async function stopTracking() {
    trackingRef.current = false;
    setTracking(false);
    const metrics = summarizeJumpSet(traceRef.current, heightIn);
    if (!metrics) {
      toast.error("Couldn't get a clean read -- make sure your feet leave the ground clearly in frame.");
      return;
    }

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
      // The set itself is still good even if the clip failed to save --
      // hand the numbers over rather than losing a real capture over an
      // upload hiccup.
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
                {recordedReps} jump{recordedReps === 1 ? "" : "s"}
                {lastJumpCm != null && ` · last ${lastJumpCm}cm`}
              </div>
            )}

            {!tracking && frame && !frame.tracked && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md bg-black/60 px-3 py-2 text-center text-sm text-white backdrop-blur-sm">
                Step back so your whole body is in frame
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
                Start Jump Set
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
