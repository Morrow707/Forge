// Locks camera exposure/shutter speed short and fixed instead of leaving
// auto-exposure free to lengthen the shutter under normal gym lighting --
// auto-exposure has no idea a rep or jump is about to move fast, so a
// perfectly reasonable exposure for a controlled tempo lift blurs a fast
// concentric or a jump landing far more than the same scene would with a
// deliberately short, fixed shutter.
//
// Chrome/Android's Image Capture API extensions expose exposureMode/
// exposureTime on a getUserMedia video track's capabilities; no other
// browser currently implements them (iOS Safari, desktop Chrome/Safari/
// Firefox all lack support), so this is a best-effort enhancement that
// silently no-ops everywhere else -- never something camera setup should
// wait on, block, or surface an error for.
//
// exposureMode/exposureTime aren't part of TypeScript's bundled DOM lib
// (still an experimental extension, not the stable spec), hence the local
// type augmentation below rather than relying on lib.dom.d.ts.
type ExposureCapabilities = MediaTrackCapabilities & {
  exposureMode?: string[];
  exposureTime?: { min: number; max: number; step?: number };
};

type ExposureConstraintSet = MediaTrackConstraintSet & {
  exposureMode?: string;
  exposureTime?: number;
};

export async function lockCameraExposure(track: MediaStreamTrack): Promise<void> {
  try {
    if (typeof track.getCapabilities !== "function") return;
    const capabilities = track.getCapabilities() as ExposureCapabilities;
    if (!capabilities.exposureMode?.includes("manual") || !capabilities.exposureTime) return;

    // A short-but-not-minimum exposure: the device's true minimum can
    // under-expose ordinary gym lighting into an unreadable image, but
    // auto-exposure's own default tends to run far longer than a fast rep
    // or jump can tolerate -- splitting the difference keeps the frame
    // bright enough to still track while cutting blur meaningfully.
    const { min, max } = capabilities.exposureTime;
    const exposureTime = Math.round(min + (max - min) * 0.15);

    await track.applyConstraints({
      advanced: [{ exposureMode: "manual", exposureTime } as ExposureConstraintSet],
    });
  } catch {
    // Unsupported device/browser, or the camera rejected the constraint --
    // either way, tracking continues on whatever exposure auto-exposure
    // already picked, exactly as before this existed.
  }
}
