import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Camera, CheckCircle2, Circle, Loader2, X } from "lucide-react";
import { useArBodyTracking } from "@/lib/use-ar-body-tracking";
import { arJointsToWorldLandmarks } from "@/lib/ar-body-landmarks";
import { assessOverheadSquat, type OverheadSquatAssessment } from "@/lib/movement-screen-vision";
import type { PoseFrame } from "@/lib/pose-tracking";

const RECORD_MS = 4000;

/** ARKit-native twin of overhead-squat-capture-dialog.tsx -- records the
 * same 4-second window and runs it through the exact same
 * assessOverheadSquat scoring, just sourced from ARKit's real world-space
 * joints instead of MediaPipe. assessOverheadSquat's valgus/torso-lean
 * checks were already rewritten to use world-space 3D distances (see its
 * own comment in movement-screen-vision.ts) specifically so this dialog
 * could reuse it unmodified. */
export function ArOverheadSquatCaptureDialog({
  open,
  onOpenChange,
  onUseGrade,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUseGrade: (grade: number) => void;
}) {
  const { containerRef, frame, error, supported, supportError, cameraPermission, diagLog } = useArBodyTracking(open);
  const framesRef = useRef<PoseFrame[]>([]);
  const recordingRef = useRef(false);
  const recordStartRef = useRef(0);

  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<OverheadSquatAssessment | null>(null);

  useEffect(() => {
    if (!open) return;
    setRecording(false);
    setProgress(0);
    setResult(null);
    framesRef.current = [];
    recordingRef.current = false;
  }, [open]);

  useEffect(() => {
    if (!frame || !frame.tracked || !recordingRef.current) return;
    const worldLm = arJointsToWorldLandmarks(frame.joints);
    framesRef.current.push({ t: frame.timestamp, landmarks: [], worldLandmarks: worldLm });
    const elapsed = frame.timestamp - recordStartRef.current;
    setProgress(Math.min(1, elapsed / RECORD_MS));
    if (elapsed >= RECORD_MS) {
      recordingRef.current = false;
      setRecording(false);
      setResult(assessOverheadSquat(framesRef.current));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  function startRecording() {
    framesRef.current = [];
    recordStartRef.current = frame?.tracked ? frame.timestamp : 0;
    recordingRef.current = true;
    setRecording(true);
    setProgress(0);
    setResult(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-transparent backdrop-blur-none"
        className="inset-0 top-0 left-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-transparent backdrop-blur-none p-0 overflow-hidden [&>button]:hidden"
      >
        <div className="relative flex h-full w-full flex-col">
          <div ref={containerRef} className="relative flex-1" style={{ background: "transparent" }}>
            <button
              type="button"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="absolute left-3 right-16 top-[max(0.75rem,env(safe-area-inset-top))] z-10 select-text space-y-0.5 rounded-md bg-black/60 px-2 py-1.5 font-mono text-[9px] leading-tight text-white/80 backdrop-blur-sm">
              <div>
                supported={String(supported)} perm={cameraPermission ?? "?"} tracked=
                {String(frame?.tracked ?? false)}
              </div>
              {diagLog.map((line, i) => (
                <div key={i} className="text-white/60">
                  {line}
                </div>
              ))}
            </div>

            {!result && (
              <div className="absolute left-2 top-14">
                <Badge
                  variant={frame?.tracked ? "default" : "outline"}
                  className="flex items-center gap-1 bg-black/60 text-white"
                >
                  {frame?.tracked ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                  {frame?.tracked ? "Body tracked" : "Step back until ARKit locks onto your whole body"}
                </Badge>
              </div>
            )}

            {recording && (
              <div className="absolute bottom-24 left-0 right-0 h-1.5 bg-white/20">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress * 100}%` }} />
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
                  ARKit tracking isn't supported on this device.
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

          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 bg-black/70 px-3 py-4 backdrop-blur-sm">
            {!result ? (
              <Button
                size="lg"
                onClick={startRecording}
                disabled={!frame?.tracked || recording || !!error || supported === false}
              >
                {recording ? <Loader2 className="h-4 w-4 animate-spin" /> : <Circle className="h-4 w-4 fill-current" />}
                {recording ? "Recording..." : "Record Rep"}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={startRecording}>
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
