import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import { Filesystem } from "@capacitor/filesystem";

// JS side of ios/App/App/ArCameraPreviewPlugin.swift -- see its own comment
// for why this exists as a separate native camera view rather than feeding
// into the existing getUserMedia <video> element, and for what the emitted
// joints actually are (ARKit body-tracking joints, real-world meters,
// composed from bodyAnchor.transform + skeleton.jointModelTransforms).
export type BodyTrackingJoint = { name: string; x: number; y: number; z: number };

// See ArImplementTracker.swift's own file comment for the algorithm --
// world is the found pixel unprojected onto a plane at the tracked hand's
// own depth (real meters, not a shoulder-width guess), confidence ramps up
// over a few continuously-locked frames the same way jump/lift-mode
// confidence already does, and color is a real RGB sample for
// implement-appearance-memory.ts's existing corroboration feature. Missing
// (not just null) on any frame the tracker has no lock to report --
// ArCameraPreviewPlugin.swift omits the dictionary key entirely rather than
// setting it to a JSON null, so check with `== null`/falsiness, not
// `!== null`.
export type ImplementTrackResult = {
  x: number;
  y: number;
  z: number;
  confidence: number;
  color?: { r: number; g: number; b: number };
};

export type BodyTrackingFrame =
  | { tracked: false }
  | {
      tracked: true;
      timestamp: number;
      estimatedScaleFactor: number;
      distanceMeters: number;
      // Hip root projected into normalized (0-1) on-screen space -- see
      // ArCameraPreviewPlugin.swift's own comment on frame.camera.projectPoint.
      // Only what sprint tracking's screen-space checkpoint-crossing model
      // needs; the real-world 3D joints below are what everything else uses.
      hipScreenX: number;
      hipScreenY: number;
      joints: BodyTrackingJoint[];
      // Only present when startArPreview was called with trackImplement:true
      // (a bar-path/full mode dialog) -- see ArImplementTracker's own file
      // comment. null/missing on a frame with no lock, same as the tracker
      // itself returning null rather than a stale/guessed position.
      leftImplement?: ImplementTrackResult | null;
      rightImplement?: ImplementTrackResult | null;
    };

interface ArCameraPreviewPlugin {
  isSupported(): Promise<{
    supported: boolean;
    cameraPermission: "authorized" | "denied" | "restricted" | "notDetermined" | "unknown";
  }>;
  start(options: PreviewRect & { trackImplement?: boolean }): Promise<void>;
  stop(): Promise<void>;
  updateRect(rect: PreviewRect): Promise<void>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<{ path: string }>;
  resetImplementTracking(): Promise<void>;
  addListener(
    eventName: "bodyTracking",
    listenerFunc: (frame: BodyTrackingFrame) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "sessionError",
    listenerFunc: (error: { message: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "diagnosticLog",
    listenerFunc: (entry: { message: string }) => void,
  ): Promise<PluginListenerHandle>;
}

type PreviewRect = { x: number; y: number; width: number; height: number };

const ArCameraPreview = registerPlugin<ArCameraPreviewPlugin>("ArCameraPreview");

export function isArPreviewPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

// The camera container going transparent only reveals whatever's painted
// BEHIND the dialog in this same page -- which, absent this, is this app's
// own opaque background (body's, and AppShell's root div's), not
// ArCameraPreviewPlugin's native view sitting behind the WKWebView. See
// index.css's html.ar-camera-active rule, which this toggles -- every
// tracker dialog calls this true right alongside startArPreview and false
// in the same cleanup that calls stopArPreview, so the rest of the app
// only ever loses its background for as long as a camera dialog is
// actually open.
export function setArCameraActive(active: boolean): void {
  document.documentElement.classList.toggle("ar-camera-active", active);
}

// A step-by-step execution trace off the native start() call (see
// logDiag in ArCameraPreviewPlugin.swift) -- answers "does start() even
// run to completion, and if not, exactly which line does it stop at"
// directly on the phone screen, since that's the one thing a static
// supported/permission snapshot (isArBodyTrackingSupported) can never
// show: what happens AFTER the call is made, not just its return value.
export function onDiagnosticLog(callback: (message: string) => void): () => void {
  let handle: PluginListenerHandle | null = null;
  let cancelled = false;
  ArCameraPreview.addListener("diagnosticLog", (entry) => callback(entry.message)).then((h) => {
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

// error is populated only on the "the native call itself failed" path (a
// plugin-bridge/dispatch problem), never on "ARKit genuinely isn't
// supported" -- the two look identical to a user (both end up showing the
// same unsupported banner), but only one of them has anything to report,
// and distinguishing them from outside a Mac/Xcode console is otherwise
// impossible. See the callers' own comment on why this gets shown in the
// UI at all instead of just logged.
export async function isArBodyTrackingSupported(): Promise<{
  supported: boolean;
  error?: string;
  cameraPermission?: string;
}> {
  if (!isArPreviewPlatform()) return { supported: false };
  try {
    const { supported, cameraPermission } = await ArCameraPreview.isSupported();
    return { supported, cameraPermission };
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return { supported: false, error: detail };
  }
}

// rect is the target DOM element's on-screen box in CSS points (not device
// pixels -- UIKit views are sized in points, same unit getBoundingClientRect
// already reports), so callers can pass an element's own
// getBoundingClientRect() straight through. trackImplement turns on
// ArImplementTracker for both hands (see its own file comment) -- leave it
// off (the default) for any dialog with nothing held; only a bar-path/full
// mode dialog needs it.
export async function startArPreview(rect: PreviewRect, trackImplement?: boolean): Promise<void> {
  await ArCameraPreview.start({ ...rect, trackImplement });
}

export async function stopArPreview(): Promise<void> {
  await ArCameraPreview.stop();
}

export async function updateArPreviewRect(rect: PreviewRect): Promise<void> {
  await ArCameraPreview.updateRect(rect);
}

// There's no browser MediaStream to hand a MediaRecorder once this plugin
// owns the camera (see ArCameraPreviewPlugin.swift's file-level comment),
// so the clip itself is recorded natively -- see startRecording/
// appendVideoFrame there. This just flips that on.
export async function startArRecording(): Promise<void> {
  await ArCameraPreview.startRecording();
}

// The native side only ever hands back a bare file path (see
// ArCameraPreviewPlugin.swift's own comment on stopRecording) -- this reads
// it off disk as a Blob, immediately ready to attach to a FormData upload
// the same way every other recorded clip in the app already is (see
// form-video-recorder-dialog.tsx's save()).
export async function stopArRecording(): Promise<Blob> {
  const { path } = await ArCameraPreview.stopRecording();
  const { data } = await Filesystem.readFile({ path });
  const binary = atob(data as string);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "video/mp4" });
}

// Clears both hands' held locks -- called at the start of each new set
// within one AR session (a bar-tracker dialog's own startTracking(), same
// call site implement-tracking.ts's own ImplementTracker.reset() already
// runs from), so a lock from the previous set's last rep can't carry into
// the first frame of the next one.
export async function resetArImplementTracking(): Promise<void> {
  await ArCameraPreview.resetImplementTracking();
}

// Rough, uncalibrated thresholds for "can this distance actually produce
// usable full-body tracking" -- not measured against a real device, just a
// reasonable starting guess (a typical phone's field of view needs the
// athlete a few feet back to fit head-to-feet in frame, but too far starts
// losing joint precision). Meant to be tightened once real device testing
// shows what range actually tracks well.
export function framingHint(distanceMeters: number): "too close" | "too far" | "good" {
  if (distanceMeters < 1.5) return "too close";
  if (distanceMeters > 4.5) return "too far";
  return "good";
}

// Subscribes to the raw per-frame body-tracking joints emitted while the AR
// preview is running (see ArCameraPreviewPlugin.swift's own comment -- no
// caller consumes this yet, it's the follow-up once the joint data itself
// is confirmed to look right on a real device). Returns an unsubscribe
// function rather than the raw PluginListenerHandle promise -- guards
// against the caller unsubscribing before the native addListener call
// itself has resolved, same pattern as this app's other async-subscribe
// call sites (e.g. form-video-recorder-dialog.tsx's acquireCamera guard).
export function onBodyTracking(callback: (frame: BodyTrackingFrame) => void): () => void {
  let handle: PluginListenerHandle | null = null;
  let cancelled = false;
  ArCameraPreview.addListener("bodyTracking", callback).then((h) => {
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

// Fires when the native ARSession fails after start() already resolved
// successfully -- see ArCameraPreviewPlugin.swift's own comment on
// session(_:didFailWithError:) for why this had to become its own event
// rather than a third BodyTrackingFrame shape. Every tracker dialog wires
// this straight into the same red error banner startArPreview's own
// rejection already shows, since both mean the same thing to a user: the
// camera never came up.
export function onSessionError(callback: (message: string) => void): () => void {
  let handle: PluginListenerHandle | null = null;
  let cancelled = false;
  ArCameraPreview.addListener("sessionError", (err) => callback(err.message)).then((h) => {
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
