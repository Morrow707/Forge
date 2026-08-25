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
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { useArBodyTracking } from "@/lib/use-ar-body-tracking";
import { arJointsToWorldLandmarks } from "@/lib/ar-body-landmarks";
import { startArRecording, stopArRecording } from "@/lib/native-ar-preview";
import {
  analyzeMechanics,
  detectMechanicsFaults,
  type MechanicsCameraAngle,
  type MechanicsFrame,
  type MechanicsMode,
  type MechanicsResult,
  type MechanicsFault,
} from "@/lib/mechanics-tracking";
import {
  DEFAULT_SKILL_FAULT_THRESHOLDS,
  type SkillFaultThresholds,
} from "@shared/skill-fault-thresholds";
import { toast } from "sonner";
import { AlertTriangle, Play, Square, RotateCcw, Check, Activity } from "lucide-react";
import { SuggestedCorrective } from "@/components/suggested-corrective";
import { videoFilenameForBlob } from "@/lib/video-recording";

type Step = "warning" | "capture" | "review";

/** ARKit-native twin of mechanics-tracker-dialog.tsx -- same warning/
 * capture/review flow and the exact same analyzeMechanics/
 * detectMechanicsFaults scoring (mechanics-tracking.ts already operates
 * purely on world-space MechanicsFrame[], no 2D landmarks anywhere in it,
 * so this needed zero changes to the math, unlike assessOverheadSquat).
 *
 * One real difference from the MediaPipe version's review step: that one
 * redraws a 2D skeleton over the saved clip by matching each frame's
 * timestamp to a stored 2D landmark set. There's no equivalent here -- the
 * ARKit bridge only ever produces world-space joints, and the live
 * skeleton during capture is rendered natively into the AR scene itself
 * (see ArBarTrackerDialog's own comment), not something this side can ask
 * to redraw after the fact onto a flat recorded video. Review here shows
 * the same numbers/faults panel, just without a skeleton-scrub overlay on
 * the clip. */
export function ArMechanicsTrackerDialog({
  open,
  onOpenChange,
  drillName,
  mode,
  actionLabel: actionLabelProp,
  skillAssignmentId,
  skillProgramDayId,
  skillProgramExerciseId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drillName: string;
  mode: MechanicsMode;
  actionLabel?: string;
  skillAssignmentId: number;
  skillProgramDayId: number;
  skillProgramExerciseId: number;
}) {
  const { containerRef, frame, error, supported, supportError, cameraPermission, diagLog } = useArBodyTracking(open);

  const framesRef = useRef<MechanicsFrame[]>([]);
  const captureStartRef = useRef(0);
  const recordingRef = useRef(false);
  const recordedBlobRef = useRef<Blob | null>(null);

  const stepRef = useRef<Step>("warning");
  const [step, setStepState] = useState<Step>("warning");
  function changeStep(next: Step) {
    stepRef.current = next;
    setStepState(next);
  }
  const [cameraAngle, setCameraAngle] = useState<MechanicsCameraAngle | null>(null);
  const [recording, setRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [result, setResult] = useState<MechanicsResult | null>(null);
  const [faults, setFaults] = useState<MechanicsFault[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveClipForCoach, setSaveClipForCoach] = useState(false);
  const [favoriteClip, setFavoriteClip] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  const { data: thresholds } = useQuery<SkillFaultThresholds>({
    queryKey: ["/api/athlete/skill-fault-thresholds", skillAssignmentId],
    queryFn: () => getJson(`/api/athlete/skill-fault-thresholds?skillAssignmentId=${skillAssignmentId}`),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    changeStep("warning");
    setCameraAngle(null);
    setRecording(false);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setResult(null);
    setFaults([]);
    setSaveClipForCoach(false);
    setFavoriteClip(false);
    setRecordError(null);
    framesRef.current = [];
    recordedBlobRef.current = null;
    recordingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!frame || !frame.tracked || !recordingRef.current) return;
    framesRef.current.push({ t: frame.timestamp - captureStartRef.current, worldLandmarks: arJointsToWorldLandmarks(frame.joints) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  function startRecording() {
    framesRef.current = [];
    captureStartRef.current = frame?.tracked ? frame.timestamp : 0;
    recordingRef.current = true;
    setRecording(true);
    setRecordError(null);
    startArRecording().catch((err) => {
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setRecordError(`Recording failed to start: ${detail}`);
    });
  }

  async function stopRecording() {
    recordingRef.current = false;
    setRecording(false);
    try {
      const blob = await stopArRecording();
      finishCapture(blob);
    } catch (err) {
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setRecordError(`Couldn't save the recording: ${detail}`);
    }
  }

  function finishCapture(blob: Blob) {
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

  function retry() {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setResult(null);
    setFaults([]);
    setSaveClipForCoach(false);
    setFavoriteClip(false);
    setRecordError(null);
    framesRef.current = [];
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
      });
      toast.success(`${actionLabel} saved`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save this session");
    } finally {
      setSaving(false);
    }
  }

  const actionLabel = actionLabelProp ?? (mode === "throw" ? "Throw" : "Swing");

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
            {(error || recordError) && <p className="text-sm text-destructive">{error ?? recordError}</p>}
            {supported === false && (
              <p className="text-sm text-destructive">
                ARKit tracking isn't supported on this device.{" "}
                {supportError && <span className="opacity-80">{supportError}</span>}
              </p>
            )}
            <div className="relative aspect-[9/16] overflow-hidden rounded-md bg-black">
              <div ref={containerRef} className="absolute inset-0" style={{ background: "transparent" }} />
              <div className="absolute left-2 top-2 z-10 select-text space-y-0.5 rounded-md bg-black/60 px-2 py-1 font-mono text-[9px] leading-tight text-white/80">
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
              {!recording && !frame?.tracked && (
                <div className="absolute inset-x-3 top-1/2 z-10 -translate-y-1/2 rounded-md bg-black/60 px-3 py-2 text-center text-sm text-white">
                  Step back so ARKit can lock onto your whole body
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {recording
                ? `Recording -- perform the full ${actionLabel.toLowerCase()}, then stop.`
                : `Get in frame, then start recording your ${actionLabel.toLowerCase()}.`}
            </p>
            <DialogFooter>
              {!recording ? (
                <Button onClick={startRecording} disabled={!frame?.tracked || supported === false}>
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
              <video src={videoUrl} playsInline controls className="w-full" />
            </div>

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
