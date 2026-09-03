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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { isAvPreviewPlatform } from "@/lib/native-av-preview";
import { useAvBodyTracking } from "@/lib/use-av-body-tracking";
import { visionJointsToWorldLandmarks } from "@/lib/vision-body-landmarks";
import { calibrateFromFrames, scaleWorldLandmarks } from "@/lib/pose-tracking";
import {
  analyzeMechanics,
  detectMechanicsFaults,
  type MechanicsCameraAngle,
  type MechanicsFrame,
  type MechanicsMode,
  type MechanicsResult,
  type MechanicsFault,
} from "@/lib/mechanics-tracking";
import type { Landmark } from "@mediapipe/tasks-vision";
import {
  DEFAULT_SKILL_FAULT_THRESHOLDS,
  type SkillFaultThresholds,
} from "@shared/skill-fault-thresholds";
import { toast } from "sonner";
import { AlertTriangle, Play, Square, RotateCcw, Check, Activity, XCircle } from "lucide-react";
import { SuggestedCorrective } from "@/components/suggested-corrective";
import { videoFilenameForBlob } from "@/lib/video-recording";

type Step = "warning" | "capture" | "analyzing" | "review";

const MIN_TRACKED_FRAMES = 6;

/** AVFoundation + Vision twin of ar-mechanics-tracker-dialog.tsx (which stays completely
 * untouched, per the plan's staged-rollout scope) -- the third real tracker on the new
 * pipeline, for throw mode specifically (baseball/football pitching/throwing mechanics). No
 * implement to follow -- arm-slot/release-point/wrist-speed are all bare-arm measurements --
 * so this needed no new native object-tracking work, same low-risk pattern as Jump.
 *
 * One real difference from the ARKit version, which this dialog's own analysis can't just
 * inherit: the ARKit dialog applies NO height calibration at all -- it accepts ARKit/
 * MediaPipe's population-average real-meters approximation as good enough for every metric,
 * calibrated or not. That's a legitimate choice for ARKit (an uncorrected worldLandmarks
 * reading is still roughly real-world scale), but Vision's pixel-space worldLandmarks (see
 * vision-body-landmarks.ts) have no metric meaning at all without calibration -- see
 * computePixelToMeterScale's own comment. mechanics-tracking.ts's metrics split cleanly here:
 * angle/percentage/timing-based ones (hip-shoulder separation, hip rotation, arm slot,
 * sequencing, weight transfer %, set-point pause, knee-bend depth) are scale-invariant and
 * stay valid regardless -- only peakWristSpeedMps/strideLengthM/releaseHeightM are genuinely
 * scale-dependent, and those three specifically get nulled out (not silently reported as
 * meaningless pixel-derived numbers) whenever this take couldn't calibrate, rather than
 * discarding the whole capture the way av-jump-tracker-dialog.tsx has to (jump's entire value
 * is a scale-dependent height number; mechanics has a much richer scale-invariant core).
 *
 * Camera/recording/analysis plumbing comes from useAvBodyTracking (shared with every other AV
 * tracker dialog) -- what's left here is purely mechanics-specific: the camera-angle warning
 * step, the too-short-capture gate, calibration application, analyzeMechanics, and the
 * review/save flow. */
export function AvMechanicsTrackerDialog({
  open,
  onOpenChange,
  drillName,
  mode,
  actionLabel: actionLabelProp,
  heightIn,
  skillAssignmentId,
  skillProgramDayId,
  skillProgramExerciseId,
  date,
  setNumber,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drillName: string;
  mode: MechanicsMode;
  actionLabel?: string;
  heightIn?: number | null;
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
  const recordedBlobRef = useRef<Blob | null>(null);

  const stepRef = useRef<Step>("warning");
  const [step, setStepState] = useState<Step>("warning");
  function changeStep(next: Step) {
    stepRef.current = next;
    setStepState(next);
  }
  const [cameraAngle, setCameraAngle] = useState<MechanicsCameraAngle | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [result, setResult] = useState<MechanicsResult | null>(null);
  const [uncalibrated, setUncalibrated] = useState(false);
  const [faults, setFaults] = useState<MechanicsFault[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveClipForCoach, setSaveClipForCoach] = useState(false);
  const [favoriteClip, setFavoriteClip] = useState(false);

  const {
    containerRef,
    supported,
    supportError,
    error,
    setError,
    diagLog,
    recording,
    analyzing,
    analyzedFrames,
    startRecording,
    stopRecordingAndAnalyze,
    cancelAnalysis,
  } = useAvBodyTracking(open && step === "capture");

  const { data: thresholds } = useQuery<SkillFaultThresholds>({
    queryKey: ["/api/athlete/skill-fault-thresholds", skillAssignmentId],
    queryFn: () => getJson(`/api/athlete/skill-fault-thresholds?skillAssignmentId=${skillAssignmentId}`),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    changeStep("warning");
    setCameraAngle(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setResult(null);
    setUncalibrated(false);
    setFaults([]);
    setSaveClipForCoach(false);
    setFavoriteClip(false);
    recordedBlobRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleStop() {
    changeStep("analyzing");
    const result = await stopRecordingAndAnalyze();
    if (!result) {
      // Error/cancellation already reported by the hook -- back to capture so the coach can
      // just try again rather than getting stuck on a dead-end step.
      changeStep("capture");
      return;
    }
    finishCapture(
      result.blob,
      result.rawFrames.map((f) => ({ t: f.timestamp * 1000, worldLandmarks: visionJointsToWorldLandmarks(f) })),
    );
  }

  function finishCapture(blob: Blob, rawFrames: { t: number; worldLandmarks: Landmark[] }[]) {
    if (rawFrames.length < MIN_TRACKED_FRAMES) {
      toast.error("That capture was too short to analyze -- try again with the full motion in frame.");
      changeStep("capture");
      return;
    }

    const scaleFactor = calibrateFromFrames(rawFrames, heightIn);
    const frames: MechanicsFrame[] = rawFrames.map((f) => ({
      t: f.t,
      worldLandmarks: scaleFactor != null ? scaleWorldLandmarks(f.worldLandmarks, scaleFactor) : f.worldLandmarks,
    }));

    const effectiveThresholds = thresholds ?? DEFAULT_SKILL_FAULT_THRESHOLDS;
    const mechanicsResult = analyzeMechanics(frames, mode, effectiveThresholds);
    if (scaleFactor == null) {
      // Only the genuinely scale-dependent metrics get nulled -- see this
      // file's own comment on why the rest (angles, percentages, timing)
      // stay valid uncalibrated.
      mechanicsResult.peakWristSpeedMps = null;
      mechanicsResult.strideLengthM = null;
      mechanicsResult.releaseHeightM = null;
    }
    setUncalibrated(scaleFactor == null);
    setResult(mechanicsResult);
    setFaults(cameraAngle ? detectMechanicsFaults(mechanicsResult, cameraAngle, effectiveThresholds) : []);
    recordedBlobRef.current = blob;
    setVideoUrl(URL.createObjectURL(blob));
    changeStep("review");
  }

  function retry() {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setResult(null);
    setUncalibrated(false);
    setFaults([]);
    setSaveClipForCoach(false);
    setFavoriteClip(false);
    setError(null);
    recordedBlobRef.current = null;
    changeStep("capture");
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    try {
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
        peakWristSpeedMps: result.peakWristSpeedMps,
        strideLengthM: result.strideLengthM,
        elbowExtensionDeg: result.elbowExtensionDeg,
        releaseHeightM: result.releaseHeightM,
        setPointPauseSeconds: result.setPointPauseSeconds,
        kneeBendDepthDeg: result.kneeBendDepthDeg,
        videoUrl: uploadedVideoUrl,
        videoFavorited: uploadedVideoUrl ? favoriteClip : false,
        date,
        setNumber,
      });
      toast.success(`${actionLabel} saved`);
      qc.invalidateQueries({ queryKey: ["/api/athlete/skill-day", skillAssignmentId, skillProgramDayId] });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save this session");
    } finally {
      setSaving(false);
    }
  }

  const actionLabel = actionLabelProp ?? (mode === "throw" ? "Throw" : "Swing");
  const showsCamera = step === "capture";

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

        {(step === "capture" || step === "analyzing") && (
          <div className="space-y-3">
            {error && <p className="text-sm text-destructive">{error}</p>}
            {supported === false && (
              <p className="text-sm text-destructive">
                Camera tracking isn't supported on this device.{" "}
                {supportError && <span className="opacity-80">{supportError}</span>}
              </p>
            )}
            {!heightIn && (
              <p className="text-sm text-amber-500">
                Add your height in your profile to get speed/distance numbers from this camera.
              </p>
            )}
            <div className="relative aspect-[9/16] overflow-hidden rounded-md bg-black">
              {showsCamera && isAvPreviewPlatform() && (
                <div ref={containerRef} className="absolute inset-0" style={{ background: "transparent" }} />
              )}
              {showsCamera && (
                <div className="absolute left-2 top-2 z-10 select-text space-y-0.5 rounded-md bg-black/60 px-2 py-1 font-mono text-[9px] leading-tight text-white/80">
                  {diagLog.slice(-3).map((line, i) => (
                    <div key={i} className="text-white/60">
                      {line}
                    </div>
                  ))}
                </div>
              )}
              {step === "analyzing" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                  <p className="text-sm text-white">Analyzing -- {analyzedFrames} frames processed…</p>
                  <Button variant="outline" size="sm" onClick={cancelAnalysis}>
                    <XCircle className="h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {recording
                ? "Recording"
                : step === "analyzing"
                  ? "Hold on while the recording is analyzed…"
                  : `Get in frame, then start recording your ${actionLabel.toLowerCase()}.`}
            </p>
            <DialogFooter>
              {step === "capture" && !recording && (
                <Button onClick={startRecording} disabled={supported === false}>
                  <Play className="h-4 w-4" />
                  Start Recording
                </Button>
              )}
              {step === "capture" && recording && (
                <Button variant="secondary" onClick={handleStop}>
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
              <video src={videoUrl} playsInline controls className="w-full" />
            </div>

            {uncalibrated && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Couldn't calibrate real-world scale this take -- speed and distance numbers aren't shown, but
                angles, sequencing, and timing below are still good.
              </div>
            )}

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
              {result.peakWristSpeedMps != null && (
                <div>
                  <p className="text-xl font-bold">{result.peakWristSpeedMps} m/s</p>
                  <p className="text-xs text-muted-foreground">
                    Peak wrist speed
                    <span className="block text-[10px] normal-case">(proxy for release velocity)</span>
                  </p>
                </div>
              )}
              {result.strideLengthM != null && (
                <div>
                  <p className="text-xl font-bold">{result.strideLengthM} m</p>
                  <p className="text-xs text-muted-foreground">Stride length</p>
                </div>
              )}
              {result.elbowExtensionDeg != null && (
                <div>
                  <p className="text-xl font-bold">{result.elbowExtensionDeg}°</p>
                  <p className="text-xs text-muted-foreground">Elbow extension at release</p>
                </div>
              )}
              {result.releaseHeightM != null && (
                <div>
                  <p className="text-xl font-bold">{result.releaseHeightM} m</p>
                  <p className="text-xs text-muted-foreground">Release height above hips</p>
                </div>
              )}
              {result.setPointPauseSeconds != null && (
                <div>
                  <p className="text-xl font-bold">{result.setPointPauseSeconds}s</p>
                  <p className="text-xs text-muted-foreground">Set-point pause</p>
                </div>
              )}
              {result.kneeBendDepthDeg != null && (
                <div>
                  <p className="text-xl font-bold">{result.kneeBendDepthDeg}°</p>
                  <p className="text-xs text-muted-foreground">Knee-bend load depth</p>
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
            {saveClipForCoach && (
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
