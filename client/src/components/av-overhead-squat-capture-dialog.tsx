import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Camera, Circle, Loader2, X } from "lucide-react";
import { useAvBodyTracking } from "@/lib/use-av-body-tracking";
import { AvCameraChrome } from "@/components/av-camera-chrome";
import { visionJointsToWorldLandmarks, visionBody3DToWorldLandmarks } from "@/lib/vision-body-landmarks";
import { assessOverheadSquat, type OverheadSquatAssessment } from "@/lib/movement-screen-vision";
import type { PoseFrame } from "@/lib/pose-tracking";

// Record-first-analyze-later, same as every other dialog on this pipeline (see
// use-av-body-tracking.ts's own comment) -- there's no live per-frame stream to gate a "Record"
// button on full-body visibility the way the MediaPipe/ARKit twins of this dialog do, so this
// just records a fixed window and reports back if Vision couldn't get a clear enough read,
// rather than trying to predict that up front.
const RECORD_MS = 4000;

/** AV/Vision twin of overhead-squat-capture-dialog.tsx -- records the same few-second window and
 * runs it through the exact same assessOverheadSquat scoring (unmodified -- see that function's
 * own comment on why it already works off any consistent-units, consistent-sign-convention
 * worldLandmarks, not specifically ARKit's or MediaPipe's), just sourced from a batch of
 * Vision-analyzed frames instead of a live tracking session. */
export function AvOverheadSquatCaptureDialog({
  open,
  onOpenChange,
  onUseGrade,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUseGrade: (grade: number) => void;
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

  const [result, setResult] = useState<OverheadSquatAssessment | null>(null);
  const [noReading, setNoReading] = useState(false);
  const recordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) {
      if (recordTimeoutRef.current) clearTimeout(recordTimeoutRef.current);
      setResult(null);
      setNoReading(false);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (recordTimeoutRef.current) clearTimeout(recordTimeoutRef.current);
    };
  }, []);

  function startCapture() {
    setResult(null);
    setNoReading(false);
    startRecording();
    recordTimeoutRef.current = setTimeout(() => void finishRecording(), RECORD_MS);
  }

  async function finishRecording() {
    if (recordTimeoutRef.current) clearTimeout(recordTimeoutRef.current);
    const captured = await stopRecordingAndAnalyze();
    if (!captured) return;
    // Phase B: real depth when a frame has it -- see av-bar-tracker-dialog.tsx's own identical
    // comment for the full reasoning. Knee/ankle valgus ratio and torso lean are exactly the
    // kind of metric that's only ever been a flattened 2D approximation on iOS until now.
    const frames: PoseFrame[] = captured.rawFrames.map((frame) => ({
      t: frame.timestamp,
      landmarks: [],
      worldLandmarks: visionBody3DToWorldLandmarks(frame) ?? visionJointsToWorldLandmarks(frame),
    }));
    const assessment = assessOverheadSquat(frames);
    if (!assessment) {
      setNoReading(true);
      return;
    }
    setResult(assessment);
  }

  function closeDialog() {
    if (recordTimeoutRef.current) clearTimeout(recordTimeoutRef.current);
    if (recording) void cancelRecording();
    onOpenChange(false);
  }

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

            {!result && !recording && !analyzing && (
              <div className="absolute inset-x-4 top-14 rounded-md bg-black/60 px-3 py-2 text-center text-xs text-white backdrop-blur-sm">
                Stand where your whole body is in frame, arms overhead, then record one rep.
              </div>
            )}

            {recording && (
              <div className="absolute bottom-24 left-0 right-0 h-1.5 bg-white/20">
                <div
                  className="h-full bg-primary transition-[width] ease-linear"
                  style={{ width: "100%", transitionDuration: `${RECORD_MS}ms` }}
                />
              </div>
            )}

            {analyzing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                <p className="text-sm text-white">Scoring the rep...</p>
              </div>
            )}

            {noReading && !recording && !analyzing && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 flex items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-sm text-white">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Couldn't get a clear enough read -- make sure your whole body stayed in frame and try again.
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

            {result && (
              <div className="absolute inset-x-4 bottom-4 space-y-3 rounded-lg border border-white/20 bg-black/70 p-3 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">Suggested grade</p>
                  <Badge variant={result.suggestedGrade >= 2 ? "default" : "destructive"} className="text-base">
                    {result.suggestedGrade}/3
                  </Badge>
                </div>
                {result.faults.length > 0 ? (
                  <ul className="space-y-1 text-xs text-white/70">
                    {result.faults.map((f) => (
                      <li key={f.code}>&bull; {f.label}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-white/70">No compensations detected.</p>
                )}
              </div>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-center gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
            {!result ? (
              <Button
                size="lg"
                onClick={startCapture}
                disabled={recording || analyzing || !!error || supported === false}
              >
                {recording || analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Circle className="h-4 w-4 fill-current" />}
                {recording ? "Recording..." : analyzing ? "Scoring..." : "Record Rep"}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={startCapture}>
                  Retry
                </Button>
                <Button onClick={() => onUseGrade(result.suggestedGrade)}>
                  <Camera className="h-4 w-4" />
                  Use This Grade
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
