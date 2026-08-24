import { Capacitor } from "@capacitor/core";
import { Camera } from "@capacitor/camera";
import { App } from "@capacitor/app";
import { Torch } from "@capawesome/capacitor-torch";

export const isNativePlatform = () => Capacitor.isNativePlatform();

/**
 * On native iOS/Android, a bare getUserMedia() call inside WKWebView /
 * Chrome-for-Android is the wrong place to trigger the FIRST camera
 * permission prompt -- it's unreliable about actually surfacing the
 * system dialog, and if it silently rejects with NotAllowedError there's
 * no OS-level "ask again" affordance the way there is for a permission
 * requested through a real native plugin. Routing the first request
 * through @capacitor/camera (backed by NSCameraUsageDescription on iOS
 * and the CAMERA manifest entry on Android -- see ios/App/App/Info.plist
 * and android/app/src/main/AndroidManifest.xml) gets the real system
 * prompt every time, and getUserMedia then succeeds immediately against
 * the permission it already granted. No-op on web, where getUserMedia
 * handles its own prompt correctly on its own.
 */
export async function ensureCameraPermission(): Promise<boolean> {
  if (!isNativePlatform()) return true;
  try {
    const status = await Camera.checkPermissions();
    if (status.camera === "granted" || status.camera === "limited") return true;
    if (status.camera === "denied") return false;
    const result = await Camera.requestPermissions({ permissions: ["camera"] });
    return result.camera === "granted" || result.camera === "limited";
  } catch {
    // Plugin unavailable for some reason -- don't block camera-tracking
    // entirely on this pre-check, let getUserMedia make its own attempt.
    return true;
  }
}

/**
 * Unified "the app just came back to the foreground" signal for camera
 * streams to reacquire themselves against. The Page Visibility API
 * (`visibilitychange`) is what the PWA has always used and still works
 * fine in a mobile browser tab, but inside Capacitor's native shell it's
 * unreliable -- WKWebView can leave `document.visibilityState` stuck at
 * "visible" through an app-switcher backgrounding that iOS itself used
 * to suspend the camera hardware, so a stream already killed by the OS
 * never gets detected as dead and the tracker is left staring at a
 * frozen frame. @capacitor/app's `appStateChange` is the actual
 * OS-level signal on native and is used there instead; the web/PWA path
 * is untouched.
 */
/**
 * Torch (flashlight) control -- categorically unavailable to a plain
 * getUserMedia() track on iOS. WebKit has never implemented the `torch`
 * MediaTrackConstraint (Chrome/Android has, which is why the plugin's web
 * fallback still works there via applyConstraints), so without this native
 * plugin behind it there's no way to drive the flash from a WKWebView at
 * all -- not a permissions issue, a platform ceiling, same category as the
 * Vibration API gap noted in rest-timer.tsx. isAvailable() reflects that
 * correctly per-browser rather than assuming; the other calls below are
 * wrapped because the plugin throws (not resolves false) when unavailable,
 * so callers can use all three unconditionally without their own try/catch.
 */
export async function isTorchAvailable(): Promise<boolean> {
  try {
    const result = await Torch.isAvailable();
    return result.available;
  } catch {
    return false;
  }
}

/** Toggles the torch against an already-acquired stream (same "reuse the
 * one getUserMedia stream" pattern as the barcode scanner/photo capture
 * callers of this module) and reports the resulting on/off state -- the
 * plugin has no event to subscribe to, so callers track state from this
 * return value rather than polling isEnabled(). Best-effort: a device
 * with no flash, or a front-facing stream, just fails quietly and the
 * caller's UI should already be hidden per isTorchAvailable(). */
export async function toggleTorch(stream: MediaStream): Promise<boolean> {
  try {
    await Torch.toggle({ stream });
    const result = await Torch.isEnabled({ stream });
    return result.enabled;
  } catch {
    return false;
  }
}

/** Best-effort cleanup so backing out of a scanner with the torch on
 * doesn't leave the LED lit -- stopping the stream's tracks would
 * eventually release it too, but that can lag on native, and this is
 * instant. Safe to call even if the torch was never enabled. */
export async function disableTorch(stream: MediaStream): Promise<void> {
  try {
    await Torch.disable({ stream });
  } catch {
    // No torch, no permission, or web with no implementation -- nothing to clean up.
  }
}

export function onAppForeground(callback: () => void): () => void {
  if (isNativePlatform()) {
    let handle: { remove: () => void } | undefined;
    let cancelled = false;
    App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) callback();
    }).then((h) => {
      if (cancelled) h.remove();
      else handle = h;
    });
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }
  const handler = () => {
    if (document.visibilityState === "visible") callback();
  };
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}

/**
 * The background half of onAppForeground's pair -- every camera-tracking
 * dialog already reacquires a fresh stream reactively once the OS gets
 * around to suspending the old one, but that leaves a gap between the
 * athlete backgrounding the app and iOS actually killing the camera:
 * the hardware (and the recording indicator) stays live, any in-progress
 * rAF tracking loop keeps burning CPU, and an active MediaRecorder keeps
 * writing frames nobody will ever see instead of finalizing cleanly.
 * Callers should release/stop all of that themselves the moment this
 * fires rather than wait for the OS, then let their existing
 * onAppForeground handler reacquire on return exactly as it does today.
 */
export function onAppBackground(callback: () => void): () => void {
  if (isNativePlatform()) {
    let handle: { remove: () => void } | undefined;
    let cancelled = false;
    App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) callback();
    }).then((h) => {
      if (cancelled) h.remove();
      else handle = h;
    });
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }
  const handler = () => {
    if (document.visibilityState === "hidden") callback();
  };
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}
