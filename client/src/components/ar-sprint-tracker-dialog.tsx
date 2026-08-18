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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { apiRequest, getJson } from "@/lib/queryClient";
import { POSE_LANDMARKS, type PoseFrame } from "@/lib/pose-tracking";
import {
  isArBodyTrackingSupported,
  startArPreview,
  stopArPreview,
  updateArPreviewRect,
  startArRecording,
  stopArRecording,
  onBodyTracking,
  onSessionError,
  pollDiagnosticLog,
  setArCameraActive,
  framingHint,
  type BodyTrackingFrame,
} from "@/lib/native-ar-preview";
import { arJointsToWorldLandmarks } from "@/lib/ar-body-landmarks";
import {
  detectSprintCrossings,
  detectSprintFaults,
  checkpointsForShuttleTaps,
  SPRINT_PRESETS,
  type SprintCameraAngle,
  type SprintPoint,
  type SprintResult,
  type SprintFault,
  type SprintCheckpoint,
  type SprintPreset,
} from "@/lib/sprint-tracking";
import { RadioChipGroup } from "@/components/filter-chip-group";
import { DEFAULT_SKILL_FAULT_THRESHOLDS, type SkillFaultThresholds } from "@shared/skill-fault-thresholds";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { toast } from "sonner";
import { AlertTriangle, Play, Square, RotateCcw, Check, Timer, Trophy, X } from "lucide-react";
import { SuggestedCorrective } from "@/components/suggested-corrective";
import { videoFilenameForBlob } from "@/lib/video-recording";
import { burnTrackingOverlay, type OverlayRepMarker } from "@/lib/video-overlay";

type Step = "warning" | "calibrate" | "capture" | "review";

const CHECKPOINT_COLOR = "#facc15";
const HIP_INDICES = [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.RIGHT_HIP];

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

// ARKit has no 2D image-space landmarks (only real-world 3D joints -- see
// ar-body-landmarks.ts's own comment), but sprint-tracking.ts's checkpoint-
// crossing model and burnTrackingOverlay's saved-clip trail both need a
// screen-space point to compare against a tapped checkpoint / draw a pixel
// trail. ArCameraPreviewPlugin.swift now projects the tracked hip root into
// normalized on-screen space every frame (hipScreenX/Y) specifically for
// this -- this just drops that one point into both hip slots of an
// otherwise-empty landmark array, so both left/right hip indices resolve to
// the same (only available) point and everything downstream that expects a
// PoseFrame's `landmarks` shape works unmodified.
function sparseHipLandmarks(screenX: number, screenY: number): NormalizedLandmark[] {
  const landmarks: NormalizedLandmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  landmarks[POSE_LANDMARKS.LEFT_HIP] = { x: screenX, y: screenY, z: 0, visibility: 1 };
  landmarks[POSE_LANDMARKS.RIGHT_HIP] = { x: screenX, y: screenY, z: 0, visibility: 1 };
  return landmarks;
}

/** ARKit-native sprint/agility timing -- the second tracker mode converted
 * off MediaPipe (see ArJumpTrackerDialog's own comment for the first).
 * Sprint was next in priority for the same reason jump was first: a
 * checkpoint-crossing sprint needs a single tracked reference point and no
 * implement, nothing bar-path/implement tracking (still MediaPipe-only)
 * would be needed for.
 *
 * The one real wrinkle converting this mode specifically: sprint-tracking.ts's
 * whole model is built on normalized SCREEN-space x position crossing a
 * tapped checkpoint's screen-space x (see that file's own comment on why --
 * a sprint needs discrete crossing events, not continuous real-world
 * distance). ARKit's body bridge only ever produces real-world 3D joints,
 * with no screen-space equivalent -- so ArCameraPreviewPlugin.swift now also
 * projects the tracked hip root through the camera's own projection matrix
 * (frame.camera.projectPoint, the same math SceneKit already does implicitly
 * to draw the live skeleton) and emits it as hipScreenX/hipScreenY. That's
 * the one new native capability this mode needed; detectSprintFaults itself
 * needed no changes at all -- it was already fully world-space (see its own
 * comment), unlike jump mode's valgus check which needed reworking. */
export function ArSprintTrackerDialog({
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
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const reviewVideoRef = useRef<HTMLVideoElement>(null);
  const checkpointsRef = useRef<number[]>([]);
  const pointsRef = useRef<SprintPoint[]>([]);
  const framesRef = useRef<PoseFrame[]>([]);
  const captureStartRef = useRef(0);
  const stepRef = useRef<Step>("warning");
  const recordedBlobRef = useRef<Blob | null>(null);

  const [step, setStepState] = useState<Step>("warning");
  function changeStep(next: Step) {
    stepRef.current = next;
    setStepState(next);
  }
  const [cameraAngle, setCameraAngle] = useState<SprintCameraAngle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [supportError, setSupportError] = useState<string | undefined>(undefined);
  const [cameraPermission, setCameraPermission] = useState<string | undefined>(undefined);
  const [diagLog, setDiagLog] = useState<string[]>([]);
  const [frame, setFrame] = useState<BodyTrackingFrame | null>(null);
  const [checkpointCount, setCheckpointCount] = useState(0);
  const [presetId, setPresetId] = useState("40yd");
  const preset: SprintPreset = SPRINT_PRESETS.find((p) => p.id === presetId) ?? SPRINT_PRESETS[2];
  const [distanceYards, setDistanceYards] = useState("40");
  const [result, setResult] = useState<SprintResult | null>(null);
  const [faults, setFaults] = useState<SprintFault[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingToProfile, setSavingToProfile] = useState(false);
  const [savedToProfile, setSavedToProfile] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [saveClipForCoach, setSaveClipForCoach] = useState(false);

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
    setDiagLog([]);
    isArBodyTrackingSupported().then(({ supported: isSupported, error: supportErr, cameraPermission: perm }) => {
      setSupported(isSupported);
      setSupportError(supportErr);
      setCameraPermission(perm);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Same camera-gating as the MediaPipe original: no point starting the AR
  // session before the athlete's even picked an angle, and it stays live
  // across calibrate<->capture (a Cancel back to calibrate doesn't tear it
  // down) since both need the same live view.
  useEffect(() => {
    if (!open || step === "warning" || step === "review") {
      setArCameraActive(false);
      void stopArPreview();
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    let cancelled = false;
    setArCameraActive(true);
    startArPreview(rect).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not start camera");
    });
    function onResize() {
      const r = containerRef.current?.getBoundingClientRect();
      if (r) void updateArPreviewRect(r);
      redrawCheckpointOverlay();
    }
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      setArCameraActive(false);
      window.removeEventListener("resize", onResize);
      void stopArPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    return onBodyTracking(setFrame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return onSessionError(setError);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return pollDiagnosticLog(setDiagLog);
  }, [open]);

  useEffect(() => {
    redrawCheckpointOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, checkpointCount]);

  useEffect(() => {
    if (!frame || !frame.tracked || stepRef.current !== "capture") return;
    const elapsed = frame.timestamp - captureStartRef.current;
    pointsRef.current.push({ t: elapsed, x: frame.hipScreenX });
    framesRef.current.push({
      t: elapsed,
      landmarks: sparseHipLandmarks(frame.hipScreenX, frame.hipScreenY),
      worldLandmarks: arJointsToWorldLandmarks(frame.joints),
    });

    const checkpoints = buildCheckpoints();
    const crossing = checkpoints ? detectSprintCrossings(pointsRef.current, { checkpoints }) : null;
    if (crossing) finishCapture(crossing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

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

  // See sprint-tracker-dialog.tsx's own identical helper -- same reasoning,
  // mirrored here since this dialog keeps its own checkpointsRef/preset
  // state rather than sharing state across the two dialogs.
  function buildCheckpoints(): SprintCheckpoint[] | null {
    const taps = checkpointsRef.current;
    if (taps.length < preset.tapCount) return null;
    if (preset.tapCount === 3) {
      return checkpointsForShuttleTaps([taps[0], taps[1], taps[2]]);
    }
    const distanceNum = Number(distanceYards) || 0;
    if (distanceNum <= 0) return null;
    return [{ x: taps[0] }, { x: taps[1], segmentDistanceYards: distanceNum }];
  }

  function startCapture() {
    pointsRef.current = [];
    framesRef.current = [];
    // ARKit's own clock (frame.timestamp), not performance.now() -- unlike
    // the MediaPipe original's JS-driven rAF loop, every point/frame during
    // capture comes from onBodyTracking events, all on this one clock, and
    // this needs to line up with 0 = the moment startArRecording() (right
    // below) starts the saved clip's own timeline, for burnTrackingOverlay's
    // trail to land on the right video frame later. Falls back to 0 (not
    // performance.now(), a different clock entirely) on the rare chance
    // nothing's tracked yet the instant Start Capture is tapped -- still
    // internally consistent, just not clip-aligned that one time.
    captureStartRef.current = frame?.tracked ? frame.timestamp : 0;
    changeStep("capture");
    // Always attempted, same as the MediaPipe original's unconditional
    // MediaRecorder.start() -- whether the clip actually gets uploaded is a
    // separate, later decision (the "save clip for coach" checkbox at
    // review). Best-effort: tracking itself doesn't depend on this.
    startArRecording().catch(() => {});
  }

  async function finishCapture(crossing: SprintResult) {
    // Set first so a body-tracking frame that arrives while stopArRecording
    // is still resolving can't re-enter this (frame-consumption effect
    // above gates on stepRef.current === "capture").
    changeStep("review");
    setResult(crossing);
    setFaults(
      cameraAngle
        ? detectSprintFaults(framesRef.current, cameraAngle, undefined, thresholds ?? DEFAULT_SKILL_FAULT_THRESHOLDS)
        : [],
    );
    try {
      const blob = await stopArRecording();
      recordedBlobRef.current = blob;
      setVideoUrl(URL.createObjectURL(blob));
    } catch {
      // No clip this set -- the numbers above are still good.
    }
  }

  function retry() {
    if (stepRef.current === "capture") stopArRecording().catch(() => {});
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
      let uploadedVideoUrl: string | null = null;
      if (saveClipForCoach && recordedBlobRef.current) {
        let videoToUpload: Blob = recordedBlobRef.current;
        if (framesRef.current.length > 0) {
          try {
            let elapsedMs = 0;
            const checkpointMarkers: OverlayRepMarker[] = result.splits.map((split) => {
              elapsedMs += split.elapsedSeconds * 1000;
              // See sprint-tracker-dialog.tsx's identical comment -- the
              // FINISH is always the last split, not tied to the raw tap
              // count (a 3-tap shuttle expands to 4 checkpoints).
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
        elapsedSeconds: result.totalElapsedSeconds,
        distanceYards: result.totalDistanceYards || null,
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

  // A 5-10-5 shuttle's total (20yd across 3 legs) never lands in this
  // range, so this naturally never offers to save a shuttle time as a
  // 40-yard dash -- same reasoning as sprint-tracker-dialog.tsx's own.
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
            ? "inset-0 top-0 left-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-transparent p-0 overflow-hidden [&>button]:hidden"
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

              {/* Permanent, always-on diagnostic readout -- see the same
                  strip's own comment in ar-jump-tracker-dialog.tsx. */}
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

              <canvas
                ref={overlayCanvasRef}
                onClick={handleOverlayClick}
                className={cn("absolute inset-0 h-full w-full", step === "calibrate" && "cursor-crosshair")}
              />

              {step === "capture" && (
                <div className="absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-sm font-bold text-teal-400 backdrop-blur-sm">
                  Recording -- run through {preset.tapCount === 3 ? "all three markers" : "both markers"} now
                </div>
              )}

              {step === "calibrate" && (!frame || !frame.tracked) && (
                <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md bg-black/60 px-3 py-2 text-center text-sm text-white backdrop-blur-sm">
                  Step into frame so tracking can lock on before you tap markers
                </div>
              )}
              {step === "calibrate" && frame?.tracked && framingHint(frame.distanceMeters) !== "good" && (
                <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md bg-amber-500/80 px-3 py-2 text-center text-sm font-semibold text-black">
                  {framingHint(frame.distanceMeters) === "too close" ? "Step back" : "Come closer"}
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
            </div>

            <div className="flex shrink-0 flex-col gap-2 bg-black/70 px-3 py-4 backdrop-blur-sm">
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
                    Start Capture
                  </Button>
                </>
              )}
              {step === "capture" && (
                <Button size="lg" variant="secondary" onClick={retry}>
                  <Square className="h-4 w-4" />
                  Cancel
                </Button>
              )}
            </div>
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
