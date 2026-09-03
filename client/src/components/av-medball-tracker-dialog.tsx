import { useEffect, useState } from "react";
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
import { Circle, Square, X, XCircle, AlertTriangle } from "lucide-react";
import { useAvBodyTracking } from "@/lib/use-av-body-tracking";
import { AvCameraChrome } from "@/components/av-camera-chrome";
import { visionJointsToWorldLandmarks, visionImplementToPoint, type ImplementPoint } from "@/lib/vision-body-landmarks";
import type { PoseFrame as NativePoseFrame, CaptureDeviceInfo } from "@/lib/native-av-preview";
import {
  calibrateFromFrames,
  calibrationMethodBreakdown,
  scaleWorldLandmarks,
  percentile,
  wristConfidence,
  blendSpeedEstimates,
  detectThrowReps,
  type SetTrustScore,
  type BlendedSpeedResult,
} from "@/lib/pose-tracking";
import { analyzeMechanics, type MechanicsFrame } from "@/lib/mechanics-tracking";
import { MIN_TRACKING_CONFIDENCE } from "@/lib/bar-tracking";
import { videoFilenameForBlob } from "@/lib/video-recording";
import { buildTrackingDiagnostics, type TrackingDiagnostics } from "@/lib/tracking-diagnostics";

/** AVFoundation + Vision med ball throw tracking -- genuinely new, no ARKit equivalent was ever
 * built for this mode (unlike every other tracker this AV pipeline replaced). It exists at all
 * because AvImplementTracker.swift's motion-diff object tracking (built for bar_path/full --
 * see av-bar-tracker-dialog.tsx) generalizes to any held object, not just a barbell: "a caller
 * tracking a single implement (a thrown medicine ball, not a two-handed bar) uses the left
 * instance alone" is that class's own file comment, describing exactly this mode.
 *
 * Two independent signals, confidence-weighted BLENDED rather than a plain either/or fallback
 * (see pose-tracking.ts's blendSpeedEstimates for why, and how):
 * 1. The ball's own tracked speed -- AvImplementTracker follows the ball itself (not just the
 *    wrist), so consecutive confident frames give a real frame-to-frame speed, same 95th-
 *    percentile-over-a-physical-ceiling robustness pattern already established in
 *    bar-tracking.ts's robustPeakSpeed and mechanics-tracking.ts's own peakWristSpeedMps.
 * 2. mechanics-tracking.ts's existing "throw" mode (reused completely unmodified) -- a
 *    body-joint-only analysis (peak wrist speed as a release-velocity proxy, release height,
 *    arm slot) built for Skills' baseball/softball throwing mechanics, but the underlying
 *    physics (a throwing motion's kinetic chain) doesn't care whether the context is a skill
 *    drill or a strength set.
 * When both signals exist, blendSpeedEstimates weighs them by their own confidence into one
 * number and reports how well they agreed as medBallTrustScore -- two independent reads agreeing
 * is stronger evidence than either one's own raw confidence, since a tracker can report high
 * confidence while still locked onto the wrong feature. When only one signal exists (the ball
 * wasn't confidently tracked for enough of the capture, or no wrist data), that one is used alone
 * at reduced confidence rather than reporting nothing.
 *
 * Only two headline numbers are saved (medBallPeakSpeedMps, medBallReleaseHeightCm), best-of-set
 * rather than a per-rep breakdown -- same "no rep segmentation exists yet" simplicity
 * jumpHeightCm/jumpDistanceCm already accept for jump mode. Fault detection
 * (detectMechanicsFaults) isn't wired in yet -- it needs a camera-angle selection step
 * (face_on/down_the_line) this mode doesn't have, the same missing piece Sprint's own
 * cameraAngle warning step exists to fill for its mode.
 *
 * Calibration is required (see AvJumpTrackerDialog's own comment on why Vision's
 * worldLandmarks-slot pixel values need it, unlike ARKit/MediaPipe) -- no number is better than
 * a wrong one. Camera/recording/analysis plumbing comes from useAvBodyTracking, shared with
 * every other AV tracker dialog. */

// One entry per detected throw within the recording (see detectThrowReps in pose-tracking.ts) --
// "if i do 10 reps, it only shows one average m/s not 10 averages, which is wrong." Each entry's
// own trust reflects how well that ONE throw's ball-tracked and wrist-proxy signals agreed, same
// blendSpeedEstimates reasoning as the set-level trust below, just per rep instead of once.
export type MedballRepBreakdownEntry = { repNumber: number; peakSpeedMps: number; trust: SetTrustScore };

export type MedballSetMetrics = {
  // Hardest throw of the set -- max(repBreakdown[].peakSpeedMps), kept for whatever still reads
  // this as the one headline number (PRs, the exercise history chart).
  peakSpeedMps: number | null;
  releaseHeightCm: number | null;
  trust: SetTrustScore | null;
  repBreakdown: MedballRepBreakdownEntry[];
  captureDeviceInfo: CaptureDeviceInfo | null;
  trackingDiagnostics?: TrackingDiagnostics | null;
};

const EMPTY_MEDBALL_METRICS: MedballSetMetrics = {
  peakSpeedMps: null,
  releaseHeightCm: null,
  trust: null,
  repBreakdown: [],
  captureDeviceInfo: null,
};

// Elite med ball release velocities run well below a thrown baseball's (med balls are heavy --
// typically 2-10kg -- unlike a 0.14kg baseball), so this ceiling sits generously above even a
// hard rotational throw or overhead slam: same "well above even an elite real effort" margin
// mechanics-tracking.ts's own MAX_PLAUSIBLE_WRIST_SPEED_MPS uses, just for the ball's own
// tracked speed (which can genuinely run a bit above wrist speed, unlike that constant) rather
// than the wrist. Untuned against real footage (this sandbox has no camera to test against).
const MAX_PLAUSIBLE_BALL_SPEED_MPS = 25;
// Below this many confident implement samples, there isn't enough of a tracked trace to trust a
// frame-to-frame speed reading from it at all -- falls back to the wrist-speed proxy instead of
// reporting a number computed from two or three lucky frames.
const MIN_BALL_SPEED_SAMPLES = 4;

export function AvMedballTrackerDialog({
  open,
  onOpenChange,
  heightIn,
  recordVideo,
  onCapture,
  videoContext,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heightIn?: number | null;
  recordVideo?: boolean;
  onCapture: (metrics: MedballSetMetrics, videoUrl?: string) => void;
  videoContext?: VideoRecordContext;
}) {
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const {
    containerRef,
    supported,
    supportError,
    cameraPermission,
    error,
    setError,
    diagLog,
    recording,
    analyzing,
    analyzedFrames,
    startRecording,
    stopRecordingAndAnalyze,
    cancelAnalysis,
  } = useAvBodyTracking(open);

  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setUploadProgress(0);
  }, [open]);

  async function saveEmptyAndWarn(
    blob: Blob,
    message: string,
    captureDeviceInfo: CaptureDeviceInfo,
    trackingDiagnostics: TrackingDiagnostics,
    uploadPromise: Promise<{ status: "uploaded"; url: string } | { status: "queued" }> | null,
  ) {
    const emptyMetrics: MedballSetMetrics = { ...EMPTY_MEDBALL_METRICS, captureDeviceInfo, trackingDiagnostics };
    if (recordVideo && uploadPromise) {
      try {
        const result = await uploadPromise;
        toast.error(
          result.status === "queued"
            ? `${message} (No Wi-Fi -- video saved on your device, will upload for your coach once connected.)`
            : `${message} (Video saved for your coach.)`,
        );
        if (result.status === "queued") {
          if (!hasWarnedAboutQueueing()) {
            markWarnedAboutQueueing();
            toast.info(
              "You can also upload a queued video manually anytime -- even over cellular -- from the Video Bank.",
              { duration: 10000 },
            );
          }
          onCapture(emptyMetrics);
        } else {
          onCapture(emptyMetrics, result.url);
        }
        onOpenChange(false);
      } catch (err) {
        const detail = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
        toast.error(`${message} And the video didn't save either: ${detail}`);
      } finally {
        setSaving(false);
      }
    } else {
      toast.error(message);
    }
  }

  async function stopTracking() {
    // Starts the upload the instant the recording exists rather than after analysis also
    // finishes, so the two run concurrently -- see use-av-body-tracking.ts's own onBlobReady
    // comment. saveEmptyAndWarn and finishWithRecording's own success path both just await
    // this same in-flight upload instead of starting a fresh one once they're ready for it.
    let uploadPromise: Promise<{ status: "uploaded"; url: string } | { status: "queued" }> | null = null;
    const result = await stopRecordingAndAnalyze({
      trackingMode: "med_ball",
      onBlobReady: recordVideo
        ? (blob) => {
            setSaving(true);
            setUploadProgress(0);
            const filename = videoFilenameForBlob(blob, "form-check");
            uploadPromise = uploadOrQueueVideo(blob, filename, videoContext ?? { label: "Med Ball" }, setUploadProgress);
          }
        : undefined,
    });
    if (!result) {
      // Analysis failed or was cancelled, but the upload above doesn't know or care -- it never
      // depended on analysis succeeding. Left alone it would still finish in the background with
      // no set to attach it to, so wait for it and hand it over anyway, same "the clip is worth
      // keeping even without numbers" reasoning as saveEmptyAndWarn below.
      const inFlightUpload = uploadPromise as Promise<
        { status: "uploaded"; url: string } | { status: "queued" }
      > | null;
      if (inFlightUpload) {
        try {
          const uploadResult = await inFlightUpload;
          toast.error("Couldn't finish analyzing this take, but your video was saved for your coach.");
          onCapture(EMPTY_MEDBALL_METRICS, uploadResult.status === "uploaded" ? uploadResult.url : undefined);
          onOpenChange(false);
        } catch {
          // Genuinely nothing left to salvage.
        } finally {
          setSaving(false);
        }
      }
      return;
    }
    await finishWithRecording(result.blob, result.rawFrames, result.captureDeviceInfo, result.recordingStats, uploadPromise);
  }

  // Frame-to-frame speed across an implement's own confident trace -- same robust-percentile
  // shape as mechanics-tracking.ts's own wristSpeeds computation, just against a tracked ball
  // position instead of a wrist landmark. Also returns the average confidence of the points that
  // actually fed the speed reading, for blendSpeedEstimates to weigh this signal against the
  // wrist-proxy signal by -- not a new measurement, just carrying through what
  // AvImplementTracker already reported per point instead of discarding it once used for the
  // filter above.
  function peakImplementSpeed(
    points: { t: number; x: number; y: number; confidence: number }[],
  ): { speedMps: number; confidence: number } | null {
    const confident = points.filter((p) => p.confidence >= MIN_TRACKING_CONFIDENCE);
    if (confident.length < MIN_BALL_SPEED_SAMPLES) return null;
    const speeds: number[] = [];
    for (let i = 1; i < confident.length; i++) {
      const a = confident[i - 1];
      const b = confident[i];
      const dtSeconds = (b.t - a.t) / 1000;
      if (dtSeconds <= 0) continue;
      speeds.push(Math.hypot(b.x - a.x, b.y - a.y) / dtSeconds);
    }
    if (speeds.length < MIN_BALL_SPEED_SAMPLES) return null;
    const plausible = speeds.filter((v) => v <= MAX_PLAUSIBLE_BALL_SPEED_MPS);
    const pool = plausible.length > 0 ? plausible : speeds;
    const speedMps = Math.round(percentile(pool, 0.95) * 100) / 100;
    const confidence = confident.reduce((a, p) => a + p.confidence, 0) / confident.length;
    return { speedMps, confidence };
  }

  // Frame-to-frame ball speed across the WHOLE clip, unaggregated -- feeds detectThrowReps
  // (which needs to see where speed rises and falls to find rep boundaries in the first place),
  // distinct from peakImplementSpeed above (which collapses an already-known window into one
  // number). Same confidence gate as peakImplementSpeed, for the same reason: an unconfident
  // point's implied "speed" against its neighbor is often just tracking noise, and letting that
  // noise into the boundary-detection trace risks carving out a phantom rep around it.
  function implementSpeedTrace(
    points: { t: number; x: number; y: number; confidence: number }[],
  ): { t: number; speed: number }[] {
    const confident = points.filter((p) => p.confidence >= MIN_TRACKING_CONFIDENCE);
    const samples: { t: number; speed: number }[] = [];
    for (let i = 1; i < confident.length; i++) {
      const a = confident[i - 1];
      const b = confident[i];
      const dtSeconds = (b.t - a.t) / 1000;
      if (dtSeconds <= 0) continue;
      samples.push({ t: b.t, speed: Math.hypot(b.x - a.x, b.y - a.y) / dtSeconds });
    }
    return samples;
  }

  async function finishWithRecording(
    blob: Blob,
    rawFrames: NativePoseFrame[],
    captureDeviceInfo: CaptureDeviceInfo,
    recordingStats: { frameCount: number; trackedFrameCount: number; elapsedSeconds: number },
    uploadPromise: Promise<{ status: "uploaded"; url: string } | { status: "queued" }> | null,
  ) {
    const calibrationInput = rawFrames.map((f) => ({ worldLandmarks: visionJointsToWorldLandmarks(f) }));
    const scaleFactor = calibrateFromFrames(calibrationInput, heightIn);
    const calibrationFrames = calibrationMethodBreakdown(calibrationInput);
    if (scaleFactor == null) {
      const message =
        "Couldn't calibrate real-world scale for this take -- make sure your height is set in your profile and you're clearly visible standing at some point in frame.";
      await saveEmptyAndWarn(
        blob,
        message,
        captureDeviceInfo,
        buildTrackingDiagnostics({
          outcome: "empty_calibration_failed",
          message,
          rawFrames,
          trackingMode: "med_ball",
          recording: recordingStats,
          calibration: { scaleFactor: null, ...calibrationFrames },
        }),
        uploadPromise,
      );
      return;
    }

    const frames: MechanicsFrame[] = [];
    const leftBallPoints: { t: number; x: number; y: number; confidence: number }[] = [];
    const rightBallPoints: { t: number; x: number; y: number; confidence: number }[] = [];
    for (const f of rawFrames) {
      const t = f.timestamp * 1000;
      const worldLm = scaleWorldLandmarks(visionJointsToWorldLandmarks(f), scaleFactor);
      frames.push({ t, worldLandmarks: worldLm });

      const scalePoint = (raw: ImplementPoint | null) =>
        raw ? { t, x: raw.x * scaleFactor, y: raw.y * scaleFactor, confidence: raw.confidence } : null;
      const left = scalePoint(visionImplementToPoint(f.leftImplement, f));
      const right = scalePoint(visionImplementToPoint(f.rightImplement, f));
      if (left) leftBallPoints.push(left);
      if (right) rightBallPoints.push(right);
    }

    // Whichever hand the tracker actually followed the ball with, for however this athlete
    // held/released it (one hand, or two until release) -- same "pick whichever side moved
    // more" reasoning mechanics-tracking.ts's own throwingSide detection already uses for the
    // wrist, applied here to the ball trace instead, and reused below as the wrist-confidence
    // side too (the ball and the throwing wrist are the same hand until release).
    const leftConfidentCount = leftBallPoints.filter((p) => p.confidence >= MIN_TRACKING_CONFIDENCE).length;
    const rightConfidentCount = rightBallPoints.filter((p) => p.confidence >= MIN_TRACKING_CONFIDENCE).length;
    const throwingSide: "left" | "right" = rightConfidentCount > leftConfidentCount ? "right" : "left";
    const ballPoints = throwingSide === "right" ? rightBallPoints : leftBallPoints;

    const mechanicsResult = analyzeMechanics(frames, "throw");
    const releaseHeightCm = mechanicsResult.releaseHeightM != null ? Math.round(mechanicsResult.releaseHeightM * 100) : null;

    // Blends the two independent speed signals (ball trace, wrist proxy) over a single time
    // window -- the whole clip when called for the backward-compatible set-level number, one
    // detected throw's own [startT, endT] when called per rep below. Exactly the same signal
    // sources and blendSpeedEstimates call the pre-per-rep version of this dialog always made,
    // just parameterized by window instead of hardcoded to the full clip.
    function blendedSpeedForWindow(startT: number, endT: number): BlendedSpeedResult | null {
      const windowBallPoints = ballPoints.filter((p) => p.t >= startT && p.t <= endT);
      const windowFrames = frames.filter((f) => f.t >= startT && f.t <= endT);
      const windowMechanics = startT === -Infinity && endT === Infinity ? mechanicsResult : analyzeMechanics(windowFrames, "throw");
      const ballSignal = peakImplementSpeed(windowBallPoints);
      const wristConfidenceSamples = windowFrames
        .map((f) => wristConfidence(f.worldLandmarks, throwingSide))
        .filter((c) => c > 0);
      const avgWristConfidence =
        wristConfidenceSamples.length > 0
          ? wristConfidenceSamples.reduce((a, c) => a + c, 0) / wristConfidenceSamples.length
          : 0;
      const wristSignal =
        windowMechanics.peakWristSpeedMps != null
          ? { speedMps: windowMechanics.peakWristSpeedMps, confidence: avgWristConfidence }
          : null;
      return blendSpeedEstimates(
        ballSignal,
        wristSignal,
        "Ball wasn't confidently tracked for enough of this throw -- speed estimated from wrist motion alone",
        "No wrist motion signal to cross-check against -- speed from ball tracking alone",
      );
    }

    // Each individual throw within this recording, not one blended number for the whole clip --
    // "if i do 10 reps, it only shows one average m/s not 10 averages, which is wrong." Segments
    // on the ball's own speed trace (detectThrowReps), then re-runs the exact same per-signal
    // blend the old single-number version used, once per detected window instead of once for
    // the whole clip. Falls back to treating the whole clip as one rep when detection finds no
    // clean above-floor stretch (a very short take where the throw never fully returns to
    // resting speed before the clip ends) -- same "no number is better than a wrong one" stance,
    // just choosing the widest reasonable window instead of reporting nothing.
    const repWindows = detectThrowReps(implementSpeedTrace(ballPoints));
    const windowsToProcess: { repNumber: number; startT: number; endT: number }[] =
      repWindows.length > 0 ? repWindows : [{ repNumber: 1, startT: -Infinity, endT: Infinity }];
    const repBreakdown: { repNumber: number; peakSpeedMps: number; trust: SetTrustScore }[] = [];
    for (const w of windowsToProcess) {
      const blended = blendedSpeedForWindow(w.startT, w.endT);
      if (blended) {
        repBreakdown.push({ repNumber: w.repNumber, peakSpeedMps: blended.speedMps, trust: blended.trust });
      }
    }
    // Backward-compatible headline number -- the hardest throw of the set, same "best-of-set"
    // semantic medBallPeakSpeedMps already had before per-rep detection existed, now computed
    // from the max across real detected reps instead of one clip-wide blend.
    const bestRep = repBreakdown.reduce<(typeof repBreakdown)[number] | null>(
      (best, r) => (best == null || r.peakSpeedMps > best.peakSpeedMps ? r : best),
      null,
    );
    const peakSpeedMps = bestRep?.peakSpeedMps ?? null;
    const trust = bestRep?.trust ?? null;

    if (peakSpeedMps == null) {
      const message = "Couldn't get a clean read -- make sure your whole throwing motion, ball included, stays in frame.";
      await saveEmptyAndWarn(
        blob,
        message,
        captureDeviceInfo,
        buildTrackingDiagnostics({
          outcome: "empty_no_clean_read",
          message,
          rawFrames,
          trackingMode: "med_ball",
          recording: recordingStats,
          calibration: { scaleFactor, ...calibrationFrames },
        }),
        uploadPromise,
      );
      return;
    }

    const metrics: MedballSetMetrics = {
      peakSpeedMps,
      releaseHeightCm,
      trust,
      repBreakdown,
      captureDeviceInfo,
      trackingDiagnostics: buildTrackingDiagnostics({
        outcome: "tracked",
        rawFrames,
        trackingMode: "med_ball",
        recording: recordingStats,
        calibration: { scaleFactor, ...calibrationFrames },
      }),
    };

    // Immediate feedback on what was actually seen -- "it should give the athletes some
    // information, how many reps the just did, average m/s of what they just did, for every
    // single rep." The set card (workout.tsx) shows the same numbers once this dialog closes,
    // but that's easy to miss scrolling past; this puts it in front of the athlete right away.
    toast.success(
      repBreakdown.length === 1
        ? `Throw: ${repBreakdown[0].peakSpeedMps} m/s`
        : `${repBreakdown.length} throws detected: ${repBreakdown.map((r) => r.peakSpeedMps).join(", ")} m/s`,
    );

    if (!recordVideo) {
      onCapture(metrics);
      onOpenChange(false);
      return;
    }

    // uploadPromise is always set here -- onBlobReady (stopTracking above) unconditionally
    // starts it whenever recordVideo is true, and the early return above already covers
    // !recordVideo. Falls back to a fresh upload rather than silently dropping the video if
    // that invariant is ever wrong.
    const inFlightUpload =
      uploadPromise ??
      uploadOrQueueVideo(blob, videoFilenameForBlob(blob, "form-check"), videoContext ?? { label: "Med Ball" }, setUploadProgress);
    try {
      const result = await inFlightUpload;
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
        <div className="relative h-full w-full">
          <div ref={containerRef} className="absolute inset-0" style={{ background: "transparent" }}>
            <AvCameraChrome containerRef={containerRef} active={open} />
            <button
              type="button"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>

            {recording && (
              <div className="absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-sm font-bold text-white backdrop-blur-sm">
                <Circle className="h-2.5 w-2.5 animate-pulse fill-destructive text-destructive" />
                Recording
              </div>
            )}

            {(analyzing || saving) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                <p className="text-sm text-white">
                  {analyzing
                    ? `Analyzing recording -- ${analyzedFrames} frames processed…`
                    : `Saving your video… ${Math.round(uploadProgress * 100)}%`}
                </p>
                {analyzing && (
                  <Button variant="outline" size="sm" onClick={cancelAnalysis}>
                    <XCircle className="h-4 w-4" />
                    Cancel
                  </Button>
                )}
              </div>
            )}

            {!recording && !analyzing && !saving && !heightIn && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md bg-amber-500/80 px-3 py-2 text-center text-sm font-semibold text-black">
                Add your height in your profile to get calibrated numbers from this camera.
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
                  Camera tracking isn't supported on this device.
                </div>
                {supportError && (
                  <p className="select-text break-all text-center text-xs opacity-90">{supportError}</p>
                )}
              </div>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-center gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
            {!recording && !analyzing && !saving && (
              <Button
                size="lg"
                onClick={() => {
                  setError(null);
                  startRecording();
                }}
                disabled={!supported || !heightIn}
              >
                <Circle className="h-4 w-4 fill-current" />
                Start Set
              </Button>
            )}
            {recording && (
              <Button size="lg" variant="secondary" onClick={stopTracking}>
                <Square className="h-4 w-4" />
                Stop Set
              </Button>
            )}
            {(analyzing || saving) && (
              <Button size="lg" variant="secondary" disabled>
                {analyzing ? "Analyzing…" : `Saving… ${Math.round(uploadProgress * 100)}%`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
