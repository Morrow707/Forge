import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ApiError, uploadWithProgress } from "@/lib/queryClient";
import { toast } from "sonner";
import { Circle, Square, AlertTriangle, X } from "lucide-react";
import {
  isArBodyTrackingSupported,
  startArPreview,
  stopArPreview,
  updateArPreviewRect,
  startArRecording,
  stopArRecording,
  resetArImplementTracking,
  onBodyTracking,
  onSessionError,
  pollDiagnosticLog,
  setArCameraActive,
  framingHint,
  type BodyTrackingFrame,
  type ImplementTrackResult,
} from "@/lib/native-ar-preview";
import { arJointsToWorldLandmarks } from "@/lib/ar-body-landmarks";
import {
  POSE_LANDMARKS,
  detectFormFaults,
  worldVerticalSign,
  tiltDegreesFromPoints,
  usesSharedBarEquipment,
  assessCameraAlignment,
  guessMovementPattern,
  computeLegDriveAsymmetry,
  computeHeightScaleCorrection,
  scaleWorldLandmarks,
  type PoseFrame,
  type CameraAlignment,
} from "@/lib/pose-tracking";
import {
  summarizeTrackedSet,
  interpolateOcclusionGap,
  computeArmDriveAsymmetry,
  computeRepTrustScores,
  type RepMetrics,
  type TrackedPoint,
  type VelocitySample,
} from "@/lib/bar-tracking";
import { expectedPatternFromName } from "@/components/bar-tracker-dialog";
import { videoFilenameForBlob } from "@/lib/video-recording";

/** ARKit-native bar-path/full mode tracking -- the third and last tracker
 * mode converted off MediaPipe (see ArJumpTrackerDialog/ArSprintTrackerDialog
 * for the first two). This one was last and hardest because, unlike a jump
 * or a sprint, it needs to follow a HELD IMPLEMENT, not just a body joint --
 * see ArImplementTracker.swift for that algorithm and, specifically, for
 * why real depth (a real 3D wrist position to unproject a found pixel
 * against) replaces implement-tracking.ts's shoulder-width scale guess with
 * something categorically tighter.
 *
 * Left/right fusion here mirrors bar-tracker-dialog.tsx's own
 * leftImplementTrackerRef/rightImplementTrackerRef pattern -- weighted-
 * average each side's implement reading against that side's wrist, gated by
 * a frame-to-frame plausibility check -- with one honest simplification:
 * ARKit's body skeleton has no per-joint continuous confidence the way
 * MediaPipe's landmark.visibility does (a joint is either in this frame's
 * anchor or it isn't), so wrist confidence here is a constant 1 rather than
 * a graduated score. The implement tracker's own ramping confidence (see
 * ArImplementTracker's lockStreak) still does the real work of shifting
 * weight from "trust the wrist" to "trust the tracked implement" as a lock
 * holds, same as the MediaPipe version.
 *
 * Occlusion-gap interpolation, left/right leg- and arm-drive asymmetry, and
 * per-rep trust scores are now ported too, reusing bar-tracking.ts's own
 * functions unmodified against this dialog's own fused trace/frame history --
 * same gating rules as bar-tracker-dialog.tsx (bilateral Squat only for leg
 * drive, bilateral Push/Pull on a shared bar for arm drive).
 *
 * Still deliberately NOT ported, MediaPipe-only for now:
 * - Hands-model grip-point refinement (refineGripPoint). MediaPipe Hands has
 *   no ARKit equivalent wired up -- ARKit's own hand/wrist joint is already
 *   a real 3D anchor, not a rough 2D estimate needing refinement the way
 *   MediaPipe's is, so this is a smaller gap than it was for MediaPipe, not
 *   an equivalent one just left undone.
 *
 * One honest, smaller gap inherited by porting guessMovementPattern
 * (feeding trust-score mismatch detection) as-is: its wrist-vs-shoulder-
 * height signal reads frame.landmarks (2D image-space), which this bridge
 * never produces (see ar-body-landmarks.ts) -- knee-angle and torso-lean,
 * both already world-space, still drive most of the guess, so this mainly
 * costs some precision distinguishing overhead-press-shaped movement from
 * everything else, not the guess entirely.
 */

const MAX_PLAUSIBLE_GRIP_OFFSET_M = 0.35;
const LIVE_TILT_HISTORY_SIZE = 5;

// Flip to true to bring back the on-screen supported/perm/tracked +
// diagLog readout for a real device debugging session -- the capture
// itself (diagLog state, getDiagnosticLog() polling) always keeps
// running regardless of this flag, so no data is lost by leaving it off.
const SHOW_DIAGNOSTIC_OVERLAY = false;

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Attached to a saved video when summarizeTrackedSet couldn't produce a
// trustworthy read -- all zero/empty rather than fabricated numbers, so
// nothing downstream displays a fake velocity or rep count for a set the
// tracker genuinely couldn't parse. See stopTracking's own comment on why
// the video still gets saved and attached even here.
const EMPTY_REP_METRICS: RepMetrics = {
  peakVelocityMps: 0,
  meanVelocityMps: 0,
  concentricSeconds: 0,
  eccentricSeconds: 0,
  barPathDeviationCm: 0,
  barPathTrace: [],
  repBreakdown: [],
  formFaults: [],
  peakPowerWatts: null,
  meanPowerWatts: null,
  eccentricMeanVelocityMps: 0,
  romCm: 0,
  velocityLossPercent: null,
};

function isPlausibleVelocity(
  prev: { x: number; y: number; t: number } | null,
  next: { x: number; y: number; t: number },
): boolean {
  if (!prev) return true;
  const dt = (next.t - prev.t) / 1000;
  if (dt <= 0) return true;
  // A real barbell/dumbbell/kettlebell can't cover more than ~3m/s in any
  // direction -- same ceiling bar-tracker-dialog.tsx's own
  // MAX_PLAUSIBLE_VELOCITY_MPS uses, catching a single bad frame (tracker
  // briefly latching onto something else) before it corrupts the trace.
  const MAX_PLAUSIBLE_VELOCITY_MPS = 3;
  const dist = Math.hypot(next.x - prev.x, next.y - prev.y);
  return dist / dt <= MAX_PLAUSIBLE_VELOCITY_MPS;
}

export function ArBarTrackerDialog({
  open,
  onOpenChange,
  mode,
  exerciseName,
  movementType,
  equipment,
  laterality,
  heightIn,
  targetReps,
  loadKg,
  recordVideo,
  onCapture,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "bar_path" | "full";
  exerciseName: string;
  movementType?: string | null;
  equipment?: string | null;
  laterality?: string | null;
  heightIn?: number | null;
  targetReps?: number;
  loadKg?: number;
  recordVideo?: boolean;
  onCapture: (metrics: RepMetrics, videoUrl?: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tracking, setTracking] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [supportError, setSupportError] = useState<string | undefined>(undefined);
  const [cameraPermission, setCameraPermission] = useState<string | undefined>(undefined);
  const [diagLog, setDiagLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<BodyTrackingFrame | null>(null);
  const [recordedReps, setRecordedReps] = useState(0);
  const [liveTiltDeg, setLiveTiltDeg] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const traceRef = useRef<TrackedPoint[]>([]);
  const framesRef = useRef<PoseFrame[]>([]);
  const tiltReadingsRef = useRef<number[]>([]);
  const liveTiltHistoryRef = useRef<number[]>([]);
  const verticalSignRef = useRef<1 | -1>(1);
  const prevFusedLeftRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const prevFusedRightRef = useRef<{ x: number; y: number; t: number } | null>(null);
  // Kept apart, same reasoning as bar-tracker-dialog.tsx's own
  // leftVelocitySamplesRef -- computeArmDriveAsymmetry needs to compare
  // left against right, not a pooled/averaged trace.
  const leftVelocitySamplesRef = useRef<VelocitySample[]>([]);
  const rightVelocitySamplesRef = useRef<VelocitySample[]>([]);
  // Every timestamp where a fused reading got thrown out as implausible --
  // feeds computeRepTrustScores at Stop the same way bar-tracker-dialog.tsx's
  // rejectionEventsRef does.
  const rejectionEventsRef = useRef<number[]>([]);
  // Assessed once, right when Start Set is tapped (no separate setup/
  // countdown step here to assess it during, unlike bar-tracker-dialog.tsx),
  // and held for the whole set -- same "captured once, not recomputed
  // mid-set" reasoning as bar-tracker-dialog.tsx's own lastAlignmentReasonRef.
  const alignmentReasonRef = useRef<CameraAlignment["reason"] | null>(null);
  const trackingRef = useRef(false);
  // Same correction bar-tracker-dialog.tsx's own scaleCorrectionRef applies
  // (see computeHeightScaleCorrection's comment) -- MediaPipe's worldLandmarks
  // are scaled by a learned population-average body-proportion prior, not
  // anything measured in the actual scene, which is exactly the same
  // ambiguity a non-LiDAR ARKit body-tracking skeleton has for its own
  // individual joint-to-joint distances (the root/pelvis anchor is solid
  // visual-inertial odometry, but limb proportions still lean on a body
  // model, same category of guess). This was missing here entirely --
  // scaleCorrectionRef.current stayed permanently null on this dialog, so
  // every ARKit-tracked velocity/distance number went out with whatever
  // scale error ARKit's own body-proportion guess happened to carry for
  // this specific athlete, uncorrected. Sampled continuously from every
  // tracked frame from the moment the AR session comes up (there's no
  // separate setup/countdown step here to gate it to, unlike
  // bar-tracker-dialog.tsx) so there's already a real sample pool by the
  // time Start Set is tapped, not just whatever the single frame at that
  // instant happened to read.
  const heightCorrectionSamplesRef = useRef<number[]>([]);
  const scaleCorrectionRef = useRef<number | null>(null);

  const usesSharedBar = usesSharedBarEquipment(equipment);

  useEffect(() => {
    if (!open) return;
    setTracking(false);
    setError(null);
    setFrame(null);
    setRecordedReps(0);
    setLiveTiltDeg(null);
    traceRef.current = [];
    framesRef.current = [];
    tiltReadingsRef.current = [];
    liveTiltHistoryRef.current = [];
    verticalSignRef.current = 1;
    prevFusedLeftRef.current = null;
    prevFusedRightRef.current = null;
    leftVelocitySamplesRef.current = [];
    rightVelocitySamplesRef.current = [];
    rejectionEventsRef.current = [];
    alignmentReasonRef.current = null;
    trackingRef.current = false;
    setDiagLog([]);
    isArBodyTrackingSupported().then(({ supported: isSupported, error: supportErr, cameraPermission: perm }) => {
      setSupported(isSupported);
      setSupportError(supportErr);
      setCameraPermission(perm);
    });
  }, [open]);

  // One AR session per dialog open, trackImplement:true so
  // ArImplementTracker runs -- see native-ar-preview.ts's own comment on
  // startArPreview's second argument.
  useEffect(() => {
    if (!open) return;
    // Unconditional the instant this effect fires at all -- if this line
    // never shows up either, the effect itself isn't running (a mount/
    // dependency problem), not anything inside its body.
    setDiagLog((log) => [...log, "JS: startArPreview effect firing"]);
    try {
      let cancelled = false;
      let rafId: number | null = null;
      let started = false;
      let loggedWaiting = false;
      let waitFrames = 0;
      // ~3s at 60fps -- generous, but bounded: if the container genuinely
      // never mounts, that should show up as its own log line rather than
      // an invisible infinite poll.
      const MAX_WAIT_FRAMES = 180;

      function onResize() {
        const r = containerRef.current?.getBoundingClientRect();
        if (r) void updateArPreviewRect(r);
      }

      function tryStart() {
        if (cancelled) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          // The dialog's own open-transition/portal mount can commit this
          // ref's DOM node a tick AFTER `open` flips true -- this effect
          // only ever runs once per dialog-open (deps: [open]), so giving
          // up on the very first check here meant the camera silently
          // never started for the rest of that session on exactly that
          // race. Polling every frame until the ref is real costs nothing
          // (a getBoundingClientRect read) and can't miss the window the
          // way a one-shot check could.
          if (!loggedWaiting) {
            loggedWaiting = true;
            setDiagLog((log) => [...log, "JS: containerRef not ready yet, waiting for it to mount..."]);
          }
          waitFrames++;
          if (waitFrames > MAX_WAIT_FRAMES) {
            setDiagLog((log) => [...log, "JS: containerRef never became ready, giving up"]);
            return;
          }
          rafId = requestAnimationFrame(tryStart);
          return;
        }
        started = true;
        setArCameraActive(true);
        // Logged entirely on the JS side, independent of the native
        // logDiag/getDiagnosticLog buffer -- if start() itself is never
        // reached natively (that buffer stays empty even after the polling
        // fix), this is what proves whether the JS call was even attempted,
        // and whether the returned promise ever actually settles one way or
        // the other, rather than hanging forever.
        setDiagLog((log) => [...log, "JS: calling startArPreview()"]);
        startArPreview(rect, true)
          .then(() => {
            if (!cancelled) setDiagLog((log) => [...log, "JS: startArPreview() resolved"]);
          })
          .catch((err) => {
            if (!cancelled) {
              const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
              setDiagLog((log) => [...log, `JS: startArPreview() rejected: ${detail}`]);
              setError(err instanceof Error ? err.message : "Could not start camera");
            }
          });
        window.addEventListener("resize", onResize);
      }

      tryStart();
      return () => {
        cancelled = true;
        if (rafId != null) cancelAnimationFrame(rafId);
        window.removeEventListener("resize", onResize);
        if (started) {
          setArCameraActive(false);
          void stopArPreview();
        }
      };
    } catch (err) {
      // A synchronous throw anywhere above this point would otherwise
      // silently abort just this effect with nothing to show for it --
      // this is what would explain a real device showing zero lines from
      // this effect at all despite the sibling isSupported effect (a
      // separate useEffect) working fine.
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      setDiagLog((log) => [...log, `JS: SYNC THROW in startArPreview effect: ${detail}`]);
    }
  }, [open]);

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
    // A wholesale setDiagLog(nativeLog) here used to blow away every JS:-
    // prefixed line the moment the first native poll landed (even an empty
    // native buffer, if start() hadn't reached a single logDiag() call yet)
    // -- keeping only the JS: lines and re-appending the native snapshot
    // after them means neither side can erase the other, regardless of
    // which one is ahead.
    return pollDiagnosticLog((nativeLog) => {
      setDiagLog((log) => [...log.filter((l) => l.startsWith("JS:")), ...nativeLog]);
    });
  }, [open]);

  // Collected independently of trackingRef -- see heightCorrectionSamplesRef's
  // own comment for why this runs continuously from whenever the AR session
  // starts tracking a body, not gated to Start/Stop the way the trace-
  // building effect below is.
  useEffect(() => {
    if (!frame || !frame.tracked || !heightIn) return;
    const worldLm = arJointsToWorldLandmarks(frame.joints);
    const sign = worldVerticalSign(worldLm) ?? verticalSignRef.current;
    const candidate = computeHeightScaleCorrection(worldLm, sign, heightIn);
    if (candidate != null) heightCorrectionSamplesRef.current.push(candidate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  useEffect(() => {
    if (!frame || !frame.tracked || !trackingRef.current) return;
    // Scaled once here, right off the ARKit bridge, so every downstream
    // consumer below (fused wrist/implement points, tilt, the primary
    // trace) automatically inherits the correction -- same "one
    // application point" pattern as bar-tracker-dialog.tsx's own
    // worldLandmarks scaling. No-op when scaleCorrectionRef.current is
    // null (no heightIn on file, or no plausible reading was ever sampled).
    const rawWorldLm = arJointsToWorldLandmarks(frame.joints);
    const worldLm =
      scaleCorrectionRef.current != null ? scaleWorldLandmarks(rawWorldLm, scaleCorrectionRef.current) : rawWorldLm;
    framesRef.current.push({ t: frame.timestamp, landmarks: [], worldLandmarks: worldLm });

    const sign = worldVerticalSign(worldLm);
    if (sign != null) verticalSignRef.current = sign;

    const leftWristWorld = worldLm[POSE_LANDMARKS.LEFT_WRIST];
    const rightWristWorld = worldLm[POSE_LANDMARKS.RIGHT_WRIST];
    // Captured once, outside fuseSide below -- `frame` itself narrows to the
    // tracked variant here in the outer scope, but that narrowing doesn't
    // carry into a nested function's own reference to the same closed-over
    // variable (TS re-widens it there, since fuseSide could in principle be
    // called after frame changed).
    const t = frame.timestamp;

    // Weighted fusion of each side's implement reading against that side's
    // wrist -- see this file's own header comment for why wrist confidence
    // is a constant 1 here rather than MediaPipe's graduated visibility
    // score. A side with no wrist this frame contributes nothing (stays
    // null), same as bar-tracker-dialog.tsx's own gate.
    function fuseSide(
      wristWorld: { x: number; y: number; z: number; visibility: number } | undefined,
      implement: ImplementTrackResult | null | undefined,
      prevRef: React.MutableRefObject<{ x: number; y: number; t: number } | null>,
      velocitySamplesRef: React.MutableRefObject<VelocitySample[]>,
    ): { x: number; y: number; confidence: number } | null {
      if (!wristWorld || wristWorld.visibility <= 0) return null;
      const wristConf = 1;
      const barConf = implement ? implement.confidence : 0;
      const total = wristConf + barConf;
      let fused: { x: number; y: number; confidence: number } | null =
        total > 0
          ? {
              x: (wristConf * wristWorld.x + barConf * (implement ? implement.x : 0)) / total,
              y: (wristConf * wristWorld.y + barConf * (implement ? implement.y : 0)) / total,
              confidence: Math.min(1, total / 2),
            }
          : null;
      // Same MAX_PLAUSIBLE_VELOCITY_MPS-style frame-to-frame check
      // bar-tracker-dialog.tsx applies to its own fused points -- catches a
      // fused jump the native-side plausibility gate (implement vs wrist,
      // within one frame) can't, since that one has no notion of the
      // PREVIOUS frame's fused position.
      if (fused && !isPlausibleVelocity(prevRef.current, { ...fused, t })) {
        rejectionEventsRef.current.push(t);
        fused = null;
      }
      if (fused) {
        prevRef.current = { x: fused.x, y: fused.y, t };
        // Vertical-sign corrected, same as the combined trace below -- see
        // bar-tracker-dialog.tsx's own leftVelocitySamplesRef push for why
        // computeArmDriveAsymmetry needs this sign already applied, not raw.
        velocitySamplesRef.current.push({ t, y: verticalSignRef.current * fused.y, confidence: fused.confidence });
      }
      return fused;
    }

    const fusedLeft = fuseSide(leftWristWorld, frame.leftImplement, prevFusedLeftRef, leftVelocitySamplesRef);
    const fusedRight = fuseSide(rightWristWorld, frame.rightImplement, prevFusedRightRef, rightVelocitySamplesRef);

    if (usesSharedBar && fusedLeft && fusedRight) {
      const rawTilt = tiltDegreesFromPoints(fusedLeft, fusedRight, verticalSignRef.current);
      if (rawTilt != null) {
        liveTiltHistoryRef.current.push(rawTilt);
        if (liveTiltHistoryRef.current.length > LIVE_TILT_HISTORY_SIZE) liveTiltHistoryRef.current.shift();
        tiltReadingsRef.current.push(rawTilt);
      }
      setLiveTiltDeg(liveTiltHistoryRef.current.length > 0 ? medianOf(liveTiltHistoryRef.current) : null);
    }

    // Combined bar point: average of both fused sides when both are
    // available (a real two-handed grip), otherwise whichever single side
    // is -- same fallback bar-tracking.ts's own deriveBarPoint uses for a
    // partially-occluded bar, applied here to the fused points instead of
    // raw wrists.
    const combined =
      fusedLeft && fusedRight
        ? {
            x: (fusedLeft.x + fusedRight.x) / 2,
            y: (fusedLeft.y + fusedRight.y) / 2,
            confidence: (fusedLeft.confidence + fusedRight.confidence) / 2,
          }
        : (fusedLeft ?? fusedRight);
    if (combined) {
      // Vertical-sign corrected here (not on fusedLeft/fusedRight
      // themselves, which tiltDegreesFromPoints above needs raw) -- same
      // "larger = lower" convention detectFormFaults/summarizeTrackedSet
      // assume everywhere else, matching bar-tracker-dialog.tsx's own
      // primary-trace push.
      const point = { t: frame.timestamp, x: combined.x, y: verticalSignRef.current * combined.y, z: 0, confidence: combined.confidence };
      const prevPoint = traceRef.current[traceRef.current.length - 1];
      if (prevPoint) {
        // A brief implement/wrist dropout (a spotter's hand in the way, a
        // frame where neither side fused) shouldn't read as one giant
        // instantaneous jump -- same occlusion-gap fill bar-tracker-dialog.tsx's
        // primary trace already gets, 300ms ceiling matching its "lift"
        // (non-jump) mode.
        for (const gapPoint of interpolateOcclusionGap(prevPoint, point, 300)) traceRef.current.push(gapPoint);
      }
      traceRef.current.push(point);
      const live = summarizeTrackedSet(traceRef.current, loadKg, heightIn, undefined, rejectionEventsRef.current);
      if (live) setRecordedReps(live.repBreakdown.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  function startTracking() {
    traceRef.current = [];
    framesRef.current = [];
    tiltReadingsRef.current = [];
    liveTiltHistoryRef.current = [];
    prevFusedLeftRef.current = null;
    prevFusedRightRef.current = null;
    leftVelocitySamplesRef.current = [];
    rightVelocitySamplesRef.current = [];
    rejectionEventsRef.current = [];
    // Assessed right now, off whatever frame is currently tracked -- there's
    // no separate setup/countdown step here to assess it earlier during
    // (unlike bar-tracker-dialog.tsx's previewTick), so this is the closest
    // available moment to "framing right before the set started." Held for
    // the whole set, same as bar-tracker-dialog.tsx's lastAlignmentReasonRef.
    alignmentReasonRef.current = frame?.tracked
      ? assessCameraAlignment(arJointsToWorldLandmarks(frame.joints)).reason
      : null;
    // Locked in from whatever accumulated since the AR session started
    // tracking -- see heightCorrectionSamplesRef's own comment. Needs at
    // least a handful of samples before it's trusted enough to correct a
    // whole set's worth of numbers; only OVERWRITES the existing value
    // when fresh samples cleared that bar, same "retry doesn't silently
    // lose a good correction" reasoning as bar-tracker-dialog.tsx's own
    // lock-in.
    if (heightCorrectionSamplesRef.current.length >= 5) {
      scaleCorrectionRef.current = medianOf(heightCorrectionSamplesRef.current);
    }
    heightCorrectionSamplesRef.current = [];
    trackingRef.current = true;
    setRecordedReps(0);
    setLiveTiltDeg(null);
    setTracking(true);
    // Clears any lock held from a previous set within this same AR
    // session -- see resetImplementTracking's own comment.
    resetArImplementTracking().catch(() => {});
    if (recordVideo) {
      // A failure here used to vanish completely -- stopArRecording()
      // downstream would then have nothing to stop and reject with its own
      // generic error, making a recording that never actually started look
      // identical to any other failure. Logged into the same diagnostic
      // strip so it's visible without needing to reproduce blind.
      startArRecording().catch((err) => {
        const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        setDiagLog((log) => [...log, `JS: startArRecording() failed: ${detail}`]);
      });
    }
  }

  async function stopTracking() {
    trackingRef.current = false;
    setTracking(false);
    const metrics = summarizeTrackedSet(traceRef.current, loadKg, heightIn, undefined, rejectionEventsRef.current);
    if (!metrics) {
      // The rep-tracking read failing doesn't mean the recording itself
      // failed -- the coach explicitly wants a video of every set (see the
      // page's own "Your coach wants a video" banner), so a real clip
      // still gets saved and attached to this set even with no trustworthy
      // numbers to go with it, rather than thrown away just because the
      // automatic read couldn't be trusted. Dialog only closes when a
      // video actually got captured this way -- with nothing saved at all
      // (no video required, or the upload itself failed), it stays open
      // exactly like before so the athlete can just retry the set.
      if (recordVideo) {
        setSaving(true);
        setUploadProgress(0);
        try {
          const blob = await stopArRecording();
          const formData = new FormData();
          formData.append("video", blob, videoFilenameForBlob(blob, "form-check"));
          const { url } = await uploadWithProgress("/api/athlete/form-video", formData, setUploadProgress);
          toast.error(
            "Couldn't get a clean read -- make sure the bar stays in frame throughout the set. (Video saved for your coach.)",
          );
          onCapture(EMPTY_REP_METRICS, url);
          onOpenChange(false);
        } catch (err) {
          // Surfacing the real reason, not the same generic read-failure
          // message either way -- "No frames were captured" (native
          // stopRecording's own rejection when Start/Stop happened too fast
          // for a single ARFrame to land) reads completely differently from
          // an upload failure, and silently collapsing both into one
          // message is exactly what made a real video-save failure look
          // identical to "nothing went wrong, there's just nothing to
          // report."
          const detail = err instanceof ApiError ? err.message : err instanceof Error ? err.message : String(err);
          toast.error(
            `Couldn't get a clean read, and the video didn't save either: ${detail}`,
          );
        } finally {
          setSaving(false);
        }
      } else {
        toast.error("Couldn't get a clean read -- make sure the bar stays in frame throughout the set.");
      }
      return;
    }
    metrics.formFaults = detectFormFaults(
      framesRef.current,
      metrics.barPathDeviationCm,
      "lift",
      movementType,
      equipment,
      tiltReadingsRef.current,
      undefined,
      metrics.repBreakdown.map((r) => ({ startT: r.startT, endT: r.endT })),
    );

    // Same gating as bar-tracker-dialog.tsx: only a bilateral lower-body
    // lift can compare left vs right leg drive at all.
    if (movementType === "Squat" && laterality !== "unilateral") {
      const legDrive = computeLegDriveAsymmetry(
        framesRef.current,
        metrics.repBreakdown.map((r) => ({ startT: r.startT, endT: r.endT })),
      );
      const validEntries = legDrive
        .map((d, i) => (d ? { repNumber: metrics.repBreakdown[i].repNumber, ...d } : null))
        .filter((d): d is NonNullable<typeof d> => d !== null);
      metrics.legDriveAsymmetry = validEntries.length > 0 ? validEntries : null;
    } else {
      metrics.legDriveAsymmetry = null;
    }

    // Same gating as bar-tracker-dialog.tsx: only a bilateral press/pull on
    // a shared bar compares arm to arm (a squat/hinge/lunge's bar is driven
    // by the legs, not compared arm-to-arm).
    if (usesSharedBar && laterality !== "unilateral" && (movementType === "Push" || movementType === "Pull")) {
      const armDrive = computeArmDriveAsymmetry(
        leftVelocitySamplesRef.current,
        rightVelocitySamplesRef.current,
        metrics.repBreakdown.map((r) => ({ startT: r.startT, endT: r.endT })),
      );
      const validArmEntries = armDrive
        .map((d, i) => (d ? { repNumber: metrics.repBreakdown[i].repNumber, ...d } : null))
        .filter((d): d is NonNullable<typeof d> => d !== null);
      metrics.armDriveAsymmetry = validArmEntries.length > 0 ? validArmEntries : null;
    } else {
      metrics.armDriveAsymmetry = null;
    }

    // Same mismatch/trust-score computation as bar-tracker-dialog.tsx's own
    // Stop handler -- see this file's header comment for the one honest gap
    // in the movement-pattern guess itself (it's missing the wrist-vs-
    // shoulder-height signal, which needs 2D image-space landmarks this
    // bridge doesn't produce; knee-angle and torso-lean, both world-space,
    // still drive most of the guess).
    const guess = guessMovementPattern(framesRef.current, movementType);
    const expectedPattern = expectedPatternFromName(exerciseName);
    const patternMismatch = guess.pattern !== "unknown" && !!expectedPattern && guess.pattern !== expectedPattern;
    metrics.trustScores = computeRepTrustScores(
      metrics.repBreakdown.map((r) => ({ repNumber: r.repNumber, startT: r.startT, endT: r.endT })),
      traceRef.current.map((p) => ({ t: p.t, confidence: p.confidence ?? 0.6 })),
      rejectionEventsRef.current,
      patternMismatch,
      alignmentReasonRef.current,
    );

    if (!recordVideo) {
      onCapture(metrics);
      onOpenChange(false);
      return;
    }

    setSaving(true);
    setUploadProgress(0);
    try {
      const blob = await stopArRecording();
      const formData = new FormData();
      formData.append("video", blob, videoFilenameForBlob(blob, "form-check"));
      const { url } = await uploadWithProgress("/api/athlete/form-video", formData, setUploadProgress);
      onCapture(metrics, url);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Saved the set, but the clip failed to upload");
      onCapture(metrics);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-transparent backdrop-blur-none"
        className="inset-0 top-0 left-0 h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-transparent p-0 overflow-hidden [&>button]:hidden"
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

            {/* Diagnostic readout -- see SHOW_DIAGNOSTIC_OVERLAY's own
                comment in ar-jump-tracker-dialog.tsx. */}
            {SHOW_DIAGNOSTIC_OVERLAY && (
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
            )}

            {tracking && (
              <div className="absolute left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-sm font-bold text-white backdrop-blur-sm">
                <Circle className="h-2.5 w-2.5 animate-pulse fill-destructive text-destructive" />
                {recordedReps}
                {targetReps ? `/${targetReps}` : ""} reps
                {mode === "full" && usesSharedBar && liveTiltDeg != null && ` · tilt ${liveTiltDeg.toFixed(0)}°`}
              </div>
            )}

            {!tracking && frame && !frame.tracked && (
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md bg-black/60 px-3 py-2 text-center text-sm text-white backdrop-blur-sm">
                Step back so your whole body and the bar are in frame
              </div>
            )}
            {!tracking && frame?.tracked && framingHint(frame.distanceMeters) !== "good" && (
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

          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 bg-black/70 px-3 py-4 backdrop-blur-sm">
            {!tracking && (
              <Button size="lg" onClick={startTracking} disabled={!supported || saving}>
                <Circle className="h-4 w-4 fill-current" />
                Start Set
              </Button>
            )}
            {tracking && (
              <Button size="lg" variant="secondary" onClick={stopTracking} disabled={saving}>
                <Square className="h-4 w-4" />
                {saving ? `Saving… ${Math.round(uploadProgress * 100)}%` : "Stop Set"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
