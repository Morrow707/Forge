import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { apiRequest, getJson } from "@/lib/queryClient";
import { getPoseLandmarker, isPlausibleHumanFrame, MIN_VISIBILITY } from "@/lib/pose-tracking";
import { lockCameraExposure } from "@/lib/camera-exposure";
import { ensureCameraPermission, onAppForeground } from "@/lib/native-camera";
import {
  analyzeMechanics,
  detectMechanicsFaults,
  type MechanicsCameraAngle,
  type MechanicsMode,
  type MechanicsResult,
  type MechanicsFault,
} from "@/lib/mechanics-tracking";
import {
  DEFAULT_SKILL_FAULT_THRESHOLDS,
  type SkillFaultThresholds,
} from "@shared/skill-fault-thresholds";
import { PoseLandmarker, type NormalizedLandmark, type Landmark } from "@mediapipe/tasks-vision";
import { toast } from "sonner";
import { AlertTriangle, Play, Square, RotateCcw, Check, Activity, Eye, EyeOff } from "lucide-react";
import { SuggestedCorrective } from "@/components/suggested-corrective";
import { recordedVideoType, videoFilenameForBlob } from "@/lib/video-recording";

type Step = "warning" | "capture" | "review";

const SKELETON_COLOR = "#2dd4bf";

function drawSkeleton(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], width: number, height: number) {
  ctx.strokeStyle = SKELETON_COLOR;
  ctx.lineWidth = 3;
  ctx.fillStyle = SKELETON_COLOR;
  for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!a || !b || a.visibility < MIN_VISIBILITY || b.visibility < MIN_VISIBILITY) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }
  for (const lm of landmarks) {
    if (lm.visibility < MIN_VISIBILITY) continue;
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

type CapturedFrame = { t: number; landmarks: NormalizedLandmark[]; worldLandmarks: Landmark[] };

/** Camera-tracked swing/throw mechanics for a skill drill -- see
 * client/src/lib/mechanics-tracking.ts for what's actually measured (body
 * mechanics only, no bat/ball speed). Like the sprint tracker, every
 * capture starts with a mandatory camera-angle warning: face-on and
 * down-the-line each only unlock their own half of the metrics (weight
 * transfer/hip rotation vs. separation/sequencing/arm slot), so picking the
 * wrong one silently produces no feedback on the other half. The recorded
 * video is opt-in, off by default: it stays in the browser purely so this
 * dialog's own review step can scrub through it with a toggleable skeleton
 * overlay, and is discarded the moment the dialog closes unless the athlete
 * explicitly checks "save clip for coach" (see save()), the same opt-in
 * privacy story sprint-tracker-dialog.tsx now follows too. */
export function MechanicsTrackerDialog({
  open,
  onOpenChange,
  drillName,
  mode,
  skillAssignmentId,
  skillProgramDayId,
  skillProgramExerciseId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drillName: string;
  mode: MechanicsMode;
  skillAssignmentId: number;
  skillProgramDayId: number;
  skillProgramExerciseId: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reviewVideoRef = useRef<HTMLVideoElement>(null);
  const reviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }
  const rafRef = useRef<number | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordedBlobRef = useRef<Blob | null>(null);
  const framesRef = useRef<CapturedFrame[]>([]);
  const captureStartRef = useRef(0);
  const stepRef = useRef<Step>("warning");

  const [step, setStepState] = useState<Step>("warning");
  function changeStep(next: Step) {
    stepRef.current = next;
    setStepState(next);
  }
  const [cameraAngle, setCameraAngle] = useState<MechanicsCameraAngle | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [result, setResult] = useState<MechanicsResult | null>(null);
  const [faults, setFaults] = useState<MechanicsFault[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveClipForCoach, setSaveClipForCoach] = useState(false);

  // Same coach-configurable sensitivity thresholds as the sprint tracker --
  // see the route comment on /api/athlete/skill-fault-thresholds.
  const { data: thresholds } = useQuery<SkillFaultThresholds>({
    queryKey: ["/api/athlete/skill-fault-thresholds", skillAssignmentId],
    queryFn: () => getJson(`/api/athlete/skill-fault-thresholds?skillAssignmentId=${skillAssignmentId}`),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    changeStep("warning");
    setCameraAngle(null);
    setCameraError(null);
    setRecording(false);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setResult(null);
    setFaults([]);
    setShowSkeleton(true);
    setSaveClipForCoach(false);
    framesRef.current = [];
    chunksRef.current = [];
    recordedBlobRef.current = null;
    lastVideoTimeRef.current = -1;

    setModelLoading(true);
    getPoseLandmarker()
      .then((landmarker) => {
        poseLandmarkerRef.current = landmarker;
        setModelLoading(false);
      })
      .catch(() => {
        setCameraError("Couldn't load the pose-tracking model -- check your connection and retry.");
        setModelLoading(false);
      });

    return () => {
      stopCamera();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || step !== "capture") {
      // Leaving the capture step (most commonly: finishing a recording and
      // landing on "review") previously fell through here with no cleanup
      // of its own -- unlike sprint-tracker-dialog.tsx's equivalent effect,
      // this one never stopped the camera on the way out, so the athlete's
      // camera stayed live and recording for as long as they stayed on the
      // review screen, until the whole dialog closed.
      stopCamera();
      return;
    }
    // ideal, not exact -- see bar-tracker-dialog.tsx's own comment on this
    // same constraint shape. A bat swing or throw is the fastest motion
    // this app tracks, so peakAngularVelocityTime's sequencing precision
    // (hip vs. shoulder vs. arm peak timing) benefits from 60fps more here
    // than almost anywhere else in the camera tracker.
    let cancelled = false;
    const acquireCamera = () => {
      ensureCameraPermission().then((granted) => {
        if (cancelled) return;
        if (!granted) {
          setCameraError("Camera access denied -- enable it for Forge in Settings.");
          return;
        }
        navigator.mediaDevices
          .getUserMedia({
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 60, min: 30 },
            },
          })
          .then((stream) => {
            // The athlete can leave "capture" (or close the dialog) before this
            // permission prompt resolves -- without this guard, a late-arriving
            // stream would still get attached and left running, orphaned, with
            // nothing left to ever stop it until the dialog fully closes.
            if (cancelled) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            setCameraError(null);
            streamRef.current = stream;
            if (videoRef.current) videoRef.current.srcObject = stream;
            // Best-effort, Chrome/Android-only -- see lockCameraExposure's own
            // comment. A bat swing or throw is the fastest motion this app
            // tracks, so it's also the motion a longer auto-exposure shutter
            // blurs hardest.
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) void lockCameraExposure(videoTrack);
          })
          .catch(() => setCameraError("Camera access denied or unavailable."));
      });
    };
    acquireCamera();
    rafRef.current = requestAnimationFrame(tick);

    // See bar-tracker-dialog.tsx's own comment on onAppForeground.
    const unsubscribeForeground = onAppForeground(() => {
      const stillLive = streamRef.current?.getVideoTracks().some((t) => t.readyState === "live");
      if (stillLive) return;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      acquireCamera();
    });
    return () => {
      cancelled = true;
      unsubscribeForeground();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  function tick() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = poseLandmarkerRef.current;
    if (!video || !canvas || !landmarker || video.videoWidth === 0 || video.clientWidth === 0) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    if (video.currentTime === lastVideoTimeRef.current) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    lastVideoTimeRef.current = video.currentTime;

    // Sized to the video's actual on-screen box, not its encoded
    // videoWidth/videoHeight -- on iOS Safari a portrait rear-camera stream
    // can report landscape sensor dimensions there while already rendering
    // (and feeding MediaPipe) rotated portrait frames, so scaling landmarks
    // by the raw encoded size draws the skeleton at the wrong scale/position.
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    const ctx = canvas.getContext("2d");
    const now = performance.now();
    const detection = landmarker.detectForVideo(video, now);
    // Rejects a confident-looking detection on something that isn't
    // actually a person (a box, a rack, a shadow) -- same torso-presence
    // gate bar-tracker-dialog.tsx's live tick loop uses, applied here since
    // this dialog runs its own independent detectForVideo loop rather than
    // sharing that one.
    const rawLandmarks = detection.landmarks[0] ?? null;
    const landmarks = rawLandmarks && isPlausibleHumanFrame(rawLandmarks) ? rawLandmarks : null;
    const worldLandmarks = landmarks ? (detection.worldLandmarks[0] ?? null) : null;

    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (landmarks) drawSkeleton(ctx, landmarks, canvas.width, canvas.height);
    }

    if (stepRef.current === "capture" && recorderRef.current?.state === "recording" && landmarks && worldLandmarks) {
      framesRef.current.push({ t: now - captureStartRef.current, landmarks, worldLandmarks });
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    framesRef.current = [];
    chunksRef.current = [];
    captureStartRef.current = performance.now();
    const mimeType = MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : undefined;
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recordedVideoType(recorder, mimeType) });
      finishCapture(blob);
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  function finishCapture(blob: Blob) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    if (framesRef.current.length < 6) {
      toast.error("That capture was too short to analyze -- try again with the full motion in frame.");
      changeStep("capture");
      return;
    }

    const effectiveThresholds = thresholds ?? DEFAULT_SKILL_FAULT_THRESHOLDS;
    const mechanicsResult = analyzeMechanics(framesRef.current, mode, effectiveThresholds);
    setResult(mechanicsResult);
    setFaults(cameraAngle ? detectMechanicsFaults(mechanicsResult, cameraAngle, effectiveThresholds) : []);
    recordedBlobRef.current = blob;
    setVideoUrl(URL.createObjectURL(blob));
    changeStep("review");
  }

  // Redraws the skeleton on the review canvas at whatever frame is closest
  // to the video's current scrub position -- frame timestamps and video
  // time both start counting from the same "Start Recording" moment, so
  // they line up without any extra syncing.
  function redrawReviewOverlay() {
    const video = reviewVideoRef.current;
    const canvas = reviewCanvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.clientWidth || canvas.width;
    canvas.height = video.clientHeight || canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!showSkeleton) return;
    const targetMs = video.currentTime * 1000;
    let closest: CapturedFrame | null = null;
    let closestDist = Infinity;
    for (const frame of framesRef.current) {
      const dist = Math.abs(frame.t - targetMs);
      if (dist < closestDist) {
        closestDist = dist;
        closest = frame;
      }
    }
    if (closest) drawSkeleton(ctx, closest.landmarks, canvas.width, canvas.height);
  }

  function retry() {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setResult(null);
    setFaults([]);
    setSaveClipForCoach(false);
    framesRef.current = [];
    recordedBlobRef.current = null;
    changeStep("capture");
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    try {
      // Opt-in only: the clip is uploaded here for the first time, right
      // before saving the session, never during capture -- if the athlete
      // never checks the box, recordedBlobRef is simply discarded when the
      // dialog closes and no video ever leaves the device.
      let uploadedVideoUrl: string | null = null;
      if (saveClipForCoach && recordedBlobRef.current) {
        const formData = new FormData();
        formData.append(
          "video",
          recordedBlobRef.current,
          videoFilenameForBlob(recordedBlobRef.current, "skill-clip"),
        );
        const uploadRes = await apiRequest("POST", "/api/athlete/skill-video", formData);
        uploadedVideoUrl = (await uploadRes.json()).url;
      }
      await apiRequest("POST", "/api/athlete/skill-session-logs", {
        skillAssignmentId,
        skillProgramDayId,
        skillProgramExerciseId,
        trackingLevel: "mechanics",
        cameraAngle,
        faults,
        hipShoulderSeparationDeg: result.hipShoulderSeparationDeg,
        weightTransferPct: result.weightTransferPct,
        hipRotationDeg: result.hipRotationDeg,
        armSlotDeg: result.armSlot?.angleDeg ?? null,
        armSlotLabel: result.armSlot?.label ?? null,
        wellSequenced: result.sequencing.wellSequenced,
        videoUrl: uploadedVideoUrl,
      });
      toast.success(mode === "throw" ? "Throw saved" : "Swing saved");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Could not save this session");
    } finally {
      setSaving(false);
    }
  }

  const actionLabel = mode === "throw" ? "Throw" : "Swing";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-teal-400" />
            {drillName}
          </DialogTitle>
        </DialogHeader>

        {step === "warning" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Camera angle changes what this can measure. Pick the angle you're actually filming from.</p>
            </div>
            <button
              type="button"
              onClick={() => setCameraAngle("face_on")}
              className={cn(
                "w-full rounded-md border p-3 text-left text-sm",
                cameraAngle === "face_on" ? "border-teal-500 bg-teal-950/30" : "border-border",
              )}
            >
              <p className="font-semibold">Filming face-on</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Checks weight transfer and hip rotation. Won't catch separation or sequencing.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setCameraAngle("down_the_line")}
              className={cn(
                "w-full rounded-md border p-3 text-left text-sm",
                cameraAngle === "down_the_line" ? "border-teal-500 bg-teal-950/30" : "border-border",
              )}
            >
              <p className="font-semibold">Filming down the line</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Checks hip-shoulder separation and sequencing
                {mode === "throw" ? ", plus arm slot" : ""}. Won't catch weight transfer or hip rotation.
              </p>
            </button>
            <DialogFooter>
              <Button disabled={!cameraAngle} onClick={() => changeStep("capture")}>
                Continue
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "capture" && (
          <div className="space-y-3">
            {cameraError && <p className="text-sm text-destructive">{cameraError}</p>}
            {modelLoading && !cameraError && (
              <p className="text-sm text-muted-foreground">Loading tracking model…</p>
            )}
            <div className="relative overflow-hidden rounded-md bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="w-full" />
              <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            </div>
            <p className="text-sm text-muted-foreground">
              {recording
                ? `Recording -- perform the full ${actionLabel.toLowerCase()}, then stop.`
                : `Get in frame, then start recording your ${actionLabel.toLowerCase()}.`}
            </p>
            <DialogFooter>
              {!recording ? (
                <Button onClick={startRecording} disabled={!!cameraError || modelLoading}>
                  <Play className="h-4 w-4" />
                  Start Recording
                </Button>
              ) : (
                <Button variant="secondary" onClick={stopRecording}>
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              )}
            </DialogFooter>
          </div>
        )}

        {step === "review" && result && videoUrl && (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-md bg-black">
              <video
                ref={reviewVideoRef}
                src={videoUrl}
                playsInline
                controls
                className="w-full"
                onLoadedMetadata={redrawReviewOverlay}
                onTimeUpdate={redrawReviewOverlay}
                onSeeked={redrawReviewOverlay}
              />
              <canvas ref={reviewCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowSkeleton((v) => !v);
                requestAnimationFrame(redrawReviewOverlay);
              }}
            >
              {showSkeleton ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showSkeleton ? "Hide Skeleton" : "Show Skeleton"}
            </Button>

            <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-4 text-center text-sm">
              {result.hipShoulderSeparationDeg != null && (
                <div>
                  <p className="text-xl font-bold text-teal-400">{result.hipShoulderSeparationDeg}°</p>
                  <p className="text-xs text-muted-foreground">Hip-shoulder separation</p>
                </div>
              )}
              {result.hipRotationDeg != null && (
                <div>
                  <p className="text-xl font-bold">{result.hipRotationDeg}°</p>
                  <p className="text-xs text-muted-foreground">Hip rotation</p>
                </div>
              )}
              {result.weightTransferPct != null && (
                <div>
                  <p className="text-xl font-bold">{result.weightTransferPct}%</p>
                  <p className="text-xs text-muted-foreground">Weight transfer</p>
                </div>
              )}
              {result.armSlot && (
                <div>
                  <p className="text-xl font-bold capitalize">{result.armSlot.label}</p>
                  <p className="text-xs text-muted-foreground">Arm slot ({result.armSlot.angleDeg}°)</p>
                </div>
              )}
              <div>
                <p className="text-xl font-bold">{result.sequencing.wellSequenced ? "Good" : "Off"}</p>
                <p className="text-xs text-muted-foreground">Sequencing</p>
              </div>
            </div>

            {faults.length > 0 ? (
              <div className="space-y-2">
                {faults.map((f) => (
                  <div key={f.code} className="space-y-1">
                    <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm text-amber-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      {f.label}
                    </div>
                    <SuggestedCorrective faultCode={f.code} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-teal-400" />
                No mechanics faults flagged from this angle.
              </p>
            )}

            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={saveClipForCoach}
                onCheckedChange={(c) => setSaveClipForCoach(c === true)}
              />
              <span>
                Save this clip so my coach can review it
                <span className="block text-xs text-muted-foreground">
                  Off by default -- only the numbers above are saved unless you turn this on.
                </span>
              </span>
            </label>

            <DialogFooter>
              <Button variant="outline" onClick={retry}>
                <RotateCcw className="h-4 w-4" />
                Retry
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : `Save ${actionLabel}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
