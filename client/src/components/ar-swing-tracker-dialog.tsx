import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/queryClient";
import {
  uploadOrQueueVideo,
  hasWarnedAboutQueueing,
  markWarnedAboutQueueing,
  type VideoRecordContext,
} from "@/lib/video-offline-store";
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
import {
  computeHeightScaleCorrection,
  scaleWorldLandmarks,
  worldVerticalSign,
  type PoseFrame,
} from "@/lib/pose-tracking";
import { computeSeparationDeg, summarizeRotation, type RotationSample } from "@/lib/rotation-tracking";
import { summarizeSwing } from "@/lib/swing-tracking";
import { videoFilenameForBlob } from "@/lib/video-recording";

/** ARKit-native golf/baseball swing tracking -- rotation (shoulder/hip
 * separation, the "X-Factor"), tempo (backswing:downswing ratio), and head
 * sway, all off body joints the existing ARKit bridge already tracks. One
 * shared dialog for both sports (the math is identical -- see
 * rotation-tracking.ts/swing-tracking.ts) with `sport` only steering
 * labels.
 *
 * Deliberately does NOT track the club/bat itself -- unlike
 * ArBarTrackerDialog, there's no ArImplementTracker.swift call here.
 * Retuning that native implement tracker for swing speed (far faster and
 * more arc-shaped than a lift rep) is real, harder engineering that needs
 * validation against real swings on a real device before it ships; this
 * ships the rotation/tempo/head-sway numbers that are fully trustworthy
 * off already-proven body tracking today, rather than bundling them with
 * an unvalidated implement-tracking guess. See this session's own scoping
 * of that boundary -- a real "add it" candidate once that piece exists.
 *
 * Structure mirrors ArJumpTrackerDialog closely on purpose (same AR
 * session lifecycle, same diagnostic-log plumbing, same height-scale-
 * correction handling) -- jump mode was picked to go first in this app for
 * the same reason this mode reuses its shape: body joints only, no
 * implement to follow. */

const SHOW_DIAGNOSTIC_OVERLAY = false;

export type SwingSetMetrics = {
  peakSeparationDeg: number | null;
  tempoRatio: number | null;
  backswingMs: number | null;
  downswingMs: number | null;
  headSwayCm: number | null;
  rotationTrace: RotationSample[];
};

const EMPTY_SWING_METRICS: SwingSetMetrics = {
  peakSeparationDeg: null,
  tempoRatio: null,
  backswingMs: null,
  downswingMs: null,
  headSwayCm: null,
  rotationTrace: [],
};

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function ArSwingTrackerDialog({
  open,
  onOpenChange,
  sport,
  heightIn,
  recordVideo,
  onCapture,
  videoContext,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sport: "golf" | "baseball";
  heightIn?: number | null;
  recordVideo?: boolean;
  onCapture: (metrics: SwingSetMetrics, videoUrl?: string) => void;
  /** Identifies which set this clip is for, so a deferred (queued-for-
   * Wi-Fi) upload can find its way back to it later -- see
   * video-offline-store.ts. */
  videoContext?: VideoRecordContext;
}) {
  const label = sport === "golf" ? "Golf Swing" : "Baseball Swing";
  const containerRef = useRef<HTMLDivElement>(null);
  const [tracking, setTracking] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [supportError, setSupportError] = useState<string | undefined>(undefined);
  const [cameraPermission, setCameraPermission] = useState<string | undefined>(undefined);
  const [diagLog, setDiagLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<BodyTrackingFrame | null>(null);
  const [liveSeparationDeg, setLiveSeparationDeg] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Full per-frame world landmarks for the set -- both rotation-tracking.ts
  // and swing-tracking.ts consume this same PoseFrame stream directly,
  // unlike bar/jump tracking's separate flat TrackedPoint trace.
  const framesRef = useRef<PoseFrame[]>([]);
  const trackingRef = useRef(false);
  const verticalSignRef = useRef<1 | -1>(1);
  const heightCorrectionSamplesRef = useRef<number[]>([]);
  const scaleCorrectionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setTracking(false);
    setError(null);
    setFrame(null);
    setLiveSeparationDeg(null);
    setDiagLog([]);
    framesRef.current = [];
    trackingRef.current = false;
    isArBodyTrackingSupported().then(({ supported: isSupported, error: supportErr, cameraPermission: perm }) => {
      setSupported(isSupported);
      setSupportError(supportErr);
      setCameraPermission(perm);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setDiagLog((log) => [...log, "JS: startArPreview effect firing"]);
    try {
      let cancelled = false;
      let rafId: number | null = null;
      let started = false;
      let loggedWaiting = false;
      let waitFrames = 0;
      const MAX_WAIT_FRAMES = 180;

      function onResize() {
        const r = containerRef.current?.getBoundingClientRect();
        if (r) void updateArPreviewRect(r);
      }

      function tryStart() {
        if (cancelled) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          if (!loggedWaiting) {
            loggedWaiting = true;
            setDiagLog((log) => [...log, "JS: containerRef not ready yet, waiting for it to mount..."]);
          }
          waitFrames++;
          if (waitFrames > MAX_WAIT_FRAMES) {
            setDiagLog((log) => [...log, "JS: containerRef never became ready, giving up"]);
            return;
          }
          rafId = requestAnimationFrame(tryStart);
          return;
        }
        started = true;
        setArCameraActive(true);
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
        window.addEventListener("resize", onResize);
      }

      tryStart();
      return () => {
        cancelled = true;
        if (rafId != null) cancelAnimationFrame(rafId);
        window.removeEventListener("resize", onResize);
        if (started) {
          setArCameraActive(false);
          void stopArPreview();
        }
      };
    } catch (err) {
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
    return pollDiagnosticLog((nativeLog) => {
      setDiagLog((log) => [...log.filter((l) => l.startsWith("JS:")), ...nativeLog]);
    });
  }, [open]);

  useEffect(() => {
    if (!frame || !frame.tracked || !heightIn) return;
    const worldLm = arJointsToWorldLandmarks(frame.joints);
    const sign = worldVerticalSign(worldLm) ?? verticalSignRef.current;
    const candidate = computeHeightScaleCorrection(worldLm, sign, heightIn);
    if (candidate != null) heightCorrectionSamplesRef.current.push(candidate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  useEffect(() => {
    if (!frame || !frame.tracked || !trackingRef.current) return;
    const rawLandmarks = arJointsToWorldLandmarks(frame.joints);
    const sign = worldVerticalSign(rawLandmarks);
    if (sign != null) verticalSignRef.current = sign;
    const landmarks =
      scaleCorrectionRef.current != null ? scaleWorldLandmarks(rawLandmarks, scaleCorrectionRef.current) : rawLandmarks;
    framesRef.current.push({ t: frame.timestamp, landmarks: [], worldLandmarks: landmarks });
    // Live feedback -- the current X-Factor reading updates every frame
    // while tracking, same "show something honest as it happens" instinct
    // as the jump dialog's running rep count.
    const sep = computeSeparationDeg(landmarks);
    if (sep != null) setLiveSeparationDeg(Math.round(sep));
  }, [frame]);

  function startTracking() {
    framesRef.current = [];
    if (heightCorrectionSamplesRef.current.length >= 5) {
      scaleCorrectionRef.current = medianOf(heightCorrectionSamplesRef.current);
    }
    heightCorrectionSamplesRef.current = [];
    trackingRef.current = true;
    setLiveSeparationDeg(null);
    setTracking(true);
    if (recordVideo) {
      startArRecording().catch((err) => {
        const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        setDiagLog((log) => [...log, `JS: startArRecording() failed: ${detail}`]);
      });
    }
  }

  async function stopTracking() {
    trackingRef.current = false;
    setTracking(false);

    const rotation = summarizeRotation(framesRef.current);
    const swing = summarizeSwing(framesRef.current);
    const metrics: SwingSetMetrics | null =
      rotation || swing.phases
        ? {
            peakSeparationDeg: rotation?.peakSeparationDeg ?? null,
            tempoRatio: swing.phases?.tempoRatio ?? null,
            backswingMs: swing.phases?.backswingMs ?? null,
            downswingMs: swing.phases?.downswingMs ?? null,
            headSwayCm: swing.headSwayCm,
            rotationTrace: rotation?.trace ?? [],
          }
        : null;

    if (!metrics) {
      // Same "the recording still counts even with no trustworthy numbers"
      // reasoning as every other AR dialog -- see ArJumpTrackerDialog's own
      // stopTracking comment.
      if (recordVideo) {
        setSaving(true);
        setUploadProgress(0);
        try {
          const blob = await stopArRecording();
          const filename = videoFilenameForBlob(blob, "form-check");
          const result = await uploadOrQueueVideo(
            blob,
            filename,
            videoContext ?? { label },
            setUploadProgress,
          );
          toast.error(
            result.status === "queued"
              ? "Couldn't get a clean read -- make sure your whole swing stays in frame. (No Wi-Fi -- video saved on your device, will upload once connected.)"
              : "Couldn't get a clean read -- make sure your whole swing stays in frame. (Video saved for your coach.)",
          );
          if (result.status === "queued") {
            if (!hasWarnedAboutQueueing()) {
              markWarnedAboutQueueing();
              toast.info(
                "You can also upload a queued video manually anytime -- even over cellular -- from the Video Bank.",
                { duration: 10000 },
              );
            }
            onCapture(EMPTY_SWING_METRICS);
          } else {
            onCapture(EMPTY_SWING_METRICS, result.url);
          }
          onOpenChange(false);
        } catch (err) {
          const detail = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
          toast.error(`Couldn't get a clean read, and the video didn't save either: ${detail}`);
        } finally {
          setSaving(false);
        }
      } else {
        toast.error("Couldn't get a clean read -- make sure your whole swing stays in frame.");
      }
      return;
    }

    if (!recordVideo) {
      onCapture(metrics);
      onOpenChange(false);
      return;
    }

    setSaving(true);
    setUploadProgress(0);
    try {
      const blob = await stopArRecording();
      const filename = videoFilenameForBlob(blob, "form-check");
      const result = await uploadOrQueueVideo(blob, filename, videoContext ?? { label }, setUploadProgress);
      if (result.status === "queued") {
        if (!hasWarnedAboutQueueing()) {
          markWarnedAboutQueueing();
          toast.info(
            "No Wi-Fi -- this video is saved on your device and will upload automatically once you're connected. You can also upload it manually anytime from the Video Bank, even over cellular.",
            { duration: 10000 },
          );
        }
        onCapture(metrics);
      } else {
        onCapture(metrics, result.url);
      }
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
      <DialogContent
        overlayClassName="bg-transparent backdrop-blur-none"
        className="inset-0 top-0 left-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-transparent backdrop-blur-none p-0 overflow-hidden [&>button]:hidden"
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

            {SHOW_DIAGNOSTIC_OVERLAY && (
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
            )}

            {tracking && (
              <div className="absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-sm font-bold text-white backdrop-blur-sm">
                <Circle className="h-2.5 w-2.5 animate-pulse fill-destructive text-destructive" />
                {liveSeparationDeg != null ? `${liveSeparationDeg}° turn` : "Tracking…"}
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
                Start {label}
              </Button>
            )}
            {tracking && (
              <Button size="lg" variant="secondary" onClick={stopTracking} disabled={saving}>
                <Square className="h-4 w-4" />
                {saving ? `Saving… ${Math.round(uploadProgress * 100)}%` : "Stop"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
