import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, X } from "lucide-react";
import { useAvBodyTracking } from "@/lib/use-av-body-tracking";
import { AvCameraChrome } from "@/components/av-camera-chrome";
import { visionJointsToWorldLandmarks } from "@/lib/vision-body-landmarks";
import { MEASURABLE_JOINTS, measureJoint } from "@/lib/joint-angles";
import { cameraGoniometerJointFor, convertCameraAngle } from "@/lib/movement-screen-vision";

// This pipeline only ever runs Vision against a finished recording, never a live feed (see
// use-av-body-tracking.ts's own comment on why -- avoiding the thermal throttling live 60fps ML
// inference caused on older devices, the same problem that motivated retiring the ARKit path
// entirely). So unlike the MediaPipe and old-ARKit twins of this dialog (both a live per-frame
// angle readout), the athlete holds the end-range position through one short fixed-length
// recording and the angle comes back a moment later -- the median reading across every frame
// Vision could measure in that window, which is more robust to a single bad frame than either
// "the last frame" or a live number would be anyway.
const RECORD_MS = 1500;

/** AV/Vision twin of goniometer-capture-dialog.tsx -- same Capture flow and the exact same
 * shared angle math (measureJoint's null-2D-landmarks bridge, see its own comment in
 * joint-angles.ts, and the GONIOMETER_JOINTS conversion table), just sourced from a batch of
 * Vision-analyzed frames instead of a live MediaPipe or ARKit stream. */
export function AvGoniometerCaptureDialog({
  open,
  onOpenChange,
  jointKey,
  movementKey,
  jointLabel,
  movementLabel,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jointKey: string;
  movementKey: string;
  jointLabel: string;
  movementLabel: string;
  onCapture: (angleDeg: number) => void;
}) {
  const {
    containerRef,
    error,
    supported,
    supportError,
    cameraPermission,
    diagLog,
    recording,
    analyzing,
    startRecording,
    cancelRecording,
    stopRecordingAndAnalyze,
  } = useAvBodyTracking(open);

  const [capturedAngle, setCapturedAngle] = useState<number | null>(null);
  const [noReading, setNoReading] = useState(false);
  const recordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measurableKey = cameraGoniometerJointFor(jointKey);
  const joint = measurableKey ? MEASURABLE_JOINTS.find((j) => j.key === measurableKey) : undefined;

  useEffect(() => {
    if (!open) {
      if (recordTimeoutRef.current) clearTimeout(recordTimeoutRef.current);
      setCapturedAngle(null);
      setNoReading(false);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (recordTimeoutRef.current) clearTimeout(recordTimeoutRef.current);
    };
  }, []);

  function recordAndMeasure() {
    if (!joint) return;
    setCapturedAngle(null);
    setNoReading(false);
    startRecording();
    recordTimeoutRef.current = setTimeout(() => void finishRecording(), RECORD_MS);
  }

  async function finishRecording() {
    if (recordTimeoutRef.current) clearTimeout(recordTimeoutRef.current);
    if (!joint) return;
    const result = await stopRecordingAndAnalyze();
    if (!result) return;
    const angles: number[] = [];
    for (const frame of result.rawFrames) {
      const worldLm = visionJointsToWorldLandmarks(frame);
      const measured = measureJoint(null, worldLm, joint);
      const converted = measured ? convertCameraAngle(jointKey, movementKey, measured.insideDeg) : null;
      if (converted != null) angles.push(converted);
    }
    if (angles.length === 0) {
      setNoReading(true);
      return;
    }
    // Median, not mean -- same outlier-robustness reasoning as every other median use in this
    // pipeline (see e.g. AvBodyTrackingPlugin.swift's own boxTopNormalizedY comment): a frame or
    // two where the joint's briefly occluded shouldn't drag the reading toward a wrong number.
    angles.sort((a, b) => a - b);
    const mid = Math.floor(angles.length / 2);
    const median = angles.length % 2 === 0 ? (angles[mid - 1] + angles[mid]) / 2 : angles[mid];
    setCapturedAngle(Math.round(median));
  }

  function closeDialog() {
    if (recordTimeoutRef.current) clearTimeout(recordTimeoutRef.current);
    if (analyzing) {
      // No cancelAnalysis in flight to await -- the hook's own guard makes a stray second call
      // harmless, and this dialog doesn't keep the result around long enough to need it.
    } else if (recording) {
      void cancelRecording();
    }
    onOpenChange(false);
  }

  if (!joint) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-transparent backdrop-blur-none"
        className="inset-0 top-0 left-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-transparent backdrop-blur-none p-0 overflow-hidden [&>button]:hidden"
      >
        <div className="relative h-full w-full">
          <div ref={containerRef} className="absolute inset-0" style={{ background: "transparent" }}>
            <AvCameraChrome containerRef={containerRef} active={open} />
            <button
              type="button"
              aria-label="Close"
              onClick={closeDialog}
              className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="absolute left-3 right-16 top-[max(0.75rem,env(safe-area-inset-top))] z-10 select-text space-y-0.5 rounded-md bg-black/60 px-2 py-1.5 font-mono text-[9px] leading-tight text-white/80 backdrop-blur-sm">
              <div>
                supported={String(supported)} perm={cameraPermission ?? "?"} recording={String(recording)}
              </div>
              {diagLog.map((line, i) => (
                <div key={i} className="text-white/60">
                  {line}
                </div>
              ))}
            </div>

            <div className="absolute inset-x-4 top-14 rounded-md bg-black/60 px-3 py-2 text-center text-xs text-white backdrop-blur-sm">
              {jointLabel} &middot; {movementLabel} -- hold the end-range position, then tap Record. An estimate,
              not a clinical-grade reading; adjust the number if it looks off.
            </div>

            {recording && (
              <div className="absolute inset-x-8 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2 rounded-md bg-black/60 px-3 py-3 text-center text-white backdrop-blur-sm">
                <span className="text-sm font-semibold">Hold still...</span>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full bg-primary transition-[width] ease-linear"
                    style={{ width: "100%", transitionDuration: `${RECORD_MS}ms` }}
                  />
                </div>
              </div>
            )}

            {analyzing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                <p className="text-sm text-white">Measuring angle...</p>
              </div>
            )}

            {noReading && !recording && !analyzing && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-sm text-white">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Couldn't get a clear reading -- make sure the joint stays fully in frame and try again.
              </div>
            )}

            {error && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-sm text-white">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {supported === false && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-sm text-white">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Camera tracking isn't supported on this device.
                </div>
                {supportError && (
                  <p className="select-text break-all text-center text-xs opacity-90">{supportError}</p>
                )}
              </div>
            )}

            {capturedAngle != null && !recording && !analyzing && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 py-3 text-center">
                <span className="font-mono text-3xl font-bold text-white">{capturedAngle}°</span>
              </div>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
            {capturedAngle != null ? (
              <>
                <Button variant="outline" onClick={recordAndMeasure} disabled={recording || analyzing}>
                  Retry
                </Button>
                <Button size="lg" onClick={() => onCapture(capturedAngle)}>
                  <Check className="h-4 w-4" />
                  Capture {capturedAngle}°
                </Button>
              </>
            ) : (
              <Button
                size="lg"
                onClick={recordAndMeasure}
                disabled={recording || analyzing || !!error || supported === false}
              >
                {recording ? "Recording..." : analyzing ? "Measuring..." : "Record"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
