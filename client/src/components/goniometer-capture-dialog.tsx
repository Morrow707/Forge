import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ensureCameraPermission } from "@/lib/native-camera";
import { getPoseLandmarker } from "@/lib/pose-tracking";
import { MEASURABLE_JOINTS, measureJoint } from "@/lib/joint-angles";
import { cameraGoniometerJointFor, convertCameraAngle } from "@/lib/movement-screen-vision";
import { Camera, Loader2, Check } from "lucide-react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";

/** Live-camera angle readout for the goniometer -- reuses joint-angles.ts's
 * already-shipped tap-a-joint math (see movement-screen-vision.ts's own
 * comment for exactly which movements this covers and why some don't). The
 * degree number updates live as the athlete holds the position; Capture
 * just locks in whatever's showing at that moment into the goniometer
 * form's own angle field, still editable there before saving. */
export function GoniometerCaptureDialog({
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [liveAngle, setLiveAngle] = useState<number | null>(null);

  const measurableKey = cameraGoniometerJointFor(jointKey);
  const joint = measurableKey ? MEASURABLE_JOINTS.find((j) => j.key === measurableKey) : undefined;

  useEffect(() => {
    if (!open || !joint) return;
    setCameraError(null);
    setModelLoading(true);
    setLiveAngle(null);
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
        const detection = landmarker.detectForVideo(video, performance.now());
        const landmarks = detection.landmarks[0];
        const worldLandmarks = detection.worldLandmarks[0];
        const measured = landmarks && worldLandmarks ? measureJoint(landmarks, worldLandmarks, joint) : null;
        setLiveAngle(measured ? convertCameraAngle(jointKey, movementKey, measured.insideDeg) : null);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      stopped = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [open, joint, jointKey, movementKey]);

  if (!joint) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Camera-Assisted Reading
          </DialogTitle>
          <DialogDescription>
            {jointLabel} &middot; {movementLabel}. Hold the end-range position -- this is an estimate from a 2D
            camera view, not a clinical-grade reading. Capture, then adjust the number if it looks off.
          </DialogDescription>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="aspect-[9/16] w-full object-cover" />
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
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 py-3 text-center">
              <span className="font-mono text-3xl font-bold text-white">{liveAngle != null ? `${liveAngle}°` : "--"}</span>
            </div>
          )}
        </div>

        <Button type="button" onClick={() => liveAngle != null && onCapture(liveAngle)} disabled={liveAngle == null}>
          <Check className="h-4 w-4" />
          Capture {liveAngle != null ? `${liveAngle}°` : ""}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
