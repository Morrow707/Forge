import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { apiRequest, getJson } from "@/lib/queryClient";
import { POSE_LANDMARKS, type PoseFrame, type SetTrustScore } from "@/lib/pose-tracking";
import { crossingTrustScore } from "@/lib/capture-trust";
import { type PoseFrame as NativePoseFrame } from "@/lib/native-av-preview";
import { useAvBodyTracking } from "@/lib/use-av-body-tracking";
import { AvCameraChrome } from "@/components/av-camera-chrome";
import { visionJointsToWorldLandmarks, visionBody3DToWorldLandmarks } from "@/lib/vision-body-landmarks";
import {
  detectSprintCrossings,
  detectSprintFaults,
  deriveSprintReferencePoint,
  checkpointsForShuttleTaps,
  checkpointsForThreeConeTap,
  SPRINT_PRESETS,
  MAX_PLAUSIBLE_SPRINT_SPEED_YARDS_PER_SEC,
  type SprintCameraAngle,
  type SprintPoint,
  type SprintResult,
  type SprintSplit,
  type SprintFault,
  type SprintCheckpoint,
  type SprintPreset,
} from "@/lib/sprint-tracking";
import { RadioChipGroup } from "@/components/filter-chip-group";
import { DEFAULT_SKILL_FAULT_THRESHOLDS, type SkillFaultThresholds } from "@shared/skill-fault-thresholds";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { toast } from "sonner";
import { AlertTriangle, Play, Square, RotateCcw, Check, Timer, Trophy, X, Flag, XCircle } from "lucide-react";
import { SuggestedCorrective } from "@/components/suggested-corrective";
import { videoFilenameForBlob } from "@/lib/video-recording";
import { burnTrackingOverlay, type OverlayRepMarker } from "@/lib/video-overlay";

type Step = "warning" | "calibrate" | "capture" | "analyzing" | "manual" | "review";

const CHECKPOINT_COLOR = "#facc15";
const HIP_INDICES = [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.RIGHT_HIP];
// Generous ceiling on how long a single take is allowed to record -- every
// preset's actual run takes a few seconds at most, so this only ever fires
// as a safety net against a forgotten Stop tap, not a normal drill. Keeps a
// missed tap from silently recording (and needing to analyze) an
// arbitrarily long, storage-bloating clip.
const MAX_RECORDING_MS = 15000;

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

// Vision only reports individual joints, no ready-made screen-space
// reference point -- sprint-tracking.ts's checkpoint-crossing model and
// burnTrackingOverlay's saved-clip trail both need one, the same way
// ar-sprint-tracker-dialog.tsx's sparseHipLandmarks fills that gap for
// ARKit's hipScreenX/Y. Vision's raw joint x/y are already normalized
// screen-space (unlike vision-body-landmarks.ts's aspect-corrected
// pixel-space output, which is the wrong scale for this) -- just the Y-flip
// (Vision's bottom-left origin -> the top-left-origin-down convention this
// app's `landmarks` slot and checkpoint taps both assume) is needed.
function sparseHipLandmarksFromVisionFrame(frame: NativePoseFrame): NormalizedLandmark[] {
  const landmarks: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  const leftHip = frame.joints.find((j) => j.name === "leftHip");
  const rightHip = frame.joints.find((j) => j.name === "rightHip");
  if (leftHip) {
    landmarks[POSE_LANDMARKS.LEFT_HIP] = { x: leftHip.x, y: 1 - leftHip.y, z: 0, visibility: leftHip.confidence };
  }
  if (rightHip) {
    landmarks[POSE_LANDMARKS.RIGHT_HIP] = { x: rightHip.x, y: 1 - rightHip.y, z: 0, visibility: rightHip.confidence };
  }
  return landmarks;
}

// Mirrors detectSprintCrossings' own split/glitch math, but driven by two
// coach-marked timestamps (the recorded clip's own <video> currentTime, in
// seconds) instead of auto-detected checkpoint crossings -- the Phase 4
// manual-override path: if Vision's auto-detection comes back empty or
// unreliable, the coach still walks away with a real number, scrubbing the
// clip by hand instead of losing the take. Distance is the sum of every
// checkpoint's own segment distance (correct for a straight sprint AND a
// multi-leg shuttle alike), not tied to a single manually-re-entered figure.
function buildManualResult(startTime: number, finishTime: number, checkpoints: SprintCheckpoint[]): SprintResult | null {
  const totalElapsedSeconds = Math.round((finishTime - startTime) * 1000) / 1000;
  if (totalElapsedSeconds <= 0) return null;
  const totalDistanceYards = checkpoints.slice(1).reduce((sum, cp) => sum + (cp.segmentDistanceYards ?? 0), 0);
  const avgSpeedYardsPerSec = totalDistanceYards > 0 ? Math.round((totalDistanceYards / totalElapsedSeconds) * 100) / 100 : 0;
  const likelyGlitch = avgSpeedYardsPerSec > MAX_PLAUSIBLE_SPRINT_SPEED_YARDS_PER_SEC;
  const splits: SprintSplit[] = [
    { fromCheckpoint: 0, toCheckpoint: checkpoints.length - 1, elapsedSeconds: totalElapsedSeconds, distanceYards: totalDistanceYards },
  ];
  // No auto-detected crossings at all here -- the two times came off the coach's own eye on
  // the clip, not off two straddling frames -- so there is no frame-gap precision bound to
  // report. crossingTrustScore's manuallyTimed flag is what accounts for this path instead.
  return { totalElapsedSeconds, totalDistanceYards, splits, avgSpeedYardsPerSec, likelyGlitch, crossingFrameGapsMs: [] };
}

/** AVFoundation + Vision sprint/agility timing -- the first real tracker built on the new
 * pipeline (see AvBodyTrackingPlugin.swift's file comment for why this pipeline exists), and
 * directly parallel to ar-sprint-tracker-dialog.tsx, which stays completely untouched as a
 * fallback (see the plan's own Context section). Sprint was the first mode converted for the
 * same reason it was first off MediaPipe originally: a checkpoint-crossing sprint needs a
 * single tracked reference point and no implement -- the least that could possibly prove the
 * new pipeline out end-to-end.
 *
 * The real structural difference from the ARKit version, not just a swapped bridge: this
 * pipeline is record-first, analyze-later (see AvBodyTrackingPlugin.swift's own comment on
 * why -- live 60fps Vision inference against a 4K feed risks the same thermal throttling this
 * app already has direct proof of). That means there is no live per-frame crossing detection
 * DURING capture the way the ARKit version has -- the athlete's whole run gets recorded first,
 * then Vision runs against the finished clip afterward, and checkpoint crossings get detected
 * once against the complete set of frames. If that auto-detection comes back low-confidence or
 * empty (occlusion, a bad angle, Vision losing the hip mid-run), the "manual" step lets the
 * coach scrub the recorded clip and drop Start/Finish pins by hand instead -- a real combine
 * test can't walk away with no number just because tracking glitched once.
 *
 * Camera/recording/analysis plumbing comes from useAvBodyTracking (shared with every other AV
 * tracker dialog) -- what's left here is purely sprint-specific: the checkpoint-tap
 * calibration UI, the MAX_RECORDING_MS safety timeout, checkpoint-crossing detection, the
 * manual scrub-and-pin fallback, and the review/save flow. */
export function AvSprintTrackerDialog({
  open,
  onOpenChange,
  drillName,
  skillAssignmentId,
  skillProgramDayId,
  skillProgramExerciseId,
  date,
  setNumber,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drillName: string;
  skillAssignmentId: number;
  skillProgramDayId: number;
  skillProgramExerciseId: number;
  // Both optional, both new -- when the skill sheet is open to a specific
  // set, passing these slots the capture into that exact Set N instead of
  // just appending a row (see createSkillSessionLog's own comment).
  date?: string;
  setNumber?: number;
}) {
  const qc = useQueryClient();
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const reviewVideoRef = useRef<HTMLVideoElement>(null);
  const manualVideoRef = useRef<HTMLVideoElement>(null);
  const checkpointsRef = useRef<number[]>([]);
  const pointsRef = useRef<SprintPoint[]>([]);
  const framesRef = useRef<PoseFrame[]>([]);
  const stepRef = useRef<Step>("warning");
  const recordedBlobRef = useRef<Blob | null>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualStartRef = useRef<number | null>(null);

  const [step, setStepState] = useState<Step>("warning");
  function changeStep(next: Step) {
    stepRef.current = next;
    setStepState(next);
  }
  const [cameraAngle, setCameraAngle] = useState<SprintCameraAngle | null>(null);
  const [checkpointCount, setCheckpointCount] = useState(0);
  const [presetId, setPresetId] = useState("40yd");
  const preset: SprintPreset = SPRINT_PRESETS.find((p) => p.id === presetId) ?? SPRINT_PRESETS[2];
  const [distanceYards, setDistanceYards] = useState("40");
  const [result, setResult] = useState<SprintResult | null>(null);
  // ARC-1: sprint computed no confidence at all, which is why
  // skillSessionLogs.trust_score_pct is null for every row. See
  // capture-trust.ts's crossingTrustScore for what this folds in.
  const [trust, setTrust] = useState<SetTrustScore | null>(null);
  // How many analyzed frames the clip produced, against how many yielded a usable hip
  // midpoint -- a run tracked in a third of its frames still crosses every checkpoint, just
  // far less precisely.
  const frameCoverageRef = useRef({ totalFrames: 0, framesWithReferencePoint: 0 });
  // Whether the times on screen came from the coach scrubbing the clip rather than from
  // detected crossings -- a real measurement, but not a camera cross-check, and the score
  // should not claim it is.
  const manuallyTimedRef = useRef(false);
  const [faults, setFaults] = useState<SprintFault[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingToProfile, setSavingToProfile] = useState(false);
  const [savedToProfile, setSavedToProfile] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [saveClipForCoach, setSaveClipForCoach] = useState(false);
  const [favoriteClip, setFavoriteClip] = useState(false);
  const [manualStartTime, setManualStartTime] = useState<number | null>(null);

  const {
    containerRef,
    supported,
    supportError,
    error,
    setError,
    diagLog,
    recording,
    analyzedFrames,
    startRecording,
    cancelRecording,
    stopRecordingAndAnalyze,
    cancelAnalysis,
  } = useAvBodyTracking(open && (step === "calibrate" || step === "capture"));

  const { data: thresholds } = useQuery<SkillFaultThresholds>({
    queryKey: ["/api/athlete/skill-fault-thresholds", skillAssignmentId],
    queryFn: () => getJson(`/api/athlete/skill-fault-thresholds?skillAssignmentId=${skillAssignmentId}`),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    changeStep("warning");
    setCameraAngle(null);
    setError(null);
    setResult(null);
    setTrust(null);
    setFaults([]);
    setSavedToProfile(false);
    checkpointsRef.current = [];
    setCheckpointCount(0);
    setPresetId("40yd");
    setDistanceYards("40");
    pointsRef.current = [];
    framesRef.current = [];
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setSaveClipForCoach(false);
    recordedBlobRef.current = null;
    manualStartRef.current = null;
    setManualStartTime(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    redrawCheckpointOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, checkpointCount]);

  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    };
  }, []);

  function redrawCheckpointOverlay() {
    const canvas = overlayCanvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (step === "calibrate" || step === "capture") {
      drawCheckpoints(ctx, checkpointsRef.current, canvas.width, canvas.height);
    }
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (step !== "calibrate" || checkpointsRef.current.length >= preset.tapCount) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const normalizedX = (e.clientX - rect.left) / rect.width;
    checkpointsRef.current = [...checkpointsRef.current, normalizedX];
    setCheckpointCount(checkpointsRef.current.length);
  }

  function resetCheckpoints() {
    checkpointsRef.current = [];
    setCheckpointCount(0);
  }

  function selectPreset(next: SprintPreset) {
    setPresetId(next.id);
    if (next.distanceYards != null) setDistanceYards(String(next.distanceYards));
    resetCheckpoints();
  }

  function buildCheckpoints(): SprintCheckpoint[] | null {
    const taps = checkpointsRef.current;
    if (taps.length < preset.tapCount) return null;
    if (preset.tapCount === 3) {
      return checkpointsForShuttleTaps([taps[0], taps[1], taps[2]]);
    }
    if (preset.tapCount === 1) {
      return checkpointsForThreeConeTap(taps[0]);
    }
    const distanceNum = Number(distanceYards) || 0;
    if (distanceNum <= 0) return null;
    return [{ x: taps[0] }, { x: taps[1], segmentDistanceYards: distanceNum }];
  }

  function startCapture() {
    changeStep("capture");
    startRecording();
    recordingTimeoutRef.current = setTimeout(() => {
      if (stepRef.current === "capture") void stopCaptureAndAnalyze();
    }, MAX_RECORDING_MS);
  }

  function cancelCapture() {
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    void cancelRecording();
    changeStep("calibrate");
  }

  async function stopCaptureAndAnalyze() {
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    changeStep("analyzing");
    const result = await stopRecordingAndAnalyze();
    if (!result) {
      // Error/cancellation already reported by the hook -- back to calibrate so the coach can
      // just try again rather than getting stuck on a dead-end step.
      changeStep("calibrate");
      return;
    }
    finishCapture(result.blob, result.rawFrames);
  }

  function finishCapture(blob: Blob, rawFrames: NativePoseFrame[]) {
    recordedBlobRef.current = blob;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(blob));

    pointsRef.current = [];
    framesRef.current = [];
    for (const frame of rawFrames) {
      const elapsedMs = frame.timestamp * 1000;
      const hipLandmarks = sparseHipLandmarksFromVisionFrame(frame);
      const ref = deriveSprintReferencePoint(hipLandmarks);
      if (ref) pointsRef.current.push({ t: elapsedMs, x: ref.x });
      // Phase B: real depth when a frame has it -- see av-bar-tracker-dialog.tsx's own identical
      // comment. Sprint's own crossing detection (below) reads pointsRef, not this array's
      // worldLandmarks, so this mainly benefits the review-step skeleton overlay's own angle
      // tool, kept consistent with every other AV dialog rather than skipped as not worth it.
      framesRef.current.push({
        t: elapsedMs,
        landmarks: hipLandmarks,
        worldLandmarks: visionBody3DToWorldLandmarks(frame) ?? visionJointsToWorldLandmarks(frame),
      });
    }

    frameCoverageRef.current = {
      totalFrames: rawFrames.length,
      framesWithReferencePoint: pointsRef.current.length,
    };

    const checkpoints = buildCheckpoints();
    const crossing = checkpoints ? detectSprintCrossings(pointsRef.current, { checkpoints }) : null;
    if (crossing) {
      manuallyTimedRef.current = false;
      finishWithResult(crossing);
    } else {
      manualStartRef.current = null;
      setManualStartTime(null);
      changeStep("manual");
    }
  }

  function finishWithResult(sprintResult: SprintResult) {
    changeStep("review");
    setResult(sprintResult);
    setTrust(
      crossingTrustScore({
        likelyGlitch: sprintResult.likelyGlitch,
        ...frameCoverageRef.current,
        crossingFrameGapsMs: sprintResult.crossingFrameGapsMs,
        totalElapsedSeconds: sprintResult.totalElapsedSeconds,
        manuallyTimed: manuallyTimedRef.current,
      }),
    );
    setFaults(
      cameraAngle
        ? detectSprintFaults(framesRef.current, cameraAngle, undefined, thresholds ?? DEFAULT_SKILL_FAULT_THRESHOLDS)
        : [],
    );
  }

  function markManualStart() {
    const t = manualVideoRef.current?.currentTime;
    if (t == null) return;
    manualStartRef.current = t;
    setManualStartTime(t);
  }

  function markManualFinish() {
    const finishTime = manualVideoRef.current?.currentTime;
    const startTime = manualStartRef.current;
    if (finishTime == null || startTime == null) return;
    const checkpoints = buildCheckpoints();
    if (!checkpoints) return;
    manuallyTimedRef.current = true;
    const manualResult = buildManualResult(startTime, finishTime, checkpoints);
    if (!manualResult) {
      toast.error("Finish must be after start -- scrub back and try again");
      return;
    }
    finishWithResult(manualResult);
  }

  function retry() {
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    recordedBlobRef.current = null;
    setSaveClipForCoach(false);
    setFavoriteClip(false);
    resetCheckpoints();
    setResult(null);
    setTrust(null);
    setFaults([]);
    setSavedToProfile(false);
    setError(null);
    manualStartRef.current = null;
    setManualStartTime(null);
    changeStep("calibrate");
  }

  const saveMutation = async () => {
    if (!result) return;
    setSaving(true);
    try {
      let uploadedVideoUrl: string | null = null;
      if (saveClipForCoach && recordedBlobRef.current) {
        let videoToUpload: Blob = recordedBlobRef.current;
        if (framesRef.current.length > 0) {
          try {
            let elapsedMs = 0;
            const checkpointMarkers: OverlayRepMarker[] = result.splits.map((split) => {
              elapsedMs += split.elapsedSeconds * 1000;
              const isFinish = split === result.splits[result.splits.length - 1];
              return {
                startMs: elapsedMs,
                label: `${isFinish ? "FINISH" : `CP ${split.toCheckpoint}`} · ${(elapsedMs / 1000).toFixed(2)}s`,
              };
            });
            videoToUpload = await burnTrackingOverlay(
              recordedBlobRef.current,
              framesRef.current,
              HIP_INDICES,
              checkpointMarkers,
            );
          } catch {
            videoToUpload = recordedBlobRef.current;
          }
        }
        const formData = new FormData();
        formData.append("video", videoToUpload, videoFilenameForBlob(videoToUpload, "skill-clip"));
        const uploadRes = await apiRequest("POST", "/api/athlete/skill-video", formData);
        uploadedVideoUrl = (await uploadRes.json()).url;
      }
      await apiRequest("POST", "/api/athlete/skill-session-logs", {
        skillAssignmentId,
        skillProgramDayId,
        skillProgramExerciseId,
        trackingLevel: "sprint",
        // ARC-1 -- the normalized confidence column both capture tracks now
        // share (see skillSessionLogs.trustScorePct's own schema comment).
        // Null rather than a made-up number when the score couldn't be
        // computed, same "no number beats a fake-confident one" convention
        // the rest of this pipeline follows.
        trustScorePct: trust?.score ?? null,
        elapsedSeconds: result.totalElapsedSeconds,
        distanceYards: result.totalDistanceYards || null,
        presetId,
        cameraAngle,
        faults,
        videoUrl: uploadedVideoUrl,
        videoFavorited: uploadedVideoUrl ? favoriteClip : false,
        date,
        setNumber,
      });
      toast.success("Sprint saved");
      qc.invalidateQueries({ queryKey: ["/api/athlete/skill-day", skillAssignmentId, skillProgramDayId] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Could not save sprint session");
    } finally {
      setSaving(false);
    }
  };

  const looksLikeFortyYard = (result?.totalDistanceYards ?? 0) >= 35 && (result?.totalDistanceYards ?? 0) <= 45;

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

  const showsCamera = step === "calibrate" || step === "capture";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName={showsCamera ? "bg-transparent backdrop-blur-none" : undefined}
        className={cn(
          showsCamera
            ? "inset-0 top-0 left-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-transparent backdrop-blur-none p-0 overflow-hidden [&>button]:hidden"
            : "max-w-lg",
        )}
      >
        {!showsCamera && (
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-teal-400" />
              {drillName}
            </DialogTitle>
          </DialogHeader>
        )}

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

        {showsCamera && (
          <div className="relative h-full w-full">
            <div ref={containerRef} className="absolute inset-0" style={{ background: "transparent" }}>
              <AvCameraChrome containerRef={containerRef} active={showsCamera} />
              <button
                type="button"
                aria-label="Close"
                onClick={() => onOpenChange(false)}
                className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
              >
                <X className="h-5 w-5" />
              </button>

              <canvas
                ref={overlayCanvasRef}
                onClick={handleOverlayClick}
                className={cn("absolute inset-0 h-full w-full", step === "calibrate" && "cursor-crosshair")}
              />

              {recording && (
                <div className="absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-sm font-bold text-teal-400 backdrop-blur-sm">
                  Recording
                </div>
              )}

              {step === "calibrate" && (
                <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md bg-black/60 px-3 py-2 text-center text-sm text-white backdrop-blur-sm">
                  Make sure your whole body will be in frame during the run.
                </div>
              )}

              {error && (
                <div className="absolute inset-x-4 bottom-24 flex items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-sm text-white">
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
            </div>

            <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
              {step === "calibrate" && (
                <>
                  <RadioChipGroup
                    label="Drill"
                    options={SPRINT_PRESETS.map((p) => p.label)}
                    value={preset.label}
                    onChange={(label) => {
                      const next = SPRINT_PRESETS.find((p) => p.label === label);
                      if (next) selectPreset(next);
                    }}
                    className="text-white"
                  />
                  <p className="text-center text-sm text-white">
                    {preset.tapCount === 3 ? (
                      <>
                        Tap the screen at <strong>center</strong>, then each <strong>cone</strong> in run order (
                        {checkpointCount}/3 marked).
                      </>
                    ) : preset.tapCount === 1 ? (
                      <>
                        Tap the screen at the <strong>start/finish line</strong> ({checkpointCount}/1 marked).
                      </>
                    ) : (
                      <>
                        Tap the screen where the <strong>start line</strong> is, then where the{" "}
                        <strong>finish line</strong> is ({checkpointCount}/2 marked).
                      </>
                    )}
                  </p>
                  <div className="flex items-end gap-2">
                    {preset.id === "custom" && (
                      <div className="flex-1 space-y-1.5">
                        <Label className="text-white">Distance (yards)</Label>
                        <Input type="number" value={distanceYards} onChange={(e) => setDistanceYards(e.target.value)} />
                      </div>
                    )}
                    <Button variant="outline" onClick={resetCheckpoints} disabled={checkpointCount === 0}>
                      <RotateCcw className="h-4 w-4" />
                      Reset
                    </Button>
                  </div>
                  <Button
                    size="lg"
                    disabled={
                      checkpointCount < preset.tapCount ||
                      (preset.tapCount === 2 && (Number(distanceYards) || 0) <= 0) ||
                      !supported
                    }
                    onClick={startCapture}
                  >
                    <Play className="h-4 w-4" />
                    Start Recording
                  </Button>
                </>
              )}
              {step === "capture" && (
                <div className="flex gap-3">
                  <Button size="lg" variant="secondary" className="flex-1" onClick={cancelCapture}>
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                  <Button size="lg" className="flex-1" onClick={stopCaptureAndAnalyze} disabled={!recording}>
                    <Square className="h-4 w-4" />
                    Stop Recording
                  </Button>
                </div>
              )}
              {(step === "calibrate" || step === "capture") && diagLog.length > 0 && (
                <p className="truncate text-center text-[10px] text-white/40">{diagLog[diagLog.length - 1]}</p>
              )}
            </div>
          </div>
        )}

        {step === "analyzing" && (
          <div className="space-y-4 py-6 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
            <p className="text-sm text-muted-foreground">
              Analyzing recording -- {analyzedFrames} frames processed so far…
            </p>
            <Button variant="outline" size="sm" onClick={cancelAnalysis}>
              <XCircle className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        )}

        {step === "manual" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Couldn't auto-detect a clean checkpoint crossing from this take. Scrub the clip below and mark Start
                and Finish by hand -- the time will still count.
              </p>
            </div>
            {videoUrl && (
              <div className="overflow-hidden rounded-md bg-black">
                <video ref={manualVideoRef} src={videoUrl} playsInline controls className="w-full" />
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={markManualStart}>
                <Flag className="h-4 w-4" />
                Mark Start
              </Button>
              <Button className="flex-1" onClick={markManualFinish} disabled={manualStartTime == null}>
                <Flag className="h-4 w-4" />
                Mark Finish
              </Button>
            </div>
            {manualStartTime != null && (
              <p className="text-center text-xs text-muted-foreground">
                Start marked at {manualStartTime.toFixed(2)}s -- scrub to the finish and tap Mark Finish.
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={retry}>
                <RotateCcw className="h-4 w-4" />
                Retry Take
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "review" && result && (
          <div className="space-y-4">
            {videoUrl && (
              <div className="relative overflow-hidden rounded-md bg-black">
                <video ref={reviewVideoRef} src={videoUrl} playsInline controls className="w-full" />
              </div>
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

            {result.likelyGlitch && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                This time looks faster than any human has ever run -- almost certainly a tracking glitch,
                not a real split. Recommend retaking before saving.
              </div>
            )}

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
                <Checkbox checked={saveClipForCoach} onCheckedChange={(c) => setSaveClipForCoach(c === true)} />
                <span>
                  Save this clip so my coach can review it
                  <span className="block text-xs text-muted-foreground">
                    Off by default -- only the numbers above are saved unless you turn this on.
                  </span>
                </span>
              </label>
            )}
            {videoUrl && saveClipForCoach && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={favoriteClip} onCheckedChange={(c) => setFavoriteClip(c === true)} />
                <span>
                  Never auto-delete this clip
                  <span className="block text-xs text-muted-foreground">
                    Your plan only keeps a limited number of saved clips per drill -- favoriting
                    this one keeps it forever, even once older clips start rolling off.
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
