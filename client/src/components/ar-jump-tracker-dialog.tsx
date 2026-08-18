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
  onSessionError,
  pollDiagnosticLog,
  setArCameraActive,
  framingHint,
  type BodyTrackingFrame,
} from "@/lib/native-ar-preview";
import { arJointsToWorldLandmarks } from "@/lib/ar-body-landmarks";
import { deriveJumpPoint, detectFormFaults, computeLandingAsymmetry, type PoseFrame } from "@/lib/pose-tracking";
import { summarizeJumpSet, type JumpSetMetrics } from "@/lib/jump-tracking";
import type { TrackedPoint } from "@/lib/bar-tracking";
import { videoFilenameForBlob } from "@/lib/video-recording";

/** ARKit-native jump tracking (vertical/broad/box) -- the first tracker
 * mode converted off MediaPipe (jump, then sprint, then bar_path/full --
 * see ArSprintTrackerDialog/ArBarTrackerDialog for the other two). Jump
 * mode was picked to go first specifically because it needs nothing but
 * body joints: no implement to follow. Reuses jump-tracking.ts's
 * summarizeJumpSet and pose-tracking.ts's deriveJumpPoint completely
 * unmodified -- both already just consume world-space Landmark[], which
 * ar-body-landmarks.ts bridges ARKit's real joints into.
 *
 * The live skeleton (spheres at each joint, cylinders for bones) renders
 * natively, drawn directly into ArCameraPreviewPlugin's own AR scene at
 * ARKit's real world-space joint positions -- see
 * updateSkeletonVisual/orientBone there. Nothing on this side has to ask
 * for it or draw it; it's just part of what the native camera view shows
 * whenever a body is tracked.
 *
 * Form-fault detection (landing valgus, forward lean) runs the same
 * detectFormFaults used by the MediaPipe jump mode in bar-tracker-dialog.tsx
 * -- its valgus check now compares real-world 3D knee/ankle distances
 * instead of 2D image-space x, so it works directly off this bridge's
 * world-only joints (and, as a side effect, no longer assumes a face-on
 * camera angle the way the old image-space version did). See
 * detectFormFaults' own comment in pose-tracking.ts.
 *
 * Landing-foot timing (computeLandingAsymmetry) also runs here and only
 * here -- it needs real per-frame 3D ankle positions to trust a timing
 * offset between feet as a real lead rather than sampling noise, which
 * only ARKit's bridge provides. Computed and attached to
 * metrics.landingAsymmetry; not yet surfaced anywhere downstream (no
 * schema column, no UI badge) -- that's the next step once there's real
 * data to design the display around. */

// Attached to a saved video when summarizeJumpSet couldn't produce a
// trustworthy read -- see EMPTY_REP_METRICS's own comment in
// ar-bar-tracker-dialog.tsx for why this is all zero/empty rather than
// fabricated numbers.
const EMPTY_JUMP_METRICS: JumpSetMetrics = {
  bestJumpHeightCm: 0,
  bestHorizontalDistanceCm: null,
  avgGroundContactSeconds: null,
  reactiveStrengthIndex: null,
  repBreakdown: [],
  pathTrace: [],
  formFaults: [],
};

export function ArJumpTrackerDialog({
  open,
  onOpenChange,
  heightIn,
  movementType,
  equipment,
  recordVideo,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heightIn?: number | null;
  movementType?: string | null;
  equipment?: string | null;
  recordVideo?: boolean;
  onCapture: (metrics: JumpSetMetrics, videoUrl?: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tracking, setTracking] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [supportError, setSupportError] = useState<string | undefined>(undefined);
  const [cameraPermission, setCameraPermission] = useState<string | undefined>(undefined);
  const [diagLog, setDiagLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<BodyTrackingFrame | null>(null);
  const [recordedReps, setRecordedReps] = useState(0);
  const [lastJumpCm, setLastJumpCm] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const traceRef = useRef<TrackedPoint[]>([]);
  // Full per-frame world landmarks for the set, in the same PoseFrame shape
  // detectFormFaults already consumes -- landmarks (2D image-space) stays
  // empty since detectFormFaults' checks are all world-space now and this
  // bridge never produces 2D data; see the file comment above.
  const framesRef = useRef<PoseFrame[]>([]);
  const trackingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setTracking(false);
    setError(null);
    setFrame(null);
    setRecordedReps(0);
    setLastJumpCm(null);
    setDiagLog([]);
    traceRef.current = [];
    framesRef.current = [];
    trackingRef.current = false;
    isArBodyTrackingSupported().then(({ supported: isSupported, error: supportErr, cameraPermission: perm }) => {
      setSupported(isSupported);
      setSupportError(supportErr);
      setCameraPermission(perm);
    });
  }, [open]);

  // One AR session per dialog open -- not tied to the tracking/setup
  // distinction, so tapping Start/Stop doesn't tear down and restart the
  // camera.
  useEffect(() => {
    if (!open) return;
    // Unconditional the instant this effect fires at all -- if this line
    // never shows up either, the effect itself isn't running (a mount/
    // dependency problem), not anything inside its body.
    setDiagLog((log) => [...log, "JS: startArPreview effect firing"]);
    try {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        setDiagLog((log) => [...log, "JS: no containerRef rect, aborting"]);
        return;
      }
      let cancelled = false;
      setArCameraActive(true);
      // Logged entirely on the JS side, independent of the native
      // logDiag/getDiagnosticLog buffer -- see the same block's own comment
      // in ar-bar-tracker-dialog.tsx.
      setDiagLog((log) => [...log, "JS: calling startArPreview()"]);
      startArPreview(rect)
        .then(() => {
          if (!cancelled) setDiagLog((log) => [...log, "JS: startArPreview() resolved"]);
        })
        .catch((err) => {
          if (!cancelled) {
            const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
            setDiagLog((log) => [...log, `JS: startArPreview() rejected: ${detail}`]);
            setError(err instanceof Error ? err.message : "Could not start camera");
          }
        });
      function onResize() {
        const r = containerRef.current?.getBoundingClientRect();
        if (r) void updateArPreviewRect(r);
      }
      window.addEventListener("resize", onResize);
      return () => {
        cancelled = true;
        setArCameraActive(false);
        window.removeEventListener("resize", onResize);
        void stopArPreview();
      };
    } catch (err) {
      // A synchronous throw anywhere above this point would otherwise
      // silently abort just this effect with nothing to show for it --
      // this is what would explain a real device showing zero lines from
      // this effect at all despite the sibling isSupported effect (a
      // separate useEffect) working fine.
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setDiagLog((log) => [...log, `JS: SYNC THROW in startArPreview effect: ${detail}`]);
    }
  }, [open]);


  useEffect(() => {
    if (!open) return;
    return onBodyTracking(setFrame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return onSessionError(setError);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return pollDiagnosticLog(setDiagLog);
  }, [open]);

  useEffect(() => {
    if (!frame || !frame.tracked || !trackingRef.current) return;
    const landmarks = arJointsToWorldLandmarks(frame.joints);
    framesRef.current.push({ t: frame.timestamp, landmarks: [], worldLandmarks: landmarks });
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
    framesRef.current = [];
    trackingRef.current = true;
    setRecordedReps(0);
    setLastJumpCm(null);
    setTracking(true);
    if (recordVideo) {
      // Tracking itself doesn't depend on this -- a failed recording start
      // just means no clip gets saved this set, not a lost capture -- but
      // silently swallowing it made a recording that never started look
      // identical to any other failure once stopArRecording() downstream
      // rejects with nothing to stop. Logged into the same diagnostic strip.
      startArRecording().catch((err) => {
        const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        setDiagLog((log) => [...log, `JS: startArRecording() failed: ${detail}`]);
      });
    }
  }

  async function stopTracking() {
    trackingRef.current = false;
    setTracking(false);
    const metrics = summarizeJumpSet(traceRef.current, heightIn);
    if (!metrics) {
      // The rep-tracking read failing doesn't mean the recording itself
      // failed -- see ar-bar-tracker-dialog.tsx's stopTracking for the full
      // reasoning: a real clip still gets saved and attached even with no
      // trustworthy numbers, rather than thrown away just because the
      // automatic read couldn't be trusted. Dialog only closes when a video
      // actually got captured this way; with nothing saved at all, it stays
      // open exactly like before so the athlete can just retry the set.
      if (recordVideo) {
        setSaving(true);
        try {
          const blob = await stopArRecording();
          const formData = new FormData();
          formData.append("video", blob, videoFilenameForBlob(blob, "form-check"));
          const res = await apiRequest("POST", "/api/athlete/form-video", formData);
          const { url } = await res.json();
          toast.error(
            "Couldn't get a clean read -- make sure your feet leave the ground clearly in frame. (Video saved for your coach.)",
          );
          onCapture(EMPTY_JUMP_METRICS, url);
          onOpenChange(false);
        } catch (err) {
          const detail = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
          toast.error(`Couldn't get a clean read, and the video didn't save either: ${detail}`);
        } finally {
          setSaving(false);
        }
      } else {
        toast.error("Couldn't get a clean read -- make sure your feet leave the ground clearly in frame.");
      }
      return;
    }
    // See the "jump" context branch in detectFormFaults -- landing valgus
    // and forward lean still apply, shallow-depth/bar-path checks don't.
    metrics.formFaults = detectFormFaults(framesRef.current, 0, "jump", movementType, equipment);
    // Per-rep landing-foot timing -- see computeLandingAsymmetry's own
    // comment for why this is only trustworthy with real per-frame 3D
    // ankle positions (ARKit's, not MediaPipe's 2D-derived ones), so this
    // is the first jump-tracking caller that ever populates it.
    metrics.landingAsymmetry = computeLandingAsymmetry(
      framesRef.current,
      metrics.repBreakdown.map((rep) => ({ landingT: rep.landingT })),
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
      <DialogContent
        overlayClassName="bg-transparent backdrop-blur-none"
        className="inset-0 top-0 left-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-transparent p-0 overflow-hidden [&>button]:hidden"
      >
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

            {/* Permanent, always-on diagnostic readout -- not gated behind
                any error state, per the standing "make the phone the
                diagnostic tool" rule. Real values straight off the device
                (supported/permission from isSupported(), tracked from the
                live bodyTracking stream), not inferred from what happens to
                render. */}
            <div className="absolute left-3 right-16 top-[max(0.75rem,env(safe-area-inset-top))] z-10 select-text space-y-0.5 rounded-md bg-black/60 px-2 py-1.5 font-mono text-[9px] leading-tight text-white/80 backdrop-blur-sm">
              <div>
                supported={String(supported)} perm={cameraPermission ?? "?"} tracked=
                {String(frame?.tracked ?? false)}
              </div>
              {diagLog.map((line, i) => (
                <div key={i} className="text-white/60">
                  {line}
                </div>
              ))}
            </div>

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
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-sm text-white">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  ARKit tracking isn't supported on this device.
                </div>
                {supportError && (
                  <p className="select-text break-all text-center text-xs opacity-90">{supportError}</p>
                )}
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
