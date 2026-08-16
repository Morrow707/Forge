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
} from "@/lib/native-ar-preview";

// Temporary verification page for the ARKit body-tracking swap's first
// slice (see ArCameraPreviewPlugin.swift) -- not linked from any real nav,
// only from the account menu's native-only debug item. Proves the native
// camera preview itself renders correctly positioned behind the WebView
// before any tracking logic gets built on top of it. Delete once the real
// bar-tracker integration lands and this has served its purpose.
export default function ArPreviewTestPage() {
  const [, navigate] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function handleStart() {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setError(null);
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
        className="relative flex-1"
        style={{ background: running ? "transparent" : undefined }}
      >
        {!running && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Tap Start to show the native ARKit camera preview here
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
