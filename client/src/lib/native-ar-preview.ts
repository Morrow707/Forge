import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";

// JS side of ios/App/App/ArCameraPreviewPlugin.swift -- see its own comment
// for why this exists as a separate native camera view rather than feeding
// into the existing getUserMedia <video> element, and for what the emitted
// joints actually are (ARKit body-tracking joints, real-world meters,
// composed from bodyAnchor.transform + skeleton.jointModelTransforms).
export type BodyTrackingJoint = { name: string; x: number; y: number; z: number };

export type BodyTrackingFrame =
  | { tracked: false }
  | {
      tracked: true;
      timestamp: number;
      estimatedScaleFactor: number;
      distanceMeters: number;
      joints: BodyTrackingJoint[];
    };

interface ArCameraPreviewPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  start(rect: PreviewRect): Promise<void>;
  stop(): Promise<void>;
  updateRect(rect: PreviewRect): Promise<void>;
  addListener(
    eventName: "bodyTracking",
    listenerFunc: (frame: BodyTrackingFrame) => void,
  ): Promise<PluginListenerHandle>;
}

type PreviewRect = { x: number; y: number; width: number; height: number };

const ArCameraPreview = registerPlugin<ArCameraPreviewPlugin>("ArCameraPreview");

export function isArPreviewPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function isArBodyTrackingSupported(): Promise<boolean> {
  if (!isArPreviewPlatform()) return false;
  try {
    const { supported } = await ArCameraPreview.isSupported();
    return supported;
  } catch {
    return false;
  }
}

// rect is the target DOM element's on-screen box in CSS points (not device
// pixels -- UIKit views are sized in points, same unit getBoundingClientRect
// already reports), so callers can pass an element's own
// getBoundingClientRect() straight through.
export async function startArPreview(rect: PreviewRect): Promise<void> {
  await ArCameraPreview.start(rect);
}

export async function stopArPreview(): Promise<void> {
  await ArCameraPreview.stop();
}

export async function updateArPreviewRect(rect: PreviewRect): Promise<void> {
  await ArCameraPreview.updateRect(rect);
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
