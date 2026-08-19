import { registerPlugin, Capacitor } from "@capacitor/core";

// JS side of ios/App/App/ArMeasurePlugin.swift -- see its own comment for
// the full rationale (LiDAR-only, live-camera-only, why no reference-object
// calibration is needed the way the 2D Ruler tool in
// video-analysis-dialog.tsx needs one).
interface ArMeasurePlugin {
  isSupported(): Promise<{ supported: boolean }>;
  present(): Promise<{ meters?: number }>;
}

const ArMeasure = registerPlugin<ArMeasurePlugin>("ArMeasure");

export function isArMeasurePlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function isArMeasureSupported(): Promise<boolean> {
  if (!isArMeasurePlatform()) return false;
  try {
    const { supported } = await ArMeasure.isSupported();
    return supported;
  } catch {
    return false;
  }
}

// Presents the full-screen native AR measure view. Resolves with the
// measured distance once the coach taps "Use This Measurement", or null if
// they cancel out without completing a measurement.
export async function measureWithAR(): Promise<{ meters: number; feet: number; inches: number } | null> {
  const { meters } = await ArMeasure.present();
  if (typeof meters !== "number") return null;
  const totalInches = meters * 39.3701;
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches - feet * 12;
  return { meters, feet, inches };
}
