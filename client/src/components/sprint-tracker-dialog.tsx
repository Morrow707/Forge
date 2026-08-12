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
import { cn } from "@/lib/utils";
import { apiRequest, getJson } from "@/lib/queryClient";
import { getPoseLandmarker, POSE_LANDMARKS, type PoseFrame } from "@/lib/pose-tracking";
import { lockCameraExposure } from "@/lib/camera-exposure";
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
import { AlertTriangle, Play, Square, RotateCcw, Check, Timer, Trophy } from "lucide-react";
import { SuggestedCorrective } from "@/components/suggested-corrective";

type Step = "warning" | "calibrate" | "capture" | "review";

const SKELETON_COLOR = "#2dd4bf";
const CHECKPOINT_COLOR = "#facc15";
const MIN_VISIBILITY = 0.5;

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
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const checkpointsRef = useRef<number[]>([]);
  const pointsRef = useRef<SprintPoint[]>([]);
  const framesRef = useRef<PoseFrame[]>([]);
  const captureStartRef = useRef(0);
  const stepRef = useRef<Step>("warning");

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
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [open]);

  // Camera only needs to actually turn on once the athlete's past the
  // warning step -- no point asking for permission before they've even
  // picked an angle.
  useEffect(() => {
    if (!open || step === "warning" || step === "review") return;
    // ideal, not exact -- see bar-tracker-dialog.tsx's own comment on this
    // same constraint shape. Checkpoint-crossing time is interpolated
    // between frames either way, but a higher frame rate still means less
    // real screen-x distance the reference point can cover between two
    // samples, which tightens that interpolation for a fast sprint.
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
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        // Best-effort, Chrome/Android-only -- see lockCameraExposure's own
        // comment. A sprint is exactly the fast-motion case a longer
        // auto-exposure shutter blurs hardest.
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) void lockCameraExposure(videoTrack);
      })
      .catch(() => setCameraError("Camera access denied or unavailable."));
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
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
    const landmarks = detection.landmarks[0] ?? null;
    const worldLandmarks = detection.worldLandmarks[0] ?? null;

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
    setResult(crossing);
    setFaults(
      cameraAngle
        ? detectSprintFaults(framesRef.current, cameraAngle, undefined, thresholds ?? DEFAULT_SKILL_FAULT_THRESHOLDS)
        : [],
    );
    changeStep("review");
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
  }

  function retry() {
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
      await apiRequest("POST", "/api/athlete/skill-session-logs", {
        skillAssignmentId,
        skillProgramDayId,
        skillProgramExerciseId,
        trackingLevel: "sprint",
        elapsedSeconds: result.totalElapsedSeconds,
        distanceYards: Number(distanceYards) || null,
        cameraAngle,
        faults,
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
