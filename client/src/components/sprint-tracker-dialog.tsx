import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { apiRequest, getJson, resolveApiUrl } from "@/lib/queryClient";
import { getPoseLandmarker, isPlausibleHumanFrame, MIN_VISIBILITY, POSE_LANDMARKS, type PoseFrame } from "@/lib/pose-tracking";
import { lockCameraExposure } from "@/lib/camera-exposure";
import { ensureCameraPermission, onAppForeground, onAppBackground } from "@/lib/native-camera";
import {
  deriveSprintReferencePoint,
  detectSprintCrossings,
  detectSprintFaults,
  type SprintCameraAngle,
  type SprintPoint,
  type SprintResult,
  type SprintFault,
} from "@/lib/sprint-tracking";
import { DEFAULT_SKILL_FAULT_THRESHOLDS, type SkillFaultThresholds } from "@shared/skill-fault-thresholds";
import { PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";
import { toast } from "sonner";
import { AlertTriangle, Play, Square, RotateCcw, Check, Timer, Trophy, Eye, EyeOff } from "lucide-react";
import { SuggestedCorrective } from "@/components/suggested-corrective";
import { recordedVideoType, videoFilenameForBlob } from "@/lib/video-recording";

type Step = "warning" | "calibrate" | "capture" | "review";

const SKELETON_COLOR = "#2dd4bf";
const CHECKPOINT_COLOR = "#facc15";

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

function drawCheckpoints(ctx: CanvasRenderingContext2D, checkpointXs: number[], width: number, height: number) {
  ctx.strokeStyle = CHECKPOINT_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  for (const x of checkpointXs) {
    ctx.beginPath();
    ctx.moveTo(x * width, 0);
    ctx.lineTo(x * width, height);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/** Camera-tracked sprint/agility timing for a skill drill -- see
 * client/src/lib/sprint-tracking.ts for the checkpoint-crossing model this
 * is built on. Every capture starts with a mandatory camera-angle warning
 * (per the coach's explicit requirement): side view can only ever measure
 * forward-lean faults, front/behind view can only ever measure hip-drop
 * faults, and there's no "remember my choice" skip -- the warning is shown
 * every single time because the two angles are blind to different faults
 * and picking the wrong one silently produces no fault feedback at all. */
export function SprintTrackerDialog({
  open,
  onOpenChange,
  drillName,
  skillAssignmentId,
  skillProgramDayId,
  skillProgramExerciseId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drillName: string;
  skillAssignmentId: number;
  skillProgramDayId: number;
  skillProgramExerciseId: number;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reviewVideoRef = useRef<HTMLVideoElement>(null);
  const reviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const checkpointsRef = useRef<number[]>([]);
  const pointsRef = useRef<SprintPoint[]>([]);
  const framesRef = useRef<PoseFrame[]>([]);
  const captureStartRef = useRef(0);
  const stepRef = useRef<Step>("warning");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordedBlobRef = useRef<Blob | null>(null);
  // Set right before recorder.stop() is called from a Cancel/Retry path so
  // the onstop handler below knows to discard the chunks instead of turning
  // them into a reviewable clip -- distinguishes "capture ended because the
  // athlete crossed the finish" from "capture was abandoned."
  const discardRecordingRef = useRef(false);

  const [step, setStepState] = useState<Step>("warning");
  function changeStep(next: Step) {
    stepRef.current = next;
    setStepState(next);
  }
  const [cameraAngle, setCameraAngle] = useState<SprintCameraAngle | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [checkpointCount, setCheckpointCount] = useState(0);
  const [distanceYards, setDistanceYards] = useState("40");
  const [result, setResult] = useState<SprintResult | null>(null);
  const [faults, setFaults] = useState<SprintFault[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingToProfile, setSavingToProfile] = useState(false);
  const [savedToProfile, setSavedToProfile] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [saveClipForCoach, setSaveClipForCoach] = useState(false);

  // Fetched once per dialog open, resolved via this drill's own coach --
  // see the route comment on /api/athlete/skill-fault-thresholds. Falls
  // back to the built-in defaults below if it hasn't resolved yet by the
  // time a fault check runs (a plain GET well ahead of a multi-second
  // sprint capture), so a slow network never blocks scoring.
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
    setResult(null);
    setFaults([]);
    setSavedToProfile(false);
    checkpointsRef.current = [];
    setCheckpointCount(0);
    pointsRef.current = [];
    framesRef.current = [];
    lastVideoTimeRef.current = -1;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setShowSkeleton(true);
    setSaveClipForCoach(false);
    chunksRef.current = [];
    recordedBlobRef.current = null;
    discardRecordingRef.current = false;

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
      if (recorderRef.current?.state === "recording") {
        discardRecordingRef.current = true;
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [open]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  // Camera only needs to actually turn on once the athlete's past the
  // warning step -- no point asking for permission before they've even
  // picked an angle. "calibrate" and "capture" are BOTH camera-active
  // steps here (unlike mechanics-tracker-dialog.tsx's single active
  // step), so a transition between them -- Start Capture, or a Cancel
  // back to calibrate -- still changes `step` and re-runs this effect.
  // Stopping the previous stream first, both in the early-return guard
  // below and in this effect's own cleanup, is what keeps that from
  // silently leaking an extra live camera stream on every one of those
  // transitions -- confirmed empirically: without this, three separate
  // getUserMedia() streams were all still live (none ever had .stop()
  // called) after one calibrate -> capture -> cancel cycle. Same
  // stopCamera() pattern form-video-recorder-dialog.tsx already uses for
  // its own record/retake cycle.
  useEffect(() => {
    if (!open || step === "warning" || step === "review") {
      stopCamera();
      return;
    }
    // ideal, not exact -- see bar-tracker-dialog.tsx's own comment on this
    // same constraint shape. Checkpoint-crossing time is interpolated
    // between frames either way, but a higher frame rate still means less
    // real screen-x distance the reference point can cover between two
    // samples, which tightens that interpolation for a fast sprint.
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
            // The athlete can back out to "warning"/"review" (or close the
            // dialog) before this permission prompt resolves -- without this
            // guard, a late-arriving stream would still get attached and left
            // running, orphaned, with nothing left to ever stop it until the
            // dialog's next step change or close.
            if (cancelled) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            setCameraError(null);
            streamRef.current = stream;
            if (videoRef.current) videoRef.current.srcObject = stream;
            // Best-effort, Chrome/Android-only -- see lockCameraExposure's own
            // comment. A sprint is exactly the fast-motion case a longer
            // auto-exposure shutter blurs hardest.
            const videoTrack = stream.getVideoTracks()[0];
            if (videoTrack) void lockCameraExposure(videoTrack);
          })
          .catch(() => setCameraError("Camera access denied or unavailable."));
      });
    };
    acquireCamera();
    rafRef.current = requestAnimationFrame(tick);

    // See bar-tracker-dialog.tsx's own comment on onAppForeground -- same
    // reacquire-on-return fix, scoped to whichever camera-active step is
    // live when the app was backgrounded.
    const unsubscribeForeground = onAppForeground(() => {
      const stillLive = streamRef.current?.getVideoTracks().some((t) => t.readyState === "live");
      if (stillLive) return;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      acquireCamera();
    });
    // See bar-tracker-dialog.tsx's own comment on onAppBackground -- release
    // the camera/recorder/rAF loop immediately on backgrounding rather than
    // waiting on the OS. Doesn't touch capture state, so a backgrounded
    // capture just resumes once onAppForeground above reacquires.
    const unsubscribeBackground = onAppBackground(() => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      stopCamera();
    });
    return () => {
      cancelled = true;
      unsubscribeForeground();
      unsubscribeBackground();
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

    // Sized to the video's actual on-screen box (clientWidth/Height), not its
    // encoded videoWidth/videoHeight -- on iOS Safari a portrait rear-camera
    // stream's encoded resolution can be transposed relative to what's
    // actually rendered on screen, which drew the skeleton/checkpoint
    // overlay offset from the athlete's real position in frame.
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
      drawCheckpoints(ctx, checkpointsRef.current, canvas.width, canvas.height);
      if (landmarks) drawSkeleton(ctx, landmarks, canvas.width, canvas.height);
    }

    if (stepRef.current === "capture" && landmarks && worldLandmarks) {
      const ref = deriveSprintReferencePoint(landmarks);
      if (ref) {
        pointsRef.current.push({ t: now - captureStartRef.current, x: ref.x });
        framesRef.current.push({ t: now - captureStartRef.current, landmarks, worldLandmarks });

        const calibration = { checkpoints: checkpointsRef.current.map((x) => ({ x })), distanceYards: Number(distanceYards) || 0 };
        const crossing = detectSprintCrossings(pointsRef.current, calibration);
        if (crossing) {
          finishCapture(crossing);
          return;
        }
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }

  function finishCapture(crossing: SprintResult) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setResult(crossing);
    setFaults(
      cameraAngle
        ? detectSprintFaults(framesRef.current, cameraAngle, undefined, thresholds ?? DEFAULT_SKILL_FAULT_THRESHOLDS)
        : [],
    );
    changeStep("review");
  }

  // Redraws the skeleton on the review canvas at whatever frame is closest
  // to the video's current scrub position -- same pairing as
  // mechanics-tracker-dialog.tsx's own redrawReviewOverlay: frame timestamps
  // and video time both start counting from the same "Start Capture" moment
  // (captureStartRef), so they line up without any extra syncing.
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
    let closest: PoseFrame | null = null;
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

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (step !== "calibrate" || checkpointsRef.current.length >= 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const normalizedX = (e.clientX - rect.left) / rect.width;
    checkpointsRef.current = [...checkpointsRef.current, normalizedX];
    setCheckpointCount(checkpointsRef.current.length);
  }

  function resetCheckpoints() {
    checkpointsRef.current = [];
    setCheckpointCount(0);
  }

  function startCapture() {
    pointsRef.current = [];
    framesRef.current = [];
    captureStartRef.current = performance.now();
    changeStep("capture");

    // Opt-in recording, mirroring mechanics-tracker-dialog.tsx's pattern --
    // captured locally the same way, uploaded only if the athlete checks
    // "save clip for coach" at review, discarded otherwise. Sprint has no
    // separate Start/Stop for this since "Start Capture" already marks the
    // moment the athlete takes off, and finishCapture (triggered by
    // detectSprintCrossings, not a manual Stop) is the natural place to end
    // it.
    const stream = streamRef.current;
    if (stream) {
      chunksRef.current = [];
      discardRecordingRef.current = false;
      const mimeType = MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : undefined;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        if (discardRecordingRef.current) return;
        const blob = new Blob(chunksRef.current, { type: recordedVideoType(recorder, mimeType) });
        recordedBlobRef.current = blob;
        setVideoUrl(URL.createObjectURL(blob));
      };
      recorderRef.current = recorder;
      recorder.start();
    }
  }

  function retry() {
    if (recorderRef.current?.state === "recording") {
      discardRecordingRef.current = true;
      recorderRef.current.stop();
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    recordedBlobRef.current = null;
    setSaveClipForCoach(false);
    resetCheckpoints();
    setResult(null);
    setFaults([]);
    setSavedToProfile(false);
    changeStep("calibrate");
  }

  const saveMutation = async () => {
    if (!result) return;
    setSaving(true);
    try {
      // Opt-in only, same as mechanics -- the clip is uploaded here for the
      // first time, right before saving the session, never during capture.
      // If the athlete never checks the box, recordedBlobRef is simply
      // discarded when the dialog closes and no video ever leaves the
      // device.
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
        trackingLevel: "sprint",
        elapsedSeconds: result.totalElapsedSeconds,
        distanceYards: Number(distanceYards) || null,
        cameraAngle,
        faults,
        videoUrl: uploadedVideoUrl,
      });
      toast.success("Sprint saved");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Could not save sprint session");
    } finally {
      setSaving(false);
    }
  };

  // Only offered for a straight-line sprint in the ballpark of the standard
  // 40 -- a shuttle/pro-agility distance needs direction reversals this v1's
  // two-checkpoint straight-line model doesn't support (see the calibration
  // comment in sprint-tracking.ts), so this deliberately doesn't try to also
  // guess at proAgilitySeconds from the same capture.
  const distanceNum = Number(distanceYards) || 0;
  const looksLikeFortyYard = distanceNum >= 35 && distanceNum <= 45;

  async function saveToTestingProfile() {
    if (!result) return;
    setSavingToProfile(true);
    try {
      await apiRequest("PATCH", "/api/athlete/profile", { fortyYardDash: result.totalElapsedSeconds });
      setSavedToProfile(true);
      toast.success("Saved to your 40-yard dash");
    } catch (err: any) {
      toast.error(err.message || "Could not save to testing profile");
    } finally {
      setSavingToProfile(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-teal-400" />
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
              onClick={() => setCameraAngle("side")}
              className={cn(
                "w-full rounded-md border p-3 text-left text-sm",
                cameraAngle === "side" ? "border-teal-500 bg-teal-950/30" : "border-border",
              )}
            >
              <p className="font-semibold">Filming from the side</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Checks forward lean during acceleration. Won't catch hip drop.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setCameraAngle("front_behind")}
              className={cn(
                "w-full rounded-md border p-3 text-left text-sm",
                cameraAngle === "front_behind" ? "border-teal-500 bg-teal-950/30" : "border-border",
              )}
            >
              <p className="font-semibold">Filming from the front or behind</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Checks hip drop during stance. Won't catch forward lean.
              </p>
            </button>
            <DialogFooter>
              <Button disabled={!cameraAngle} onClick={() => changeStep("calibrate")}>
                Continue
              </Button>
            </DialogFooter>
          </div>
        )}

        {(step === "calibrate" || step === "capture") && (
          <div className="space-y-3">
            {cameraError && <p className="text-sm text-destructive">{cameraError}</p>}
            {modelLoading && !cameraError && (
              <p className="text-sm text-muted-foreground">Loading tracking model…</p>
            )}
            <div className="relative overflow-hidden rounded-md bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="w-full" />
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                className={cn("absolute inset-0 h-full w-full", step === "calibrate" && "cursor-crosshair")}
              />
            </div>

            {step === "calibrate" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Tap the video where the <strong>start line</strong> is, then where the{" "}
                  <strong>finish line</strong> is ({checkpointCount}/2 marked).
                </p>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label>Distance (yards)</Label>
                    <Input
                      type="number"
                      value={distanceYards}
                      onChange={(e) => setDistanceYards(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" onClick={resetCheckpoints} disabled={checkpointCount === 0}>
                    <RotateCcw className="h-4 w-4" />
                    Reset marks
                  </Button>
                </div>
                <DialogFooter>
                  <Button
                    disabled={checkpointCount < 2 || (Number(distanceYards) || 0) <= 0}
                    onClick={startCapture}
                  >
                    <Play className="h-4 w-4" />
                    Start Capture
                  </Button>
                </DialogFooter>
              </>
            )}

            {step === "capture" && (
              <>
                <p className="text-sm text-teal-400">Recording -- run through both markers now.</p>
                <DialogFooter>
                  <Button variant="outline" onClick={retry}>
                    <Square className="h-4 w-4" />
                    Cancel
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}

        {step === "review" && result && (
          <div className="space-y-4">
            {videoUrl && (
              <>
                <div className="relative overflow-hidden rounded-md bg-black">
                  <video
                    ref={reviewVideoRef}
                    src={resolveApiUrl(videoUrl)}
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
              </>
            )}
            <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-4 text-center">
              <div>
                <p className="text-2xl font-bold text-teal-400">{result.totalElapsedSeconds.toFixed(2)}s</p>
                <p className="text-xs text-muted-foreground">Elapsed time</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{result.avgSpeedYardsPerSec.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Yards / sec</p>
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

            {looksLikeFortyYard && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={saveToTestingProfile}
                disabled={savingToProfile || savedToProfile}
              >
                <Trophy className="h-4 w-4" />
                {savedToProfile ? "Saved to testing profile" : "Save as my 40-yard dash"}
              </Button>
            )}

            {videoUrl && (
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
            )}

            <DialogFooter>
              <Button variant="outline" onClick={retry}>
                <RotateCcw className="h-4 w-4" />
                Retry
              </Button>
              <Button onClick={saveMutation} disabled={saving}>
                {saving ? "Saving…" : "Save Sprint"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
