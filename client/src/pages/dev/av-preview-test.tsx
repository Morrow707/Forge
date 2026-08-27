import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Square, Video } from "lucide-react";
import {
  isAvPreviewPlatform,
  isAvBodyTrackingSupported,
  startAvPreview,
  stopAvPreview,
  updateAvPreviewRect,
  setAvCameraActive,
  listAvLenses,
  selectAvLens,
  setAvZoom,
  setAvFocusPoint,
  startAvRecording,
  stopAvRecording,
  deleteAvRecording,
  analyzeAvRecording,
  onAvPoseFrame,
  pollAvDiagnosticLog,
  onAvSessionError,
  type LensInfo,
  type PoseFrame,
} from "@/lib/native-av-preview";

// Admin-only verification page for Phase 1 of the AVFoundation + Vision pipeline (see
// AvBodyTrackingPlugin.swift's own file comment) -- camera only, no Vision/body-pose/object
// tracking yet. Proves the actual premise this whole rewrite rests on: real zoom, real lens
// switching, real tap-to-focus, and real recording, none of which ARKit's ARSession ever
// exposed a public API for (see ar-preview-test.tsx, the ARKit-era equivalent this doesn't
// replace or touch -- both pages coexist during the validation period). Gated to
// user?.role === "admin" (not just "any iOS user" the way ar-preview-test.tsx is) because
// this is pre-cutover scaffolding for a pipeline nothing else routes to yet, not a
// stable dev tool. Delete once Phase 4+ dialogs make this redundant.
export default function AvPreviewTestPage() {
  const [, navigate] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagLog, setDiagLog] = useState<string[]>([]);

  const [lenses, setLenses] = useState<LensInfo[]>([]);
  const [activeLens, setActiveLens] = useState<string>("wide");
  const [zoom, setZoomState] = useState(1);

  const [clipRecording, setClipRecording] = useState(false);
  const [clipSaving, setClipSaving] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [clipPath, setClipPath] = useState<string | null>(null);
  const [clipError, setClipError] = useState<string | null>(null);

  // Phase 2: Vision body-pose detection against the just-recorded clip -- entirely offline,
  // see AvBodyTrackingPlugin.swift's analyzeRecording. Frames arrive as events during
  // analysis (bufferRef so the per-frame stream doesn't re-render this page each time),
  // synced to state only for the summary readout once analysis finishes.
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<{
    frameCount: number;
    trackedFrameCount: number;
    elapsedSeconds: number;
  } | null>(null);
  const poseFramesRef = useRef<PoseFrame[]>([]);
  const [latestPoseFrame, setLatestPoseFrame] = useState<PoseFrame | null>(null);

  useEffect(() => {
    if (!isAvPreviewPlatform()) {
      setSupported(false);
      return;
    }
    isAvBodyTrackingSupported().then(({ supported }) => setSupported(supported));
  }, []);

  useEffect(() => {
    if (!running) return;
    return pollAvDiagnosticLog(setDiagLog);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    return onAvSessionError(setError);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    function onResize() {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) void updateAvPreviewRect(rect);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [running]);

  useEffect(() => {
    return () => {
      if (running) {
        void stopAvPreview();
        setAvCameraActive(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStart() {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setError(null);
    setDiagLog([]);
    try {
      setAvCameraActive(true);
      await startAvPreview(rect, activeLens);
      setRunning(true);
      const found = await listAvLenses().catch(() => []);
      setLenses(found);
      setZoomState(1);
    } catch (err) {
      setAvCameraActive(false);
      setError(err instanceof Error ? err.message : "Failed to start AV preview");
    }
  }

  async function handleStop() {
    try {
      await stopAvPreview();
    } finally {
      setAvCameraActive(false);
      setRunning(false);
      setClipRecording(false);
      setClipSaving(false);
      if (clipPath) {
        void deleteAvRecording(clipPath);
        setClipPath(null);
      }
    }
  }

  async function handleSelectLens(lens: string) {
    try {
      await selectAvLens(lens);
      setActiveLens(lens);
      setZoomState(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch lens");
    }
  }

  async function handleZoomChange(factor: number) {
    setZoomState(factor);
    try {
      await setAvZoom(factor);
    } catch {
      // Slider stays responsive even if a specific factor briefly rejects mid-ramp.
    }
  }

  function handleTapToFocus(e: React.MouseEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    void setAvFocusPoint(x, y);
  }

  async function toggleClipRecording() {
    if (clipRecording) {
      setClipSaving(true);
      try {
        if (clipPath) await deleteAvRecording(clipPath); // discard whatever the previous take left on disk
        const { blob, path } = await stopAvRecording();
        if (clipUrl) URL.revokeObjectURL(clipUrl);
        setClipUrl(URL.createObjectURL(blob));
        setClipPath(path);
        setClipError(null);
        setAnalysisResult(null);
        setAnalysisError(null);
        poseFramesRef.current = [];
        setLatestPoseFrame(null);
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
      await startAvRecording();
      setClipRecording(true);
    } catch (err) {
      setClipError(err instanceof Error ? err.message : "Could not start recording");
    }
  }

  async function analyzeClip() {
    if (!clipPath || analyzing) return;
    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    poseFramesRef.current = [];
    setLatestPoseFrame(null);
    const unsubscribe = onAvPoseFrame((frame) => {
      poseFramesRef.current.push(frame);
      setLatestPoseFrame(frame);
    });
    try {
      const result = await analyzeAvRecording(clipPath);
      setAnalysisResult(result);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      unsubscribe();
      setAnalyzing(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-display text-lg font-semibold">AV Preview Test (Phase 1)</h1>
          <p className="text-xs text-muted-foreground">
            {supported === null
              ? "Checking device support..."
              : supported
                ? "Camera available on this device"
                : "Not supported on this device/platform"}
          </p>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        style={{ background: running ? "transparent" : undefined }}
        onClick={running ? handleTapToFocus : undefined}
      >
        {!running && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Tap Start to show the native camera preview here
          </div>
        )}
        {running && (
          <div className="absolute inset-x-2 top-2 max-h-[40%] overflow-y-auto rounded-md bg-black/70 p-2 font-mono text-[11px] text-white backdrop-blur-sm">
            <p className="text-white/70">Tap the preview to focus/expose at that point.</p>
            {diagLog.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="px-4 py-2 text-sm text-destructive">{error}</p>}

      <div className="space-y-3 border-t border-border p-4">
        <div className="flex gap-3">
          <Button className="flex-1" onClick={handleStart} disabled={!supported || running}>
            Start
          </Button>
          <Button className="flex-1" variant="outline" onClick={handleStop} disabled={!running}>
            Stop
          </Button>
        </div>

        {running && lenses.length > 0 && (
          <div className="flex gap-2">
            {lenses.map((lens) => (
              <Button
                key={lens.id}
                size="sm"
                variant={activeLens === lens.id ? "secondary" : "outline"}
                onClick={() => handleSelectLens(lens.id)}
              >
                {lens.label}
              </Button>
            ))}
          </div>
        )}

        {running && lenses.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Zoom: {zoom.toFixed(1)}x</p>
            <input
              type="range"
              min={lenses.find((l) => l.id === activeLens)?.minZoom ?? 1}
              max={Math.min(lenses.find((l) => l.id === activeLens)?.maxZoom ?? 5, 10)}
              step={0.1}
              value={zoom}
              onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
              className="w-full"
            />
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
            {clipSaving ? "Saving clip…" : clipRecording ? "Stop Video Clip" : "Record Video Clip"}
          </Button>
        )}
        {clipError && <p className="text-sm text-destructive">{clipError}</p>}
        {clipUrl && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Native AVFoundation clip -- check sharpness against the ARKit preview test page,
              and that zoom/lens switches actually changed the field of view:
            </p>
            <video src={clipUrl} controls playsInline className="w-full rounded-md" />
          </div>
        )}

        {clipPath && !clipRecording && (
          <Button className="w-full" variant="outline" onClick={analyzeClip} disabled={analyzing}>
            {analyzing ? "Analyzing…" : "Analyze with Vision (Phase 2)"}
          </Button>
        )}
        {analysisError && <p className="text-sm text-destructive">{analysisError}</p>}
        {analyzing && latestPoseFrame && (
          <p className="font-mono text-xs text-muted-foreground">
            frame {latestPoseFrame.frameIndex} · t={latestPoseFrame.timestamp.toFixed(2)}s ·{" "}
            {latestPoseFrame.tracked ? `${latestPoseFrame.joints.length} joints` : "no body detected"}
          </p>
        )}
        {analysisResult && (
          <p className="font-mono text-xs text-teal-600 dark:text-teal-400">
            {analysisResult.frameCount} frames processed · {analysisResult.trackedFrameCount} tracked ·{" "}
            {analysisResult.elapsedSeconds.toFixed(2)}s elapsed
          </p>
        )}
      </div>
    </div>
  );
}
