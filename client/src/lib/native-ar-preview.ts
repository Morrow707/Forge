import { registerPlugin } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";

// JS side of ios/App/App/ArCameraPreviewPlugin.swift -- see its own comment
// for why this exists as a separate native camera view rather than feeding
// into the existing getUserMedia <video> element. Step one only: proves the
// live ARKit passthrough preview itself renders correctly positioned behind
// the WebView. No skeleton/joint data yet.
interface ArCameraPreviewPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  start(rect: PreviewRect): Promise<void>;
  stop(): Promise<void>;
  updateRect(rect: PreviewRect): Promise<void>;
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
