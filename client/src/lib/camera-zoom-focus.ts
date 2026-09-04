// Chrome/Android's Image Capture API extensions expose zoom/focusMode/pointsOfInterest on a
// getUserMedia video track's capabilities -- the web-platform counterpart to
// AvBodyTrackingPlugin.swift's native setZoom/setFocusPoint (see av-camera-chrome.tsx), giving
// the Android/MediaPipe tracker dialogs the same pinch-to-zoom and tap-to-focus gestures iOS
// already has. No other browser currently implements them (iOS Safari, desktop Chrome/Safari/
// Firefox all lack support -- same landscape as camera-exposure.ts's own exposureMode/
// exposureTime), so every function here is best-effort and silently no-ops everywhere else,
// exactly like that file's own lockCameraExposure. Never something camera setup should wait on,
// block, or surface an error for -- a missed zoom/focus call just leaves the shot as it was.
//
// There's no web equivalent of AVFoundation's physical-lens switching (ultra-wide/wide/
// telephoto) -- getUserMedia has no concept of multiple physical cameras behind one "environment"
// facingMode the way AVCaptureDevice does, so that half of AvCameraChrome's UI has nothing to
// port here. Pinch-to-zoom digitally zooms within whatever single camera got negotiated.
//
// zoom/focusMode/pointsOfInterest aren't part of TypeScript's bundled DOM lib (same reasoning as
// camera-exposure.ts's own local augmentation) -- still experimental extensions, not the stable
// spec.
export type ZoomFocusCapabilities = MediaTrackCapabilities & {
  zoom?: { min: number; max: number; step?: number };
  focusMode?: string[];
};

type ZoomFocusConstraintSet = MediaTrackConstraintSet & {
  zoom?: number;
  focusMode?: string;
  pointsOfInterest?: { x: number; y: number }[];
};

// Read fresh every call, deliberately -- a caller holds a ref to the track (not a captured
// value) specifically because the live track can be swapped out from under it (stream
// reacquisition after the app backgrounds and comes back, same as camera-exposure.ts's own
// lockCameraExposure gets re-run against a fresh track each time attachStream runs). Returns
// null when the browser doesn't support getCapabilities at all or the track has no zoom range,
// so callers can gate UI (e.g. only show a zoom readout once this returns non-null).
export function getZoomCapabilities(track: MediaStreamTrack | null | undefined): { min: number; max: number } | null {
  if (!track || typeof track.getCapabilities !== "function") return null;
  try {
    const capabilities = track.getCapabilities() as ZoomFocusCapabilities;
    if (!capabilities.zoom) return null;
    return { min: capabilities.zoom.min, max: capabilities.zoom.max };
  } catch {
    return null;
  }
}

// Best-effort digital zoom -- clamps to the track's own reported range so a caller's pinch math
// (which can overshoot past 1:1 finger-distance-ratio scaling) never gets rejected outright for
// being out of bounds. Returns the factor actually applied (clamped), or null if the call
// couldn't land at all (unsupported track/browser, or the device rejected it) -- same
// "nothing to show the athlete for a single missed zoom tick" tolerance av-camera-chrome.tsx's
// own applyZoom has for its native equivalent.
export async function applyCameraZoom(track: MediaStreamTrack | null | undefined, factor: number): Promise<number | null> {
  const range = getZoomCapabilities(track);
  if (!track || !range) return null;
  const clamped = Math.min(range.max, Math.max(range.min, factor));
  try {
    await track.applyConstraints({ advanced: [{ zoom: clamped } as ZoomFocusConstraintSet] });
    return clamped;
  } catch {
    return null;
  }
}

// Best-effort tap-to-focus at a normalized (0-1, top-left origin -- same convention every other
// tap-point coordinate in this codebase already uses) point. "single-shot" (focus once at the
// point, then hold) is preferred over "continuous" for the same reason AvBodyTrackingPlugin's
// own tap-to-focus is a one-time expose/focus action, not a standing autofocus region -- an
// athlete tapping to focus on the bar mid-set doesn't want the camera hunting for new focus
// every subsequent frame. Falls back to "continuous" only when the device doesn't offer
// "single-shot" at all, rather than doing nothing. No-ops entirely (never throws) on any
// unsupported device/browser or camera not yet started, same convention as every other function
// in this file.
export async function applyCameraFocusPoint(track: MediaStreamTrack | null | undefined, x: number, y: number): Promise<void> {
  if (!track || typeof track.getCapabilities !== "function") return;
  try {
    const capabilities = track.getCapabilities() as ZoomFocusCapabilities;
    const modes = capabilities.focusMode;
    if (!modes || (!modes.includes("single-shot") && !modes.includes("continuous"))) return;
    const focusMode = modes.includes("single-shot") ? "single-shot" : "continuous";
    await track.applyConstraints({
      advanced: [{ focusMode, pointsOfInterest: [{ x, y }] } as ZoomFocusConstraintSet],
    });
  } catch {
    // Unsupported device/browser, or the camera rejected the constraint -- the caller's own tap
    // ring still shows for visual feedback even when the underlying call couldn't land.
  }
}
