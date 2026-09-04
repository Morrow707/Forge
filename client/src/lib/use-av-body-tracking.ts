import { useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/react";
import {
  isAvBodyTrackingSupported,
  startAvPreview,
  stopAvPreview,
  updateAvPreviewRect,
  startAvRecording,
  stopAvRecording,
  deleteAvRecording,
  analyzeAvRecording,
  cancelAvAnalysis,
  onAvPoseFrame,
  onAvSessionError,
  pollAvDiagnosticLog,
  setAvCameraActive,
  extractCaptureDeviceInfo,
  type PoseFrame as NativePoseFrame,
  type CaptureDeviceInfo,
  type AvAnalysisResult,
} from "@/lib/native-av-preview";
import { buildSkeletonReplayFrames } from "@/lib/vision-body-landmarks";
import type { PoseFrame } from "@/lib/pose-tracking";

// Every frame (analyzeAvRecording's own sampleEveryNthFrame default) was never actually
// necessary -- interpolateOcclusionGap/kalmanSmooth (bar-tracking.ts) work off each frame's
// REAL timestamp, not a frame count, specifically so a sparser trace degrades gracefully
// instead of breaking (that's the whole reason jump mode was already switched to
// kalmanSmooth this same work session). Every 2nd frame still gives a 30fps-equivalent
// trace on a 60fps recording -- well above what any published video-based jump/bar-velocity
// methodology needs -- for roughly half the Vision (VNDetectHumanBodyPoseRequest) work the
// "Analyzing recording" step has to do per clip. Reported as the single biggest source of
// wait between a set finishing and it actually being saved.
const ANALYSIS_SAMPLE_STRIDE = 2;

/** The AVFoundation + Vision camera/recording/analysis lifecycle shared by every tracker
 * dialog on the new pipeline (Sprint/Jump/Mechanics/Swing today, more to come) -- mirrors
 * use-ar-body-tracking.ts's own shape and reasoning almost exactly (capability check, the
 * container-ready wait/retry dance, session-error/diagnostic-log plumbing, teardown), but
 * extended to also own the record-first-analyze-later pipeline this architecture needs that
 * ARKit's live tracking never did: starting/stopping a recording, running Vision against it,
 * streaming per-frame progress back out, and a real Cancel path (native support wired through
 * AvBodyTrackingPlugin.swift's own cancelAnalysis -- not a client-side-only "stop showing the
 * spinner" that leaves the native loop running to completion regardless).
 *
 * `active` (not `open`) drives the camera preview -- unlike ARKit's one-session-per-dialog-
 * open model, every AV dialog only wants the live preview during specific steps
 * (calibrate/capture), not for as long as the dialog is merely mounted, so the caller passes
 * whatever boolean expression captures that (e.g. `open && (step === "calibrate" || step ===
 * "capture")`).
 *
 * Unlike use-ar-body-tracking.ts, there's no live `frame` here at all -- Vision only ever
 * runs against a finished recording, never a live feed (see AvBodyTrackingPlugin.swift's own
 * comment on why). What's tracker-specific -- checkpoint math, calibration, rep/angle math --
 * stays in the calling dialog; this hook only owns getting the camera live, a recording
 * captured, and raw analyzed frames flowing back out, same division of responsibility as its
 * ARKit counterpart. */
// orientation defaults to portrait, which is every tracker except the sprint one. See
// AvBodyTrackingPlugin.swift's captureOrientation for why a sprint wants landscape and why
// only a sprint is worth the sideways UI a portrait-locked app gives in exchange.
export function useAvBodyTracking(active: boolean, orientation?: "portrait" | "landscape") {
  const containerRef = useRef<HTMLDivElement>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [supportError, setSupportError] = useState<string | undefined>(undefined);
  // isAvBodyTrackingSupported already returns this -- it was being discarded here, so no
  // dialog could ever tell "device unsupported" apart from "camera permission denied," the two
  // most common reasons this whole pipeline goes dark for a real user.
  const [cameraPermission, setCameraPermission] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [diagLog, setDiagLog] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzedFrames, setAnalyzedFrames] = useState(0);

  const recordingPathRef = useRef<string | null>(null);
  // Distinguishes an analysis that failed for a real reason from one that stopped because
  // cancelAnalysis() was called -- analyzeAvRecording's promise rejects either way (see its
  // own comment), and only the former should surface as an `error` state.
  const cancelledRef = useRef(false);
  // See stopRecordingAndAnalyze's own comment -- true for the whole duration of one
  // stop-and-analyze call, so a second call arriving while the first is still in flight is a
  // safe no-op instead of racing the native plugin's own single-in-flight-recording state.
  const stoppingRef = useRef(false);

  useEffect(() => {
    setError(null);
    setDiagLog([]);
    isAvBodyTrackingSupported().then(({ supported: isSupported, error: supportErr, cameraPermission: perm }) => {
      setSupported(isSupported);
      setSupportError(supportErr);
      setCameraPermission(perm);
    });
    // Runs once per mount, not keyed to `active` -- device support doesn't change mid-dialog,
    // and checking it doesn't need the camera live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!active) {
      setAvCameraActive(false);
      void stopAvPreview();
      return;
    }
    let cancelled = false;
    let rafId: number | null = null;
    let started = false;
    let waitFrames = 0;
    const MAX_WAIT_FRAMES = 180;

    function onResize() {
      const r = containerRef.current?.getBoundingClientRect();
      if (r) void updateAvPreviewRect(r);
    }
    // The preview layer is a NATIVE view positioned behind the web view at a rect measured in
    // CSS pixels, so it does not move with the layout on its own -- every change of the
    // container's box has to be pushed down explicitly. A rotation is the largest such change
    // there is (the sprint tracker now rotates the interface, see AppDelegate's
    // supportedInterfaceOrientationsFor), and it is also the one WKWebView is least reliable
    // about reporting: "resize" may fire before the new geometry has settled, or land on the
    // pre-rotation size. Re-measuring on the next frame after the event, in addition to
    // handling the event itself, costs one extra rect read and removes a preview stuck at the
    // old portrait box over a landscape camera.
    function onOrientationChange() {
      onResize();
      requestAnimationFrame(onResize);
    }

    function tryStart() {
      if (cancelled) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        // This effect only ever runs once per `active` transition, so a one-shot ref check
        // that loses the race with the dialog's own open-transition/portal mount would mean
        // the camera silently never starts for the rest of that step -- wait and retry
        // instead of giving up after one failed read (same reasoning as the ARKit hook).
        waitFrames++;
        if (waitFrames > MAX_WAIT_FRAMES) return;
        rafId = requestAnimationFrame(tryStart);
        return;
      }
      started = true;
      setAvCameraActive(true);
      startAvPreview(rect, undefined, orientation)
        .then(() => {
          // start() is what actually requests camera access natively (see
          // AvBodyTrackingPlugin.swift's continueStart) -- the mount-time isAvBodyTrackingSupported
          // check above necessarily ran before that, so cameraPermission was always going to read
          // "notDetermined" up to this point regardless of what the athlete actually granted.
          // Re-checking now is what makes the diagnostic overlay's permission line reflect reality
          // instead of a stale first-render snapshot.
          if (!cancelled) {
            isAvBodyTrackingSupported().then(({ supported: isSupported, error: supportErr, cameraPermission: perm }) => {
              if (cancelled) return;
              setSupported(isSupported);
              setSupportError(supportErr);
              setCameraPermission(perm);
            });
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "Could not start camera");
        });
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onOrientationChange);
    }

    tryStart();
    return () => {
      cancelled = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientationChange);
      if (started) {
        setAvCameraActive(false);
        void stopAvPreview();
      }
    };
  }, [active, orientation]);

  useEffect(() => onAvSessionError(setError), []);

  useEffect(() => {
    if (!active) return;
    return pollAvDiagnosticLog(setDiagLog);
  }, [active]);

  // Defense-in-depth against a lingering native temp file -- see
  // AvBodyTrackingPlugin.swift's own comment on the storage-bloat edge case this guards.
  // stopRecordingAndAnalyze already deletes the file itself on every normal path; this only
  // matters if the component unmounts mid-analysis (e.g. the dialog closes while a
  // recording's still being processed).
  useEffect(() => {
    return () => {
      if (recordingPathRef.current) void deleteAvRecording(recordingPathRef.current);
    };
  }, []);

  function startRecording() {
    setError(null);
    setRecording(true);
    startAvRecording().catch((err) => {
      setError(err instanceof Error ? err.message : "Could not start recording");
      setRecording(false);
    });
  }

  // Discards the current recording without analyzing it -- for a dialog's own "Cancel" path
  // during capture (not to be confused with cancelAnalysis below, which interrupts an
  // already-started analysis).
  async function cancelRecording() {
    setRecording(false);
    try {
      const { path } = await stopAvRecording();
      await deleteAvRecording(path);
    } catch {
      // Nothing to clean up if stopping itself failed.
    }
  }

  // Stops recording, runs Vision against the finished clip, and returns every tracked frame
  // -- null on any failure or cancellation (this hook's own `error` state is already set by
  // the time this resolves, for a real failure; a cancellation sets no error, since the
  // caller asked for it). Cleans up the native temp file itself once analysis finishes
  // either way, so callers never have to think about it.
  //
  // Guarded against a second concurrent call (stoppingRef) -- a real double-tap on the
  // dialog's own Stop button, or a slow render leaving it tappable a moment longer than
  // intended, was reaching AvBodyTrackingPlugin.swift's stopRecording() twice: the first
  // call's native stopRecording() flips movieOutput.isRecording to false immediately (before
  // the file's even finished writing), so a second call in flight at the same time hits that
  // plugin's own "Not recording" guard and surfaces as a spurious error on what the athlete
  // experienced as a single, ordinary tap.
  async function stopRecordingAndAnalyze(options?: {
    detectBox?: boolean;
    // "med_ball" turns on the additive CoreML implement detector (see
    // native-av-preview.ts's PoseCoreMlImplement) -- every other caller
    // omits this and analysis behaves exactly as before.
    trackingMode?: string;
    // Fired the instant the recorded blob exists -- right after native stopRecording()
    // resolves, BEFORE Vision analysis (the "Analyzing recording" step) even starts, let
    // alone finishes. The upload doesn't depend on anything Vision produces (metrics get
    // attached to the set separately), so a caller can start uploadOrQueueVideo here and run
    // it concurrently with analysis instead of waiting for analysis to finish first -- see
    // each dialog's own stopTracking for how this cuts the athlete's total wait to roughly
    // the LONGER of the two steps instead of both stacked in series. Never awaited by this
    // hook; a caller that doesn't pass it loses nothing (nothing changes from before this
    // existed).
    onBlobReady?: (blob: Blob) => void;
  }): Promise<
    | {
        blob: Blob;
        rawFrames: NativePoseFrame[];
        skeletonFrames: PoseFrame[];
        captureDeviceInfo: CaptureDeviceInfo;
        recordingStats: AvAnalysisResult;
      }
    | null
  > {
    if (stoppingRef.current) return null;
    stoppingRef.current = true;
    try {
      return await doStopRecordingAndAnalyze(options);
    } finally {
      stoppingRef.current = false;
    }
  }

  async function doStopRecordingAndAnalyze(options?: {
    detectBox?: boolean;
    trackingMode?: string;
    onBlobReady?: (blob: Blob) => void;
  }): Promise<
    | {
        blob: Blob;
        rawFrames: NativePoseFrame[];
        skeletonFrames: PoseFrame[];
        captureDeviceInfo: CaptureDeviceInfo;
        recordingStats: AvAnalysisResult;
      }
    | null
  > {
    setRecording(false);
    setAnalyzing(true);
    setAnalyzedFrames(0);
    cancelledRef.current = false;
    // Snapshot now, not at the very end -- diagLog is this render's closed-over value and
    // won't pick up anything the native side logs after this point anyway (the session's still
    // running, but the recording that snapshot describes has already stopped).
    const captureDeviceInfo = extractCaptureDeviceInfo(diagLog);

    let blob: Blob;
    let path: string;
    try {
      ({ blob, path } = await stopAvRecording());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the recording");
      setAnalyzing(false);
      return null;
    }
    recordingPathRef.current = path;
    options?.onBlobReady?.(blob);

    const rawFrames: NativePoseFrame[] = [];
    const unsubscribe = onAvPoseFrame((frame) => {
      if (!frame.tracked) return;
      rawFrames.push(frame);
      setAnalyzedFrames((n) => n + 1);
    });
    let recordingStats: AvAnalysisResult;
    try {
      recordingStats = await analyzeAvRecording(
        path, ANALYSIS_SAMPLE_STRIDE, options?.detectBox, options?.trackingMode
      );
    } catch (err) {
      unsubscribe();
      void deleteAvRecording(path);
      recordingPathRef.current = null;
      setAnalyzing(false);
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : "Analysis failed");
        // This path (native analysis throwing, most commonly AvBodyTrackingPlugin's own stall
        // watchdog giving up -- see its own comment) was previously invisible: caught here,
        // shown to the athlete as a toast in the calling dialog, and never reported anywhere,
        // so a real recurring hang would have had no signal telling anyone it was happening at
        // all. framesProcessedBeforeFailure (from analyzedFrames, the same counter the "N frames
        // processed..." UI text already reads) is the one piece of context that actually
        // distinguishes "stuck before frame 1" from "got partway through then stalled" -- the
        // two failure shapes the native watchdog itself can't yet tell apart from out here.
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
          tags: { avAnalysisFailure: true, trackingMode: options?.trackingMode ?? "none" },
          extra: {
            framesProcessedBeforeFailure: analyzedFrames,
            deviceModel: captureDeviceInfo.deviceModel,
            systemVersion: captureDeviceInfo.systemVersion,
            activeFormat: captureDeviceInfo.activeFormat,
          },
        });
      }
      return null;
    }
    unsubscribe();
    void deleteAvRecording(path);
    recordingPathRef.current = null;
    setAnalyzing(false);
    // Built here, once, for every caller -- see buildSkeletonReplayFrames' own comment for why
    // this is the only way iOS's skeleton replay can work at all (unlike Android/MediaPipe,
    // there's no "re-run the model against a stored clip" path). A caller that doesn't attach
    // this to its own capture payload loses nothing beyond skeleton replay -- it's dead weight,
    // not a dependency of anything else this hook returns.
    const skeletonFrames = buildSkeletonReplayFrames(rawFrames);
    return { blob, rawFrames, skeletonFrames, captureDeviceInfo, recordingStats };
  }

  function cancelAnalysis() {
    cancelledRef.current = true;
    void cancelAvAnalysis();
  }

  return {
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
    cancelRecording,
    stopRecordingAndAnalyze,
    cancelAnalysis,
  };
}
