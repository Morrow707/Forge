import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  isArPreviewPlatform,
  isArBodyTrackingSupported,
  startArPreview,
  stopArPreview,
  updateArPreviewRect,
  startArRecording,
  stopArRecording,
  onBodyTracking,
  framingHint,
  type BodyTrackingFrame,
} from "@/lib/native-ar-preview";
import { arJointsToWorldLandmarks } from "@/lib/ar-body-landmarks";
import { deriveBarPoint, worldAngleAtVertex, POSE_LANDMARKS } from "@/lib/pose-tracking";
import { ArMotionReplayViewer, type MotionReplayFrame } from "@/components/ar-motion-replay-viewer";
import { Circle, Square, Video } from "lucide-react";

// Temporary verification page for the ARKit body-tracking swap (see
// ArCameraPreviewPlugin.swift) -- not linked from any real nav, only from
// the account menu's native-only debug item. Proves two things before any
// real tracking UI gets built on top of them: the native camera preview
// itself renders correctly positioned behind the WebView, and the emitted
// per-frame joint data looks sane (a body gets detected, positions move
// plausibly with it). The raw joint dump below is also the only way to
// find out ARKit's *actual* joint name strings on a real device --
// ARSkeletonDefinition doesn't expose them as named constants beyond a
// handful (root/head/leftHand/rightHand/leftFoot/rightFoot), so mapping
// specific joints (shoulders, elbows, knees) to the metrics math in
// pose-tracking.ts needs this ground truth first. Delete once the real
// bar-tracker integration lands and this has served its purpose.
export default function ArPreviewTestPage() {
  const [, navigate] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<BodyTrackingFrame | null>(null);
  const [kneeAngleDeg, setKneeAngleDeg] = useState<number | null>(null);
  const [wristSpeedMps, setWristSpeedMps] = useState<number | null>(null);
  // Previous frame's bar point + its own timestamp, purely for this page's
  // live speed readout -- a real tracked-set implementation would run this
  // through bar-tracking.ts's actual rep-detection/fusion pipeline instead
  // of a raw instantaneous delta like this.
  const prevBarPointRef = useRef<{ x: number; y: number; z: number; t: number } | null>(null);

  // 3D motion replay -- buffered in a ref, not state, so an in-progress
  // recording doesn't re-render this whole page on every ~33ms frame. Only
  // synced to state (recordedCount) for the UI's own frame counter, and
  // handed to the viewer as a real array once recording stops.
  const recordingRef = useRef(false);
  const bufferRef = useRef<MotionReplayFrame[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordedCount, setRecordedCount] = useState(0);
  const [replayFrames, setReplayFrames] = useState<MotionReplayFrame[] | null>(null);
  const [replayOpen, setReplayOpen] = useState(false);

  // Real video-clip test for the new native ARKit recording capability (see
  // ArCameraPreviewPlugin.swift's startRecording/appendVideoFrame) --
  // completely separate from the joint-buffer "Record" button above, which
  // never touches actual video. This is the only way to confirm, on a real
  // device, that the clip plays back right-side-up (not sideways/upside-
  // down -- the rotation transform's sign is unverified) before any
  // production tracker dialog gets converted to depend on it.
  const [clipRecording, setClipRecording] = useState(false);
  const [clipSaving, setClipSaving] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [clipError, setClipError] = useState<string | null>(null);

  async function toggleClipRecording() {
    if (clipRecording) {
      setClipSaving(true);
      try {
        const blob = await stopArRecording();
        if (clipUrl) URL.revokeObjectURL(clipUrl);
        setClipUrl(URL.createObjectURL(blob));
        setClipError(null);
      } catch (err) {
        setClipError(err instanceof Error ? err.message : "Recording failed");
      } finally {
        setClipRecording(false);
        setClipSaving(false);
      }
      return;
    }
    setClipError(null);
    try {
      await startArRecording();
      setClipRecording(true);
    } catch (err) {
      setClipError(err instanceof Error ? err.message : "Could not start recording");
    }
  }

  useEffect(() => {
    if (!isArPreviewPlatform()) {
      setSupported(false);
      return;
    }
    isArBodyTrackingSupported().then(setSupported);
  }, []);

  useEffect(() => {
    if (!running) return;
    function onResize() {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) void updateArPreviewRect(rect);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [running]);

  useEffect(() => {
    return () => {
      if (running) void stopArPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!running) return;
    return onBodyTracking(setFrame);
  }, [running]);

  // Runs pose-tracking.ts's own angle/bar-point math (unmodified) against
  // the ARKit joints via the ar-body-landmarks.ts bridge -- this is the
  // actual end-to-end proof that the bridge's joint-name guesses and Y-flip
  // (see that file's own comment) produce something a real athlete's body
  // would plausibly move like, not just that the joint dump prints numbers.
  useEffect(() => {
    if (!frame || !frame.tracked) {
      setKneeAngleDeg(null);
      setWristSpeedMps(null);
      prevBarPointRef.current = null;
      return;
    }
    const landmarks = arJointsToWorldLandmarks(frame.joints);

    if (recordingRef.current) {
      bufferRef.current.push({ t: frame.timestamp / 1000, landmarks });
      setRecordedCount(bufferRef.current.length);
    }

    const hip = landmarks[POSE_LANDMARKS.LEFT_HIP];
    const knee = landmarks[POSE_LANDMARKS.LEFT_KNEE];
    const ankle = landmarks[POSE_LANDMARKS.LEFT_ANKLE];
    if (hip.visibility && knee.visibility && ankle.visibility) {
      setKneeAngleDeg(worldAngleAtVertex(hip, knee, ankle));
    } else {
      setKneeAngleDeg(null);
    }

    const barPoint = deriveBarPoint(landmarks);
    const t = frame.timestamp / 1000;
    if (barPoint) {
      const prev = prevBarPointRef.current;
      if (prev && t > prev.t) {
        const dt = t - prev.t;
        const speed = Math.hypot(barPoint.x - prev.x, barPoint.y - prev.y, barPoint.z - prev.z) / dt;
        setWristSpeedMps(speed);
      }
      prevBarPointRef.current = { x: barPoint.x, y: barPoint.y, z: barPoint.z, t };
    } else {
      setWristSpeedMps(null);
      prevBarPointRef.current = null;
    }
  }, [frame]);

  async function handleStart() {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setError(null);
    setFrame(null);
    try {
      await startArPreview(rect);
      setRunning(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start AR preview");
    }
  }

  async function handleStop() {
    try {
      await stopArPreview();
    } finally {
      setRunning(false);
      setFrame(null);
      recordingRef.current = false;
      setRecording(false);
      // native stop() itself cancels any in-progress clip writer -- just
      // resync this page's own state to match.
      setClipRecording(false);
      setClipSaving(false);
    }
  }

  function toggleRecording() {
    if (recordingRef.current) {
      recordingRef.current = false;
      setRecording(false);
      return;
    }
    bufferRef.current = [];
    setRecordedCount(0);
    recordingRef.current = true;
    setRecording(true);
  }

  function openReplay() {
    setReplayFrames([...bufferRef.current]);
    setReplayOpen(true);
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-display text-lg font-semibold">ARKit Preview Test</h1>
          <p className="text-xs text-muted-foreground">
            {supported === null
              ? "Checking device support..."
              : supported
                ? "ARKit body tracking is supported on this device"
                : "Not supported on this device/platform"}
          </p>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        style={{ background: running ? "transparent" : undefined }}
      >
        {!running && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Tap Start to show the native ARKit camera preview here
          </div>
        )}

        {/* Raw joint dump, not a skeleton overlay -- the point of this page
            is seeing exactly what ARKit reports (real joint name strings,
            whether a body is actually detected, do the numbers move
            plausibly) before building anything that assumes a specific
            joint-name mapping is correct. */}
        {running && (
          <div className="absolute inset-x-2 top-2 max-h-[70%] overflow-y-auto rounded-md bg-black/70 p-2 font-mono text-[11px] text-white backdrop-blur-sm">
            {!frame || !frame.tracked ? (
              <p className="text-white/70">No body detected -- step back so your whole body is in frame.</p>
            ) : (
              <>
                <p className="mb-1 text-white/70">
                  {frame.joints.length} joints · scale {frame.estimatedScaleFactor.toFixed(3)} ·{" "}
                  {frame.distanceMeters.toFixed(2)}m from camera
                  {framingHint(frame.distanceMeters) !== "good" && (
                    <span className="text-amber-400">
                      {" "}
                      ({framingHint(frame.distanceMeters) === "too close" ? "step back" : "come closer"})
                    </span>
                  )}
                </p>
                {/* Computed off pose-tracking.ts's real math via the
                    ar-body-landmarks.ts bridge, not hand-rolled here --
                    null until the bridge's guessed joint names actually
                    match what ARKit reports below. */}
                <p className="mb-1 text-teal-300">
                  knee angle: {kneeAngleDeg == null ? "—" : `${kneeAngleDeg.toFixed(0)}°`} · wrist speed:{" "}
                  {wristSpeedMps == null ? "—" : `${wristSpeedMps.toFixed(2)} m/s`}
                </p>
                {frame.joints.map((j) => (
                  <div key={j.name}>
                    {j.name}: {j.x.toFixed(2)}, {j.y.toFixed(2)}, {j.z.toFixed(2)}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="space-y-2 border-t border-border p-4">
        <div className="flex gap-3">
          <Button className="flex-1" onClick={handleStart} disabled={!supported || running}>
            Start
          </Button>
          <Button className="flex-1" variant="outline" onClick={handleStop} disabled={!running}>
            Stop
          </Button>
        </div>
        {running && (
          <div className="flex gap-3">
            <Button
              className="flex-1"
              variant={recording ? "secondary" : "outline"}
              onClick={toggleRecording}
            >
              {recording ? <Square className="h-4 w-4" /> : <Circle className="h-4 w-4 fill-current" />}
              {recording ? `Stop Recording (${recordedCount})` : "Record"}
            </Button>
            <Button
              className="flex-1"
              variant="outline"
              onClick={openReplay}
              disabled={recording || bufferRef.current.length === 0}
            >
              View 3D Replay ({bufferRef.current.length})
            </Button>
          </div>
        )}
        {running && (
          <Button
            className="w-full"
            variant={clipRecording ? "secondary" : "outline"}
            onClick={toggleClipRecording}
            disabled={clipSaving}
          >
            {clipRecording ? <Square className="h-4 w-4" /> : <Video className="h-4 w-4" />}
            {clipSaving ? "Saving clip…" : clipRecording ? "Stop Video Clip" : "Record Video Clip (real MP4)"}
          </Button>
        )}
        {clipError && <p className="text-sm text-destructive">{clipError}</p>}
        {clipUrl && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Native ARKit clip -- check it's right-side-up, not sideways or upside-down:
            </p>
            <video src={clipUrl} controls playsInline className="w-full rounded-md" />
          </div>
        )}
      </div>

      <ArMotionReplayViewer open={replayOpen} onOpenChange={setReplayOpen} frames={replayFrames ?? []} />
    </div>
  );
}
