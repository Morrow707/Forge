import { useEffect, useRef, useState } from "react";
import {
  isArBodyTrackingSupported,
  startArPreview,
  stopArPreview,
  updateArPreviewRect,
  onBodyTracking,
  onSessionError,
  pollDiagnosticLog,
  setArCameraActive,
  type BodyTrackingFrame,
} from "@/lib/native-ar-preview";

/** The AR-session lifecycle shared by every native-ARKit tracker dialog
 * (bar/jump/sprint today, more to come) -- capability check, starting and
 * tearing down the native camera preview (including the container-ready
 * wait/retry dance a dialog's very first open races against), subscribing
 * to body-tracking frames and session errors, and the JS/native diagnostic
 * log merge. Extracted here verbatim from ar-jump-tracker-dialog.tsx's own
 * copy (the simplest of the three existing dialogs, body-tracking only, no
 * implement) rather than hand-retyped, specifically so a new tracker dialog
 * doesn't have to re-derive -- and risk re-breaking -- fixes this lifecycle
 * has already been through (containerRef readiness races, sync-throw
 * swallowing, native/JS log interleaving). The three existing dialogs are
 * deliberately left on their own copies rather than migrated to this hook --
 * they're shipped and working, and switching them over is a separate,
 * lower-urgency cleanup with its own risk of regressing something that
 * currently works, not something to bundle into adding new trackers.
 *
 * Whatever's specific to one tracker -- rep/angle math, recording, its own
 * tracking-in-progress state -- stays in that dialog; this hook only owns
 * getting frames flowing and torn down cleanly. */
export function useArBodyTracking(open: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [supportError, setSupportError] = useState<string | undefined>(undefined);
  const [cameraPermission, setCameraPermission] = useState<string | undefined>(undefined);
  const [frame, setFrame] = useState<BodyTrackingFrame | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagLog, setDiagLog] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFrame(null);
    setDiagLog([]);
    isArBodyTrackingSupported().then(({ supported: isSupported, error: supportErr, cameraPermission: perm }) => {
      setSupported(isSupported);
      setSupportError(supportErr);
      setCameraPermission(perm);
    });
  }, [open]);

  // One AR session per dialog open -- not tied to any tracking/setup
  // distinction the caller has, so tapping that dialog's own Start/Stop
  // doesn't tear down and restart the camera.
  useEffect(() => {
    if (!open) return;
    setDiagLog((log) => [...log, "JS: startArPreview effect firing"]);
    try {
      let cancelled = false;
      let rafId: number | null = null;
      let started = false;
      let loggedWaiting = false;
      let waitFrames = 0;
      const MAX_WAIT_FRAMES = 180;

      function onResize() {
        const r = containerRef.current?.getBoundingClientRect();
        if (r) void updateArPreviewRect(r);
      }

      function tryStart() {
        if (cancelled) return;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          // This effect only ever runs once per dialog-open (deps: [open]),
          // so a one-shot ref check that loses the race with the dialog's
          // own open-transition/portal mount would mean the camera
          // silently never starts for the rest of that session -- wait and
          // retry instead of giving up after one failed read.
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
        setDiagLog((log) => [...log, "JS: calling startArPreview()"]);
        startArPreview(rect)
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
      // silently abort just this effect with nothing to show for it -- this
      // is what would explain a real device showing zero lines from this
      // effect at all despite the sibling isSupported effect (a separate
      // useEffect) working fine.
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

  return { containerRef, frame, error, supported, supportError, cameraPermission, diagLog, setDiagLog };
}
