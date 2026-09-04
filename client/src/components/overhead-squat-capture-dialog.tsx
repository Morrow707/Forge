import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ensureCameraPermission } from "@/lib/native-camera";
import { getPoseLandmarker, isFullBodyInFrame, type PoseFrame } from "@/lib/pose-tracking";
import { assessOverheadSquat, type OverheadSquatAssessment } from "@/lib/movement-screen-vision";
import { Camera, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { WebCameraChrome } from "@/components/web-camera-chrome";

const RECORD_MS = 4000;

/** Live-camera capture for the Overhead Squat screen test -- records a few
 * seconds of the rep, runs it through the same knee-angle/valgus/torso-lean
 * checks the app already applies to real tracked lifts (see
 * movement-screen-vision.ts), and suggests a 0-3 grade. Always a suggestion:
 * the coach sees exactly what was detected and can accept it, or just close
 * this and type a number by hand -- nothing here saves on its own. */
export function OverheadSquatCaptureDialog({
  open,
  onOpenChange,
  onUseGrade,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUseGrade: (grade: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraChromeContainerRef = useRef<HTMLDivElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const framesRef = useRef<PoseFrame[]>([]);
  const recordingRef = useRef(false);
  const recordStartRef = useRef(0);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [poseVisible, setPoseVisible] = useState(false);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<OverheadSquatAssessment | null>(null);

  useEffect(() => {
    if (!open) return;
    setCameraError(null);
    setModelLoading(true);
    setPoseVisible(false);
    setRecording(false);
    setProgress(0);
    setResult(null);
    framesRef.current = [];
    recordingRef.current = false;

    let stopped = false;

    getPoseLandmarker()
      .then((landmarker) => {
        if (stopped) return;
        landmarkerRef.current = landmarker;
        setModelLoading(false);
      })
      .catch(() => {
        if (!stopped) {
          setCameraError("Couldn't load the pose-tracking model -- check your connection and retry.");
          setModelLoading(false);
        }
      });

    ensureCameraPermission().then((granted) => {
      if (stopped) return;
      if (!granted) {
        setCameraError("Camera access denied -- enable it for Forge in Settings.");
        return;
      }
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 720 }, height: { ideal: 1280 } } })
        .then((stream) => {
          if (stopped) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          videoTrackRef.current = stream.getVideoTracks()[0] ?? null;
          if (videoRef.current) videoRef.current.srcObject = stream;
        })
        .catch(() => setCameraError("Camera access denied or unavailable."));
    });

    let lastVideoTime = -1;
    const tick = () => {
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const now = performance.now();
        const detection = landmarker.detectForVideo(video, now);
        const landmarks = detection.landmarks[0] ?? null;
        const worldLandmarks = landmarks ? detection.worldLandmarks[0] ?? null : null;
        setPoseVisible(!!landmarks && isFullBodyInFrame(landmarks));

        if (recordingRef.current && landmarks && worldLandmarks) {
          framesRef.current.push({ t: now, landmarks, worldLandmarks });
          const elapsed = now - recordStartRef.current;
          setProgress(Math.min(1, elapsed / RECORD_MS));
          if (elapsed >= RECORD_MS) {
            recordingRef.current = false;
            setRecording(false);
            setResult(assessOverheadSquat(framesRef.current));
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      videoTrackRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [open]);

  function startRecording() {
    framesRef.current = [];
    recordStartRef.current = performance.now();
    recordingRef.current = true;
    setRecording(true);
    setProgress(0);
    setResult(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Camera-Assisted Overhead Squat
          </DialogTitle>
          <DialogDescription>
            Stand where your whole body is in frame, arms overhead, then record one rep. This is an estimate from a
            2D camera view -- review the suggested grade before using it.
          </DialogDescription>
        </DialogHeader>

        <div ref={cameraChromeContainerRef} className="relative overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="aspect-[9/16] w-full object-cover" />
          <WebCameraChrome containerRef={cameraChromeContainerRef} videoTrackRef={videoTrackRef} active={open && !modelLoading && !cameraError} />
          {(modelLoading || cameraError) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4 text-center text-sm text-white">
              {cameraError ?? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading camera and pose model...
                </span>
              )}
            </div>
          )}
          {!modelLoading && !cameraError && (
            <div className="absolute left-2 top-2">
              <Badge variant={poseVisible ? "default" : "outline"} className="flex items-center gap-1 bg-black/60 text-white">
                {poseVisible ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {poseVisible ? "Full body in frame" : "Step back until your whole body is visible"}
              </Badge>
            </div>
          )}
          {recording && (
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>

        {!result ? (
          <Button type="button" onClick={startRecording} disabled={!poseVisible || recording || !!cameraError}>
            {recording ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {recording ? "Recording..." : "Record Rep"}
          </Button>
        ) : (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Suggested grade</p>
              <Badge variant={result.suggestedGrade >= 2 ? "default" : "destructive"} className="text-base">
                {result.suggestedGrade}/3
              </Badge>
            </div>
            {result.faults.length > 0 ? (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {result.faults.map((f) => (
                  <li key={f.code}>&bull; {f.label}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No compensations detected.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={startRecording}>
                Retry
              </Button>
              <Button type="button" size="sm" onClick={() => onUseGrade(result.suggestedGrade)}>
                Use This Grade
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
