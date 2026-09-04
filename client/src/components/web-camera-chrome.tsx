import { useEffect, useRef, useState, type RefObject } from "react";
import { getZoomCapabilities, applyCameraZoom, applyCameraFocusPoint } from "@/lib/camera-zoom-focus";

// Web/Android counterpart to av-camera-chrome.tsx -- same pinch-to-zoom and tap-to-focus
// gestures, same on-screen feedback (zoom readout, focus-ring flash), just calling
// camera-zoom-focus.ts's Chrome/Android Image Capture API functions against a plain
// MediaStreamTrack instead of AvBodyTrackingPlugin's native methods. No lens-switch pill here --
// see camera-zoom-focus.ts's own header comment for why that half of AvCameraChrome has no web
// equivalent to port.
//
// videoTrackRef (not a plain track prop) because the live track can be swapped out from under
// this component -- bar-tracker-dialog.tsx's own onAppForeground handler reacquires a fresh
// getUserMedia stream (and therefore a fresh track) after the app comes back from being
// backgrounded, without this component ever re-rendering for that. Every gesture handler below
// reads videoTrackRef.current fresh at the moment it fires, so a reacquired track picks up
// zoom/focus with no extra wiring.
const TAP_MAX_MOVEMENT_PX = 12;
const TAP_MAX_DURATION_MS = 400;
const ZOOM_CALL_THROTTLE = 0.04;

function touchDistance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export function WebCameraChrome({
  containerRef,
  videoTrackRef,
  active,
}: {
  containerRef: RefObject<HTMLDivElement>;
  videoTrackRef: RefObject<MediaStreamTrack | null>;
  active: boolean;
}) {
  const [zoomFactor, setZoomFactorState] = useState(1);
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; key: number } | null>(null);

  const pinchRef = useRef<{ startDistance: number; startFactor: number } | null>(null);
  const tapRef = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null);
  const lastZoomCallRef = useRef(1);
  const focusRingKeyRef = useRef(0);
  const focusRingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (focusRingTimeoutRef.current) clearTimeout(focusRingTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!active || !el) return;
    const container = el;

    function applyZoom(factor: number) {
      setZoomFactorState(factor);
      if (Math.abs(factor - lastZoomCallRef.current) < ZOOM_CALL_THROTTLE) return;
      lastZoomCallRef.current = factor;
      void applyCameraZoom(videoTrackRef.current, factor).then((applied) => {
        // A rejected/unsupported call resolves null -- leave the optimistic value from the
        // setZoomFactorState above rather than snapping back, same tolerance av-camera-chrome.tsx
        // extends its own applyZoom's failure path (a single missed tick isn't worth undoing the
        // athlete's own pinch gesture on screen).
        if (applied != null) setZoomFactorState(applied);
      });
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        pinchRef.current = {
          startDistance: touchDistance(e.touches[0], e.touches[1]),
          startFactor: zoomFactor,
        };
        tapRef.current = null;
        return;
      }
      if (e.touches.length === 1) {
        const t = e.touches[0];
        tapRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), moved: false };
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const distance = touchDistance(e.touches[0], e.touches[1]);
        const ratio = distance / pinchRef.current.startDistance;
        const target = pinchRef.current.startFactor * ratio;
        applyZoom(target);
        return;
      }
      if (e.touches.length === 1 && tapRef.current) {
        const t = e.touches[0];
        if (Math.hypot(t.clientX - tapRef.current.x, t.clientY - tapRef.current.y) > TAP_MAX_MOVEMENT_PX) {
          tapRef.current.moved = true;
        }
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (pinchRef.current && e.touches.length < 2) {
        pinchRef.current = null;
      }
      const tap = tapRef.current;
      tapRef.current = null;
      if (!tap || tap.moved || Date.now() - tap.t > TAP_MAX_DURATION_MS) return;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const nx = (tap.x - rect.left) / rect.width;
      const ny = (tap.y - rect.top) / rect.height;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
      void applyCameraFocusPoint(videoTrackRef.current, nx, ny);
      focusRingKeyRef.current += 1;
      setFocusRing({ x: tap.x - rect.left, y: tap.y - rect.top, key: focusRingKeyRef.current });
      if (focusRingTimeoutRef.current) clearTimeout(focusRingTimeoutRef.current);
      focusRingTimeoutRef.current = setTimeout(() => setFocusRing(null), 700);
    }

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    container.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
    };
    // zoomFactor is read fresh at pinch-start time via the closure above being re-created
    // whenever it changes -- same reasoning as av-camera-chrome.tsx's own identical dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, containerRef, videoTrackRef, zoomFactor]);

  // Seed the initial zoom readout from whatever the track's own current settings already are
  // (e.g. a device that started zoomed in by default) -- best-effort, same as every other read
  // in this file; a track with no zoom support at all just leaves this at the 1 default, and the
  // readout pill below never shows since it's gated on zoomFactor > 1.05 anyway.
  useEffect(() => {
    if (!active) return;
    const track = videoTrackRef.current;
    if (!track || !getZoomCapabilities(track)) return;
    try {
      const settings = track.getSettings() as MediaTrackSettings & { zoom?: number };
      if (settings.zoom != null) {
        setZoomFactorState(settings.zoom);
        lastZoomCallRef.current = settings.zoom;
      }
    } catch {
      // Leave the default -- nothing to seed from.
    }
  }, [active, videoTrackRef]);

  if (!active) return null;

  return (
    <>
      {focusRing && (
        <div
          key={focusRing.key}
          className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-amber-300 animate-[av-focus-ring_0.7s_ease-out_forwards]"
          style={{ left: focusRing.x, top: focusRing.y }}
        />
      )}
      {zoomFactor > 1.05 && (
        <div className="absolute left-1/2 top-[max(3.25rem,calc(env(safe-area-inset-top)+2.5rem))] z-10 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          {zoomFactor.toFixed(1)}×
        </div>
      )}
    </>
  );
}
