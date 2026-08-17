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
  onBodyTracking,
  type BodyTrackingFrame,
} from "@/lib/native-ar-preview";

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
    }
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
                  {frame.joints.length} joints · scale {frame.estimatedScaleFactor.toFixed(3)}
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

      <div className="flex gap-3 border-t border-border p-4">
        <Button className="flex-1" onClick={handleStart} disabled={!supported || running}>
          Start
        </Button>
        <Button className="flex-1" variant="outline" onClick={handleStop} disabled={!running}>
          Stop
        </Button>
      </div>
    </div>
  );
}
