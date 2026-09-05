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
import { visionJointsToWorldLandmarks, visionBoxTopToWorldY } from "@/lib/vision-body-landmarks";
import {
  deriveJumpPoint,
  detectFormFaults,
  computeLandingAsymmetry,
  calibrateFromFrames,
  calibrationMethodBreakdown,
  scaleWorldLandmarks,
  POSE_LANDMARKS,
  visible,
  type PoseFrame,
  type FormFaultThresholds,
} from "@/lib/pose-tracking";
import { summarizeJumpSet, type JumpSetMetrics } from "@/lib/jump-tracking";
import type { CaptureDeviceInfo, PoseFrame as NativePoseFrame } from "@/lib/native-av-preview";
import { interpolateOcclusionGap, type TrackedPoint } from "@/lib/bar-tracking";
import { videoFilenameForBlob } from "@/lib/video-recording";
import { buildTrackingDiagnostics } from "@/lib/tracking-diagnostics";

/** AVFoundation + Vision jump tracking (vertical/broad/box) -- the second real tracker built
 * on the new pipeline, directly parallel to ar-jump-tracker-dialog.tsx (which stays completely
 * untouched as a fallback). Jump was next for the same reason it went first off MediaPipe
 * originally: no implement to follow, just body joints -- summarizeJumpSet and
 * deriveJumpPoint run completely unmodified here too, same as the ARKit version, now fed by
 * vision-body-landmarks.ts instead of ar-body-landmarks.ts.
 *
 * The one thing this mode can't inherit from Sprint's Phase 4 conversion: calibration isn't
 * optional here the way it effectively was for ARKit. ARKit/MediaPipe's worldLandmarks are
 * already an approximately-real-meters estimate even with zero correction applied (see
 * computeHeightScaleCorrection's own comment) -- height calibration there is a NUDGE. Vision's
 * worldLandmarks-slot values (see vision-body-landmarks.ts) are pixel-space, with no
 * real-world meaning at all until scaled -- see computePixelToMeterScale's own comment on why
 * that's a genuinely different calibration problem. Without a successful calibration this
 * mode reports no jump height at all (same "couldn't get a clean read" path ArJumpTrackerDialog
 * already has for its own different failure reason), rather than a number computed from
 * meaningless pixel units.
 *
 * Camera/recording/analysis plumbing comes from useAvBodyTracking (shared with every other AV
 * tracker dialog) -- what's left here is purely jump-specific: the calibration application,
 * summarizeJumpSet, and the save/upload flow. */

const EMPTY_JUMP_METRICS: JumpSetMetrics = {
  bestJumpHeightCm: 0,
  bestHorizontalDistanceCm: null,
  avgGroundContactSeconds: null,
  reactiveStrengthIndex: null,
  repBreakdown: [],
  pathTrace: [],
  formFaults: [],
};

export function AvJumpTrackerDialog({
  open,
  onOpenChange,
  heightIn,
  movementType,
  equipment,
  usesBox,
  recordVideo,
  setNumber,
  onAnalysisStarted,
  onProcessingSettled,
  onUploadProgress,
  onCapture,
  videoContext,
  formFaultThresholds,
  jumpHeightOutlierPercent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heightIn?: number | null;
  movementType?: string | null;
  equipment?: string | null;
  // Drives the box-top object-detection pass (see stopTracking below and
  // AvBodyTrackingPlugin.swift's detectBoxTopCandidate) -- every other jump exercise
  // (vertical, broad, bound) has no physical object to detect, and skips this Vision work
  // entirely rather than pay its cost for nothing. Comes from workout.tsx's
  // item.materials.usesBox, the same flag that already drives the peakHeightCm substitution
  // (see that file's own comment) -- a box jump is identified by its equipment, not a
  // dedicated movementType string.
  usesBox?: boolean;
  recordVideo?: boolean;
  // Same "closes before analysis finishes" redesign as AvBarTrackerDialog -- see that
  // component's own comments on setNumber/onAnalysisStarted/onProcessingSettled/
  // onUploadProgress for the full reasoning; identical contract here.
  setNumber: number;
  onAnalysisStarted: (setNumber: number) => void;
  onProcessingSettled: (setNumber: number) => void;
  onUploadProgress?: (setNumber: number, percent: number) => void;
  onCapture: (metrics: JumpSetMetrics, videoUrl?: string, setNumber?: number, skeletonFrames?: PoseFrame[] | null) => void;
  videoContext?: VideoRecordContext;
  formFaultThresholds?: Partial<Record<keyof FormFaultThresholds, number | null>> | null;
  jumpHeightOutlierPercent?: number | null;
}) {
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // See AvBarTrackerDialog's own identical helper for why this wraps setUploadProgress
  // rather than replacing it -- this dialog's own uploadProgress state becomes invisible to
  // the athlete once it closes early, so the parent needs its own copy of every tick.
  function reportUploadProgress(forSetNumber: number) {
    return (fraction: number) => {
      // See AvBarTrackerDialog's own identical helper for why this converts fraction->percent
      // only for the onUploadProgress callback, not for setUploadProgress -- this dialog's own
      // render already does that conversion itself for the local uploadProgress state.
      setUploadProgress(fraction);
      onUploadProgress?.(forSetNumber, Math.round(fraction * 100));
    };
  }

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

  async function stopTracking() {
    // Captured once, up front -- see AvBarTrackerDialog's own identical comment on why every
    // callback below uses this value for the whole lifetime of this one Stop, never the
    // `setNumber` prop's possibly-since-changed live value.
    const forSetNumber = setNumber;
    try {
      // Starts the upload the instant the recording exists -- not after analysis (kalmanSmooth,
      // form faults, etc.) also finishes -- so the two run concurrently instead of stacked in
      // series. The upload never depends on anything analysis produces (metrics get attached to
      // the set separately, after the video's own URL comes back), so there's nothing to lose by
      // starting it this early. See finishWithRecording's own use of this promise below for why
      // every path (success, calibration-failed, no-clean-read) still just awaits the SAME
      // in-flight upload rather than starting a fresh one.
      let uploadPromise: Promise<{ status: "uploaded"; url: string } | { status: "queued" }> | null = null;
      const result = await stopRecordingAndAnalyze({
        detectBox: usesBox === true,
        // Always provided now (not just when recordVideo) -- see AvBarTrackerDialog's own
        // identical comment: recording has stopped and analysis is about to start regardless
        // of whether a video gets uploaded, and closing the dialog here (instead of leaving
        // the athlete staring at "Analyzing recording...") is the whole point of this redesign.
        onBlobReady: (blob) => {
          onAnalysisStarted(forSetNumber);
          if (recordVideo) {
            setSaving(true);
            setUploadProgress(0);
            const filename = videoFilenameForBlob(blob, "form-check");
            uploadPromise = uploadOrQueueVideo(
              blob,
              filename,
              videoContext ?? { label: "Jump" },
              reportUploadProgress(forSetNumber),
            );
          }
        },
      });
      if (!result) {
        // Analysis failed or was cancelled (the hook's own error state, or nothing, already
        // reported it) -- but the upload above doesn't know or care about that, since it never
        // depended on analysis succeeding. Left alone, it would still finish uploading in the
        // background with no set to attach it to: a real video on disk, orphaned. Wait for it and
        // hand it to the athlete's set anyway (with no computed metrics -- there aren't any),
        // same "the clip is worth keeping even without numbers" reasoning as the
        // calibration-failed/no-clean-read paths below, just for a third way this can happen.
        // Cast (not just copied to a fresh const) before narrowing -- uploadPromise is a `let`
        // reassigned only inside the onBlobReady closure above, and TypeScript's control-flow
        // analysis doesn't trace into closures: outside one, it treats a closure-only-assigned
        // `let` as having stayed at its initializer (null) forever, no matter the declared type,
        // which narrows the truthy branch below to `never` without this cast overriding it.
        const inFlightUpload = uploadPromise as Promise<
          { status: "uploaded"; url: string } | { status: "queued" }
        > | null;
        if (inFlightUpload) {
          try {
            const uploadResult = await inFlightUpload;
            toast.error("Couldn't finish analyzing this take, but your video was saved for your coach.");
            onCapture(
              EMPTY_JUMP_METRICS,
              uploadResult.status === "uploaded" ? uploadResult.url : undefined,
              forSetNumber,
            );
            onOpenChange(false);
          } catch {
            // Genuinely nothing left to salvage -- analysis already failed/cancelled and now the
            // upload did too. Leave the dialog open (same as the no-uploadPromise case below) so
            // whatever error state the hook already set stays visible.
          } finally {
            setSaving(false);
          }
        }
        return;
      }
      await finishWithRecording(
        result.blob,
        result.rawFrames.map((f) => ({ t: f.timestamp * 1000, worldLandmarks: visionJointsToWorldLandmarks(f) })),
        result.skeletonFrames,
        result.captureDeviceInfo,
        result.rawFrames,
        result.recordingStats,
        uploadPromise,
        forSetNumber,
      );
    } finally {
      // Fires no matter which of the paths above was taken -- see AvBarTrackerDialog's own
      // identical comment on why this is deliberately separate from onCapture.
      onProcessingSettled(forSetNumber);
    }
  }

  async function finishWithRecording(
    blob: Blob,
    rawFrames: { t: number; worldLandmarks: PoseFrame["worldLandmarks"] }[],
    skeletonFrames: PoseFrame[],
    captureDeviceInfo: CaptureDeviceInfo,
    nativeRawFrames: NativePoseFrame[],
    recordingStats: {
      frameCount: number;
      trackedFrameCount: number;
      elapsedSeconds: number;
      boxTopNormalizedY?: number;
      readerStatus?: string;
    },
    uploadPromise: Promise<{ status: "uploaded"; url: string } | { status: "queued" }> | null,
    forSetNumber: number,
  ) {
    const scaleFactor = calibrateFromFrames(rawFrames, heightIn);
    const calibrationFrames = calibrationMethodBreakdown(rawFrames);

    if (scaleFactor == null) {
      const diagnostics = buildTrackingDiagnostics({
        outcome: "empty_calibration_failed",
        message:
          "Couldn't calibrate real-world scale for this take -- make sure your height is set in your profile and you're clearly visible standing at some point in frame.",
        rawFrames: nativeRawFrames,
        recording: recordingStats,
        calibration: { scaleFactor: null, ...calibrationFrames },
      });
      const emptyMetrics: JumpSetMetrics = { ...EMPTY_JUMP_METRICS, captureDeviceInfo, trackingDiagnostics: diagnostics };
      // No number is better than a wrong one -- see this file's own comment
      // on why an uncalibrated Vision reading can't degrade gracefully the
      // way ARKit's can. Same "couldn't get a clean read, but the clip
      // still saves" UX ArJumpTrackerDialog already has for its own
      // different failure reason (summarizeJumpSet returning null).
      if (recordVideo && uploadPromise) {
        try {
          const result = await uploadPromise;
          toast.error(
            result.status === "queued"
              ? "Couldn't calibrate real-world scale for this take -- make sure your height is set in your profile and you're clearly visible standing at some point in frame. (No Wi-Fi -- video saved on your device, will upload for your coach once connected.)"
              : "Couldn't calibrate real-world scale for this take -- make sure your height is set in your profile and you're clearly visible standing at some point in frame. (Video saved for your coach.)",
          );
          if (result.status === "queued") {
            if (!hasWarnedAboutQueueing()) {
              markWarnedAboutQueueing();
              toast.info(
                "You can also upload a queued video manually anytime -- even over cellular -- from the Video Bank.",
                { duration: 10000 },
              );
            }
            onCapture(emptyMetrics, undefined, forSetNumber);
          } else {
            onCapture(emptyMetrics, result.url, forSetNumber);
          }
          onOpenChange(false);
        } catch (err) {
          const detail = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
          toast.error(`Couldn't calibrate, and the video didn't save either: ${detail}`);
        } finally {
          setSaving(false);
        }
      } else {
        toast.error(
          "Couldn't calibrate real-world scale for this take -- make sure your height is set in your profile and you're clearly visible standing at some point in frame.",
        );
      }
      return;
    }

    // Phase B: real depth when a frame has it -- see av-bar-tracker-dialog.tsx's own identical
    // comment for the full reasoning. rawFrames/nativeRawFrames are positionally aligned (both
    // derived from the same result.rawFrames via a plain, non-filtering .map()), so index i
    // always names the same underlying frame in both arrays.
    const frames: PoseFrame[] = rawFrames.map((f, i) => {
      return {
        t: f.t,
        landmarks: [],
      // Deliberately NOT `body3DLm ?? ...` any more. The 3D bridge returns metres relative to the
      // hip, the 2D one returns absolute image space, and the native plugin only produces 3D on
      // every third frame -- so mixing them per frame put a sawtooth into the trace at a third of
      // the frame rate. See visionBody3DToWorldLandmarks' own comment for the full reasoning and
      // for what recovering the depth properly would take.
        worldLandmarks: scaleWorldLandmarks(f.worldLandmarks, scaleFactor),
      };
    });
    // Same occlusion-gap bridging av-bar-tracker-dialog.tsx's own trace-building loop already
    // does. A jump's fastest, most blurred instant is exactly its mid-air phase -- a brief
    // ankle dropout there is common, and previously just silently dropped that frame from the
    // trace entirely rather than bridging it. On a set with a lot of scattered dropouts, that
    // can leave summarizeJumpSet's takeoff/landing state machine too few real samples to ever
    // register a genuine excursion as a jump at all -- exactly the "feet never left the ground"
    // false negative on a real, completed jump.
    //
    // Real box-jump footage (AR Diagnosis on a failed set) showed the default 200ms cap
    // (bar_path's own tuning -- see interpolateOcclusionGap's default) wasn't nearly enough:
    // only 106/221 frames had a body at all, and the misses run in long stretches through the
    // whole airborne phase, not scattered singles. A box jump's actual flight time is commonly
    // 300-600ms, so this widens the cap to 600ms -- enough to bridge most real flight phases
    // even when Vision loses the athlete for almost all of it. The tradeoff: a rep bridged this
    // way is a straight-line guess between the last grounded point and the first landed one, so
    // its reported jumpHeightCm/peakHeightCm reads as a rough floor on a heavily-occluded rep
    // (a true parabolic arc rises well above the straight-line midpoint), not a precise number
    // -- registering the jump at all beats reporting none, but this isn't a substitute for
    // actually improving detection through the jump itself.
    const JUMP_OCCLUSION_MAX_GAP_MS = 600;
    const trace: TrackedPoint[] = [];
    for (const f of frames) {
      const point = deriveJumpPoint(f.worldLandmarks);
      if (!point) continue;
      const lAnkle = f.worldLandmarks[POSE_LANDMARKS.LEFT_ANKLE];
      const rAnkle = f.worldLandmarks[POSE_LANDMARKS.RIGHT_ANKLE];
      const lOk = visible(lAnkle);
      const rOk = visible(rAnkle);
      const confidence = lOk && rOk ? Math.min(lAnkle.visibility, rAnkle.visibility) : lOk ? lAnkle.visibility : rOk ? rAnkle.visibility : 0;
      const trackedPoint: TrackedPoint = { t: f.t, x: point.x, y: point.y, z: point.z, confidence };
      const prevPoint = trace[trace.length - 1];
      if (prevPoint) {
        for (const gapPoint of interpolateOcclusionGap(prevPoint, trackedPoint, JUMP_OCCLUSION_MAX_GAP_MS))
          trace.push(gapPoint);
      }
      trace.push(trackedPoint);
    }

    // Same pixel-scale multiply scaleWorldLandmarks already applied to every joint above --
    // see vision-body-landmarks.ts's visionBoxTopToWorldY and summarizeJumpSet's own
    // boxTopWorldY parameter comment for why this needs the identical transform to be
    // comparable against the ankle trace. frameWidth/frameHeight are constant for one
    // recording (see native-av-preview.ts's PoseFrame comment), so any tracked frame's own
    // frameHeight is as good as any other's.
    const boxTopWorldY =
      recordingStats.boxTopNormalizedY != null && nativeRawFrames[0]
        ? visionBoxTopToWorldY(recordingStats.boxTopNormalizedY, nativeRawFrames[0].frameHeight) * scaleFactor
        : null;
    const metrics = summarizeJumpSet(trace, heightIn, jumpHeightOutlierPercent ?? undefined, boxTopWorldY);
    if (!metrics) {
      const diagnostics = buildTrackingDiagnostics({
        outcome: "empty_no_clean_read",
        message: "Couldn't get a clean read -- make sure your feet leave the ground clearly in frame.",
        rawFrames: nativeRawFrames,
        recording: recordingStats,
        calibration: { scaleFactor, ...calibrationFrames },
      });
      const emptyMetrics: JumpSetMetrics = { ...EMPTY_JUMP_METRICS, captureDeviceInfo, trackingDiagnostics: diagnostics };
      if (recordVideo && uploadPromise) {
        try {
          const result = await uploadPromise;
          toast.error(
            result.status === "queued"
              ? "Couldn't get a clean read -- make sure your feet leave the ground clearly in frame. (No Wi-Fi -- video saved on your device, will upload for your coach once connected.)"
              : "Couldn't get a clean read -- make sure your feet leave the ground clearly in frame. (Video saved for your coach.)",
          );
          if (result.status === "queued") {
            if (!hasWarnedAboutQueueing()) {
              markWarnedAboutQueueing();
              toast.info(
                "You can also upload a queued video manually anytime -- even over cellular -- from the Video Bank.",
                { duration: 10000 },
              );
            }
            onCapture(emptyMetrics, undefined, forSetNumber);
          } else {
            onCapture(emptyMetrics, result.url, forSetNumber);
          }
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

    metrics.formFaults = detectFormFaults(
      frames,
      0,
      "jump",
      movementType,
      equipment,
      undefined,
      undefined,
      metrics.repBreakdown.map((r) => ({ startT: r.takeoffT, endT: r.landingT })),
      formFaultThresholds,
    );
    metrics.landingAsymmetry = computeLandingAsymmetry(
      frames,
      metrics.repBreakdown.map((rep) => ({ landingT: rep.landingT })),
    );
    metrics.captureDeviceInfo = captureDeviceInfo;
    metrics.trackingDiagnostics = buildTrackingDiagnostics({
      outcome: "tracked",
      rawFrames: nativeRawFrames,
      recording: recordingStats,
      calibration: { scaleFactor, ...calibrationFrames },
    });

    // See av-bar-tracker-dialog.tsx's own comment on this same check -- readerStatus "failed"
    // with real partial progress means the native reader gave up partway through the
    // recording, so the reps/metrics below only cover whatever fraction it got through, not
    // the whole set. That distinction previously only ever reached the buried diagnostics
    // report.
    if (recordingStats.readerStatus === "failed" && recordingStats.frameCount > 0) {
      toast.warning("Analysis was cut short partway through this set -- numbers below may not cover every rep.");
    }

    // Direct answer to "did I clear it" -- the real payoff of detecting the box at all rather
    // than only ever inferring height off the athlete's own ankle rise (see jump-tracking.ts's
    // own comment on why that alone is an imperfect proxy for a box jump specifically). Silent
    // when usesBox is false (nothing was requested) or Vision genuinely couldn't get a
    // confident box read this take (bestBoxClearanceCm stays null either way) -- same
    // no-number-is-better-than-a-wrong-one restraint as the calibration-failure paths above,
    // not a warning nagging the athlete about a signal that was never available.
    if (usesBox && metrics.bestBoxClearanceCm != null) {
      if (metrics.bestBoxClearanceCm >= 0) {
        toast.success(`Cleared the box by ${metrics.bestBoxClearanceCm.toFixed(1)} cm`);
      } else {
        toast.warning(`Came up ${Math.abs(metrics.bestBoxClearanceCm).toFixed(1)} cm short of the box`);
      }
    }

    if (!recordVideo) {
      onCapture(metrics, undefined, forSetNumber, null);
      onOpenChange(false);
      return;
    }

    // uploadPromise is always set by now -- onBlobReady (stopTracking above) unconditionally
    // starts it whenever recordVideo is true, and recordVideo is true on every path that
    // reaches here (the early return above already covers the other case). The fallback still
    // starts a fresh upload rather than silently dropping the video if that invariant is ever
    // wrong.
    const inFlightUpload =
      uploadPromise ??
      uploadOrQueueVideo(
        blob,
        videoFilenameForBlob(blob, "form-check"),
        videoContext ?? { label: "Jump" },
        reportUploadProgress(forSetNumber),
      );
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
        onCapture(metrics, undefined, forSetNumber, skeletonFrames);
      } else {
        onCapture(metrics, result.url, forSetNumber, skeletonFrames);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Saved the set, but the clip failed to upload");
      onCapture(metrics, undefined, forSetNumber, skeletonFrames);
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
                  {/* The upload now starts the instant the recording exists, running
                      concurrently with analysis rather than waiting for it (see stopTracking's
                      own comment) -- so both are routinely true at once. Analyzing's own
                      progress stays the headline number while it's still running (saving is
                      happening quietly behind it), and only takes over once analysis is done
                      but the upload still has a tail left. */}
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
                Add your height in your profile to get calibrated jump numbers from this camera.
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
                Start Jump Set
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
