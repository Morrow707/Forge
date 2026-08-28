import { registerPlugin } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import { Filesystem } from "@capacitor/filesystem";

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
// frameWidth/frameHeight are the UPRIGHT (already orientation-corrected) pixel dimensions
// Vision measured joints against -- see AvBodyTrackingPlugin.swift's own comment on why this
// isn't just the raw buffer's native width/height, and vision-body-landmarks.ts for why the
// bridge needs real pixel dimensions (not just normalized 0-1 values) at all.
export type PoseFrame = {
  frameIndex: number;
  timestamp: number;
  tracked: boolean;
  joints: PoseJoint[];
  frameWidth: number;
  frameHeight: number;
};

interface AvBodyTrackingPlugin {
  isSupported(): Promise<{
    supported: boolean;
    cameraPermission: "authorized" | "denied" | "restricted" | "notDetermined" | "unknown";
  }>;
  requestCameraPermission(): Promise<{ granted: boolean }>;
  start(options: PreviewRect & { lens?: string }): Promise<void>;
  stop(): Promise<void>;
  updateRect(rect: PreviewRect): Promise<void>;
  listLenses(): Promise<{ lenses: LensInfo[] }>;
  selectLens(options: { lens: string }): Promise<void>;
  setZoom(options: { factor: number }): Promise<{ appliedFactor: number }>;
  setFocusPoint(options: { x: number; y: number }): Promise<void>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<{ path: string }>;
  deleteRecording(options: { path: string }): Promise<void>;
  analyzeRecording(options: { path: string; sampleEveryNthFrame?: number }): Promise<{
    frameCount: number;
    trackedFrameCount: number;
    elapsedSeconds: number;
  }>;
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

export async function startAvPreview(rect: PreviewRect, lens?: string): Promise<void> {
  await AvBodyTracking.start({ ...plainRect(rect), lens });
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
export async function stopAvRecording(): Promise<{ blob: Blob; path: string }> {
  const { path } = await AvBodyTracking.stopRecording();
  const { data } = await Filesystem.readFile({ path });
  const binary = atob(data as string);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { blob: new Blob([bytes], { type: "video/quicktime" }), path };
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
export async function analyzeAvRecording(
  path: string,
  sampleEveryNthFrame?: number,
): Promise<{ frameCount: number; trackedFrameCount: number; elapsedSeconds: number }> {
  return AvBodyTracking.analyzeRecording({ path, sampleEveryNthFrame });
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
