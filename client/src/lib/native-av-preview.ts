import { registerPlugin } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";

// JS side of ios/App/App/AvBodyTrackingPlugin.swift -- Phase 1 of the AVFoundation + Vision
// pipeline that replaces ARKit on iOS (see that Swift file's own comment, and
// native-ar-preview.ts's for the ARKit-era plugin this eventually replaces, kept untouched as
// a fallback). Camera-only for now: zoom, lens switching, focus/exposure, and MP4 recording to
// disk. No body-pose or object-tracking events yet -- those land in Phase 2/3 once Vision
// framework processing against the recorded clip exists.
export type LensInfo = { id: "wide" | "ultraWide" | "telephoto" | string; label: string; minZoom: number; maxZoom: number };

// Raw Vision coordinates -- normalized 0-1, origin at BOTTOM-left (Vision's own convention,
// different from the top-left-origin image space most of the rest of this app assumes). The
// Y-flip belongs in vision-body-landmarks.ts (Phase 3), not here -- see
// AvBodyTrackingPlugin.swift's own comment on why it's left raw at the source.
export type PoseJoint = { name: string; x: number; y: number; confidence: number };
// Phase 5: object/implement tracking (bar path, thrown ball) -- AvImplementTracker.swift's own
// output, in the exact same raw Vision convention as PoseJoint above (normalized 0-1,
// bottom-left origin, relative to frameWidth/frameHeight). Omitted (not a zeroed/default
// point) on a frame with no lock -- see AvBodyTrackingPlugin.swift's own comment on its
// omit-when-nil emission, matching ArCameraPreviewPlugin's existing implementResultDict
// pattern. A caller tracking a single implement (a thrown medicine ball, not a two-handed bar)
// uses leftImplement alone and ignores rightImplement.
export type PoseImplement = {
  x: number;
  y: number;
  confidence: number;
  // Real RGB sample at the found position, for implement-appearance-memory.ts's existing
  // corroboration feature -- carried through even though no current AV dialog reads it yet,
  // same as ArImplementTracker's own color field (computed and emitted despite
  // ar-bar-tracker-dialog.tsx not calling into that feature either).
  color?: { r: number; g: number; b: number };
};
// frameWidth/frameHeight are the UPRIGHT (already orientation-corrected) pixel dimensions
// Vision measured joints against -- see AvBodyTrackingPlugin.swift's own comment on why this
// isn't just the raw buffer's native width/height, and vision-body-landmarks.ts for why the
// bridge needs real pixel dimensions (not just normalized 0-1 values) at all.
// Med-ball-only (see analyzeAvRecording's trackingMode param): a real,
// trained, on-device CoreML detection/tracking result, additive alongside
// leftImplement/rightImplement above -- see AvBodyTrackingPlugin.swift's
// AvCoreMlImplementDetector for the full reasoning. x/y is the box's
// center point (same normalized 0-1, bottom-left-origin convention as
// every other coordinate here); width/height let a caller draw or reason
// about the actual box, not just a point. Omitted whenever the mode isn't
// active, no model is bundled yet, or nothing was found this frame -- the
// same omit-when-nil convention as leftImplement/rightImplement.
//
// Not yet consumed by any tracking/summarization math on this side (see
// bar-tracking.ts) -- this type exists so the data has somewhere to land
// once a real MedBallDetector.mlmodelc actually ships; wiring up which
// signal wins when both this and the motion-diff implement trackers
// report a position is deliberately left for a follow-up pass, once
// there's real on-device data to validate the choice against.
export type PoseCoreMlImplement = { x: number; y: number; width: number; height: number; confidence: number };

// Med-ball-only, same scope/reasoning as coreMlImplement above -- how far
// this frame's background has drifted from the clip's first frame (camera
// shake, not implement motion), normalized the same 0-1 way as every other
// coordinate here. See AvBodyTrackingPlugin.swift's AvCameraStabilizer.
// Not yet subtracted from anything on this side -- same "data has somewhere
// to land, wiring left for a follow-up pass" note as coreMlImplement.
export type PoseCameraDrift = { x: number; y: number };

// Apple's own VNDetectHumanHandPoseRequest output -- the direct Vision equivalent of
// MediaPipe's Hand Landmarker (see hand-tracking.ts on the Android/web side). Same raw Vision
// convention as PoseJoint (normalized 0-1, bottom-left origin, no Y-flip at this layer --
// that belongs in vision-body-landmarks.ts, same as every other coordinate here). `hand` is a
// stable per-frame index (0/1), not a left/right label -- chirality isn't reported here since
// its sense depends on camera mirroring this app doesn't consistently control; see
// vision-body-landmarks.ts's visionRefineGripSeed for why grip-seed matching goes by proximity
// instead. Omitted (not an empty array) on a frame with no hand detected -- same omit-when-nil
// convention as leftImplement above.
export type PoseHandJoint = { hand: number; name: string; x: number; y: number; confidence: number };

// Apple's own VNDetectHumanBodyPose3DRequest output (iOS 17+ only -- see AvAnalysisResult's own
// body3DAvailable). Genuinely different coordinate space from every other joint this plugin
// emits: real camera/skeleton-relative METERS (Vision's own VNPoint3D convention, relative to
// the root/hip joint), not normalized 0-1 image-space -- see vision-body-landmarks.ts's
// visionBody3DToWorldLandmarks for the bridge that writes these straight through with no
// pixel-scale/Y-flip, unlike every 2D joint here. Omitted (not an empty array), same
// omit-when-nil convention as handJoints, on any frame that didn't get a gated perform() call
// (see AvBodyTrackingPlugin.swift's own body3DDetectionStride) or found no confident 3D pose.
export type PoseBody3DJoint = { name: string; x: number; y: number; z: number; confidence: number };

export type PoseFrame = {
  frameIndex: number;
  timestamp: number;
  tracked: boolean;
  joints: PoseJoint[];
  frameWidth: number;
  frameHeight: number;
  leftImplement?: PoseImplement;
  rightImplement?: PoseImplement;
  coreMlImplement?: PoseCoreMlImplement;
  cameraDrift?: PoseCameraDrift;
  handJoints?: PoseHandJoint[];
  body3DJoints?: PoseBody3DJoint[];
};

// Shared by the plugin interface's own analyzeRecording method below and analyzeAvRecording's
// exported return type -- one declaration instead of the same shape duplicated in both places.
export type AvAnalysisResult = {
  frameCount: number;
  trackedFrameCount: number;
  elapsedSeconds: number;
  // What the recorded asset's own metadata claims its total length is, and what the native
  // AVAssetReader's read loop actually stopped on ("completed" = genuinely reached the end of
  // the track; "failed"/"cancelled" = the reader gave up partway through). Diagnostic only --
  // nothing here reads these to drive tracking math -- added specifically to tell "the athlete's
  // take was genuinely short" apart from "analysis stopped early on a long recording," which
  // frameCount/elapsedSeconds alone can't distinguish (both read identically: a small frame
  // count and a fast elapsed time). See AvBodyTrackingPlugin.swift's own comment on this same
  // pair for the real bar-tracking bug that motivated adding it.
  assetDurationSeconds: number;
  readerStatus: "completed" | "failed" | "cancelled" | "reading" | "unknown";
  readerErrorMessage?: string;
  // Analysis-time device/pipeline conditions, read once at the end of the Vision loop -- see
  // AvBodyTrackingPlugin.swift's own comments on thermalStateDescription/
  // availableDiskSpaceBytes and the visionFailureCount/maxInterFrameGapSeconds counters for why
  // each is worth capturing. All diagnostic, same as assetDurationSeconds/readerStatus above --
  // nothing here drives tracking math, only helps root-cause a bad clip after the fact.
  visionFailureCount: number;
  thermalState: "nominal" | "fair" | "serious" | "critical" | "unknown";
  lowPowerModeEnabled: boolean;
  // Omitted (not a zeroed default) when the free-space read itself failed, or when fewer than
  // two processed frames exist to measure a gap between -- same omit-when-nil convention as
  // boxTopNormalizedY below.
  freeDiskSpaceBytes?: number;
  maxInterFrameGapSeconds?: number;
  // Vision's own raw normalized (0-1, bottom-left-origin) convention, same as PoseJoint.y
  // above -- see AvBodyTrackingPlugin.swift's detectBoxTopCandidate for how this is found
  // (VNDetectRectanglesRequest, median across the whole clip) and vision-body-landmarks.ts's
  // visionBoxTopToWorldY for the bridge into this app's own y-down, real-scale convention.
  // Omitted (not present at all), not a zeroed default, when detectBox wasn't requested or
  // no confident read was found -- box jump is the only caller that ever passes detectBox.
  boxTopNormalizedY?: number;
  // Total time (across every sampled frame) VNDetectHumanHandPoseRequest itself took, measured
  // as its own separate handler.perform() call so it's isolated from the already-accepted
  // poseRequest cost -- see AvBodyTrackingPlugin.swift's own comment. Diagnostic only, same as
  // visionFailureCount/maxInterFrameGapSeconds -- this is what decides whether hand tracking
  // needs its own sparser stride later, not something any metric reads.
  handPoseElapsedSeconds: number;
  // Phase B diagnostics -- same reasoning as handPoseElapsedSeconds above, isolating
  // VNDetectHumanBodyPose3DRequest's own cost. Always present (never omitted) -- unlike
  // boxTopNormalizedY, this is a per-clip aggregate the native side always has a real number
  // for, even when body3DFrameCount is 0 (nothing attempted) or body3DAvailable is false (iOS
  // 15/16, the request was never even constructed).
  body3DElapsedSeconds: number;
  // How many sampled frames actually got a gated perform() call -- see
  // AvBodyTrackingPlugin.swift's own body3DDetectionStride comment. Divides into
  // body3DElapsedSeconds for a real per-call average, not one diluted by every skipped frame.
  body3DFrameCount: number;
  // Reflects the #available(iOS 17.0, *) gate itself, independent of whether any frame actually
  // found a confident 3D pose this clip -- confirms the OS-version check fired correctly, not
  // just that body3DJoints happened to come back empty on every frame.
  body3DAvailable: boolean;
};

interface AvBodyTrackingPlugin {
  isSupported(): Promise<{
    supported: boolean;
    cameraPermission: "authorized" | "denied" | "restricted" | "notDetermined" | "unknown";
  }>;
  requestCameraPermission(): Promise<{ granted: boolean }>;
  start(options: PreviewRect & { lens?: string; orientation?: "portrait" | "landscape" }): Promise<void>;
  stop(): Promise<void>;
  updateRect(rect: PreviewRect): Promise<void>;
  listLenses(): Promise<{ lenses: LensInfo[] }>;
  selectLens(options: { lens: string }): Promise<void>;
  setZoom(options: { factor: number }): Promise<{ appliedFactor: number }>;
  setFocusPoint(options: { x: number; y: number }): Promise<void>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<{ path: string }>;
  deleteRecording(options: { path: string }): Promise<void>;
  analyzeRecording(options: {
    path: string;
    sampleEveryNthFrame?: number;
    detectBox?: boolean;
    trackingMode?: string;
  }): Promise<AvAnalysisResult>;
  cancelAnalysis(): Promise<void>;
  getDiagnosticLog(): Promise<{ log: string[] }>;
  addListener(
    eventName: "sessionError",
    listenerFunc: (error: { message: string }) => void,
  ): Promise<{ remove: () => void }>;
  addListener(eventName: "poseFrame", listenerFunc: (frame: PoseFrame) => void): Promise<{ remove: () => void }>;
}

type PreviewRect = { x: number; y: number; width: number; height: number };

const AvBodyTracking = registerPlugin<AvBodyTrackingPlugin>("AvBodyTracking");

export function isAvPreviewPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

// Same transparent-hole mechanism ArCameraPreviewPlugin already uses -- see
// setArCameraActive in native-ar-preview.ts and index.css's html.ar-camera-active rule. A
// second, separate class rather than reusing that one so the two camera sources (ARKit,
// still present as a fallback; this new one) can never accidentally fight over the same DOM
// toggle if both ever ran during development at once.
export function setAvCameraActive(active: boolean): void {
  document.documentElement.classList.toggle("av-camera-active", active);
}

function plainRect(rect: PreviewRect): PreviewRect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

export async function isAvBodyTrackingSupported(): Promise<{
  supported: boolean;
  error?: string;
  cameraPermission?: string;
}> {
  if (!isAvPreviewPlatform()) return { supported: false };
  try {
    const { supported, cameraPermission } = await AvBodyTracking.isSupported();
    return { supported, cameraPermission };
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return { supported: false, error: detail };
  }
}

export async function requestAvCameraPermission(): Promise<boolean> {
  const { granted } = await AvBodyTracking.requestCameraPermission();
  return granted;
}

// orientation "landscape" rotates BOTH the preview and the recording connections -- see
// AvBodyTrackingPlugin.swift's captureOrientation for why the sprint tracker is the one caller
// that wants it, and why a portrait-locked UI is an acceptable trade only there.
export async function startAvPreview(
  rect: PreviewRect,
  lens?: string,
  orientation?: "portrait" | "landscape",
): Promise<void> {
  await AvBodyTracking.start({ ...plainRect(rect), lens, orientation });
}

export async function stopAvPreview(): Promise<void> {
  await AvBodyTracking.stop();
}

export async function updateAvPreviewRect(rect: PreviewRect): Promise<void> {
  await AvBodyTracking.updateRect(plainRect(rect));
}

export async function listAvLenses(): Promise<LensInfo[]> {
  const { lenses } = await AvBodyTracking.listLenses();
  return lenses;
}

export async function selectAvLens(lens: string): Promise<void> {
  await AvBodyTracking.selectLens({ lens });
}

export async function setAvZoom(factor: number): Promise<number> {
  const { appliedFactor } = await AvBodyTracking.setZoom({ factor });
  return appliedFactor;
}

// point is normalized (0-1, top-left origin) -- callers pass a tap's offset within the
// preview container divided by that container's own width/height.
export async function setAvFocusPoint(x: number, y: number): Promise<void> {
  await AvBodyTracking.setFocusPoint({ x, y });
}

export async function startAvRecording(): Promise<void> {
  await AvBodyTracking.startRecording();
}

// Mirrors stopArRecording in native-ar-preview.ts, but does NOT delete the native file --
// Phase 2's analyzeAvRecording still needs to read it from disk after this returns. Callers
// own calling deleteAvRecording(path) once they're done with BOTH the blob (e.g. queued for
// upload) and analysis -- purgeStaleRecordings() on the next native start() call is the
// backstop if a caller never gets there (see AvBodyTrackingPlugin.swift's own comment).
//
// Streams the file straight into a Blob via Capacitor's own file:// URL scheme handler
// (convertFileSrc + fetch) instead of Filesystem.readFile's base64 round-trip this used to go
// through. readFile has to hand back the ENTIRE file as one base64 string -- ~33% larger than
// the source bytes, and briefly resident in memory a second time again as the decoded Uint8Array
// below -- which on a long 4K60 recording (100MB+) is real OOM risk on an older/lower-RAM
// device, on top of the UI-thread string-decode cost of atob() against something that size.
// fetch()/response.blob() streams the response body directly into a Blob without Capacitor's
// bridge ever needing to serialize the whole file through a JS string at all.
export async function stopAvRecording(): Promise<{ blob: Blob; path: string }> {
  const { path } = await AvBodyTracking.stopRecording();
  // convertFileSrc wants the bare filesystem path -- same raw (no file:// scheme) path
  // deleteAvRecording/analyzeAvRecording already pass straight back to native calls that
  // expect exactly that form (FileManager's removeItem(atPath:) and URL(fileURLWithPath:)
  // respectively). Prepending file:// here would double up the scheme Capacitor's own
  // internal URL already adds.
  const url = Capacitor.convertFileSrc(path);
  const response = await fetch(url);
  const rawBlob = await response.blob();
  // Same class of bug recordedVideoType() in video-recording.ts exists to fix on the OTHER
  // (MediaRecorder) recording path: a Blob has to be labeled with the container it actually
  // is, not whatever the fetch happened to infer. fetch()-ing a local file:// asset through
  // Capacitor's handler doesn't reliably set blob.type at all, so this came back
  // empty/generic -- which then fails server/routes.ts's uploadFormVideo fileFilter outright
  // ("Unsupported video format") since it can't recognize the mimetype, rather than merely
  // producing an unplayable-but-accepted file like the MediaRecorder-path bug does. Unlike
  // that path, there's nothing to "read as source of truth" here -- AvBodyTrackingPlugin.swift
  // always records via AVCaptureMovieFileOutput to a ".mov" path (see startRecording), which
  // only ever writes a QuickTime container, so the correct type is a known constant, not
  // something to detect.
  const blob = rawBlob.type === "video/quicktime" ? rawBlob : new Blob([rawBlob], { type: "video/quicktime" });
  return { blob, path };
}


export async function deleteAvRecording(path: string): Promise<void> {
  await AvBodyTracking.deleteRecording({ path }).catch(() => {
    // Best-effort -- purgeStaleRecordings() is the backstop.
  });
}

// Phase 2: runs Vision body-pose detection against the recorded clip already on disk (see
// AvBodyTrackingPlugin.swift's analyzeRecording) -- entirely offline, not a live stream.
// Subscribe with onAvPoseFrame BEFORE calling this to see per-frame results as they're
// produced; the returned promise resolves once every frame has been processed.
// trackingMode: "med_ball" turns on the additive CoreML implement detector
// (see PoseCoreMlImplement's own comment) -- omitted or any other value
// leaves every exercise's analysis exactly as it was before this param
// existed.
export async function analyzeAvRecording(
  path: string,
  sampleEveryNthFrame?: number,
  detectBox?: boolean,
  trackingMode?: string,
): Promise<AvAnalysisResult> {
  return AvBodyTracking.analyzeRecording({ path, sampleEveryNthFrame, detectBox, trackingMode });
}

// Real native cancellation of an in-progress analyzeAvRecording call -- see
// AvBodyTrackingPlugin.swift's own cancelAnalysis comment on why this has to reach the
// native side rather than just being a client-side "stop showing the spinner": without it,
// Vision keeps processing every remaining frame on the native side regardless, burning
// battery/CPU for a result nothing will use. The pending analyzeAvRecording() promise
// rejects once the native loop actually stops, same as any other failure -- callers should
// expect that rejection, not treat it as a bug.
export async function cancelAvAnalysis(): Promise<void> {
  await AvBodyTracking.cancelAnalysis();
}

export function onAvPoseFrame(callback: (frame: PoseFrame) => void): () => void {
  let handle: { remove: () => void } | null = null;
  let cancelled = false;
  AvBodyTracking.addListener("poseFrame", callback).then((h) => {
    if (cancelled) {
      h.remove();
      return;
    }
    handle = h;
  });
  return () => {
    cancelled = true;
    handle?.remove();
  };
}

// Same polling pattern as pollDiagnosticLog in native-ar-preview.ts -- see its own comment on
// why polling beats a live event for a log that needs to survive being emitted before this
// page's own addListener call has finished its async round-trip.
export function pollAvDiagnosticLog(callback: (log: string[]) => void): () => void {
  let cancelled = false;
  const interval = setInterval(() => {
    if (cancelled) return;
    AvBodyTracking.getDiagnosticLog()
      .then(({ log }) => {
        if (!cancelled) callback(log);
      })
      .catch(() => {
        // Nothing new to show -- not worth its own error on top of the rest of the strip.
      });
  }, 400);
  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}

// Parses the fixed-format lines AvBodyTrackingPlugin.swift's logDiag() emits at session
// start ("device model=...", "using lens: ...", "activeFormat set: ...", "focus/exposure mode
// set: focus=N exposure=N") plus the per-second "cam: lens=... adjustingFocus=..." telemetry
// (see startTelemetryTimer) into structured session context -- what device/lens/format this
// specific recording actually used, and whether AF/AE were still hunting or had settled. Called
// once when a recording finishes (see use-av-body-tracking.ts's stopRecordingAndAnalyze) so
// this survives past the live session into whatever gets submitted with the set -- previously
// this only ever existed as scrollback in the (now-removed) diagnostic overlay.
export type CaptureDeviceInfo = {
  deviceModel: string | null;
  systemVersion: string | null;
  lens: string | null;
  activeFormat: string | null;
  focusMode: string | null;
  exposureMode: string | null;
  aiPipeline: string;
  focusSettled: boolean | null;
  exposureSettled: boolean | null;
  telemetrySamples: number;
  adjustingFocusSampleCount: number;
  adjustingExposureSampleCount: number;
};

const FOCUS_EXPOSURE_MODE_LABELS: Record<string, string> = {
  "0": "locked",
  "1": "one-shot (auto)",
  "2": "continuous",
};

export function extractCaptureDeviceInfo(diagLog: string[]): CaptureDeviceInfo {
  const deviceLine = diagLog.find((l) => l.startsWith("device model="));
  const deviceModel = deviceLine?.match(/device model=(\S+)/)?.[1] ?? null;
  const systemVersion = deviceLine?.match(/systemVersion=(\S+)/)?.[1] ?? null;

  const lensLine = diagLog.find((l) => l.startsWith("using lens:"));
  const lens = lensLine?.match(/using lens:\s*(\S+)/)?.[1] ?? null;

  const formatLine = diagLog.find((l) => l.startsWith("activeFormat set:"));
  const activeFormat = formatLine ? formatLine.replace("activeFormat set:", "").trim() : null;

  const modeLine = diagLog.find((l) => l.startsWith("focus/exposure mode set:"));
  const modeNums = modeLine?.match(/focus=(\d+) exposure=(\d+)/);
  const focusMode = modeNums ? (FOCUS_EXPOSURE_MODE_LABELS[modeNums[1]] ?? modeNums[1]) : null;
  const exposureMode = modeNums ? (FOCUS_EXPOSURE_MODE_LABELS[modeNums[2]] ?? modeNums[2]) : null;

  const camLines = diagLog.filter((l) => l.startsWith("cam:"));
  const adjustingFocusSampleCount = camLines.filter((l) => l.includes("adjustingFocus=true")).length;
  const adjustingExposureSampleCount = camLines.filter((l) => l.includes("adjustingExposure=true")).length;
  const lastCamLine = camLines[camLines.length - 1];
  const focusSettled = lastCamLine ? !lastCamLine.includes("adjustingFocus=true") : null;
  const exposureSettled = lastCamLine ? !lastCamLine.includes("adjustingExposure=true") : null;

  return {
    deviceModel,
    systemVersion,
    lens,
    activeFormat,
    focusMode,
    exposureMode,
    aiPipeline: "Apple Vision framework (on-device VNDetectHumanBodyPoseRequest) -- no cloud AI involved",
    focusSettled,
    exposureSettled,
    telemetrySamples: camLines.length,
    adjustingFocusSampleCount,
    adjustingExposureSampleCount,
  };
}

export function onAvSessionError(callback: (message: string) => void): () => void {
  let handle: { remove: () => void } | null = null;
  let cancelled = false;
  AvBodyTracking.addListener("sessionError", (err) => callback(err.message)).then((h) => {
    if (cancelled) {
      h.remove();
      return;
    }
    handle = h;
  });
  return () => {
    cancelled = true;
    handle?.remove();
  };
}
