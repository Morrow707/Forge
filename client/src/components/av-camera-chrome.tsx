import { useEffect, useRef, useState, type RefObject } from "react";
import { listAvLenses, selectAvLens, setAvZoom, setAvFocusPoint, type LensInfo } from "@/lib/native-av-preview";

// Wires up the two "quality functions" AVFoundation gives this pipeline that ARKit's ARSession
// never exposed a public API for at all (see AvBodyTrackingPlugin.swift's own file comment) --
// pinch-to-zoom and tap-to-focus, both already fully implemented natively (setZoom/selectLens/
// setFocusPoint) but never called from any dialog's UI until now. Built once here and dropped
// into every AV tracker/capture dialog's containerRef div as a sibling, rather than duplicated
// per dialog -- attaches its gesture listeners imperatively to the ref it's given instead of
// needing to own the DOM node itself, so a caller just renders
// <AvCameraChrome containerRef={containerRef} active={...} /> next to its existing overlays and
// gets both gestures, their on-screen feedback, and a lens-switch pill for free.
//
// A two-finger pinch calls setAvZoom continuously (ramped, not snapped -- see that function's
// own comment) as the pinch distance changes; a genuine tap (down and up within a few pixels,
// not the first touch of a pinch, not a long-press) calls setAvFocusPoint once and flashes a
// focus ring at the tap point, mirroring Apple's own Camera app. Neither gesture handler ever
// preventDefault()s a single-finger touch that isn't a tap-release, so this never fights with
// anything else a caller's own overlay does with pointer events in the same container.
const TAP_MAX_MOVEMENT_PX = 12;
const TAP_MAX_DURATION_MS = 400;
const ZOOM_CALL_THROTTLE = 0.04;

function touchDistance(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

// Every iPhone's near-universal lens-marker convention (ultra-wide reads "0.5x", the main
// wide lens "1x", telephoto "2x"/"3x" depending on model) -- an approximation, not read off
// each lens's own focal length (AVFoundation doesn't hand that back), but close enough for a
// button label; the live zoomLabel below (driven by the device's own appliedFactor) is the
// precise number, this is just which lens a tap switches to.
const LENS_MARKER: Record<string, string> = { ultraWide: "0.5×", wide: "1×", telephoto: "2×" };
const LENS_ORDER: Record<string, number> = { ultraWide: 0, wide: 1, telephoto: 2 };

export function AvCameraChrome({
  containerRef,
  active,
}: {
  containerRef: RefObject<HTMLDivElement>;
  active: boolean;
}) {
  const [lenses, setLenses] = useState<LensInfo[]>([]);
  const [activeLens, setActiveLens] = useState<string | null>(null);
  const [zoomFactor, setZoomFactorState] = useState(1);
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; key: number } | null>(null);

  const pinchRef = useRef<{ startDistance: number; startFactor: number } | null>(null);
  const tapRef = useRef<{ x: number; y: number; t: number; moved: boolean } | null>(null);
  const lastZoomCallRef = useRef(1);
  const focusRingKeyRef = useRef(0);
  const focusRingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    listAvLenses()
      .then((result) => {
        if (cancelled) return;
        const sorted = [...result].sort((a, b) => (LENS_ORDER[a.id] ?? 1) - (LENS_ORDER[b.id] ?? 1));
        setLenses(sorted);
        const wide = sorted.find((l) => l.id === "wide") ?? sorted[0];
        if (wide) {
          setActiveLens(wide.id);
          setZoomFactorState(wide.minZoom);
          lastZoomCallRef.current = wide.minZoom;
        }
      })
      .catch(() => {
        // No lens list -- pinch-to-zoom still works within whatever lens start() picked,
        // just without a lens-switch pill to snap between physical cameras.
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

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
      void setAvZoom(factor)
        .then((applied) => setZoomFactorState(applied))
        .catch(() => {
          // Camera not started yet, or device rejected the factor -- nothing to show the
          // athlete for a single missed zoom tick, the next pinch delta will just try again.
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
      void setAvFocusPoint(nx, ny).catch(() => {
        // No-op if the camera isn't running yet -- the tap ring still shows so the athlete
        // gets visual feedback even on a call that couldn't land.
      });
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
    // whenever it changes -- deliberately in the dependency list so a pinch that starts after
    // a lens switch (or a previous pinch) ramps from the CURRENT factor, not a stale one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, containerRef, zoomFactor]);

  async function switchLens(lens: LensInfo) {
    setActiveLens(lens.id);
    try {
      await selectAvLens(lens.id);
      const applied = await setAvZoom(lens.minZoom);
      setZoomFactorState(applied);
      lastZoomCallRef.current = applied;
    } catch {
      // Lens switch failed (e.g. the device genuinely doesn't have it) -- leave the previous
      // lens active rather than showing a control that silently does nothing.
    }
  }

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
      {lenses.length > 1 && (
        <div className="absolute left-1/2 top-[max(3.25rem,calc(env(safe-area-inset-top)+2.5rem))] z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/50 p-1 backdrop-blur-sm">
          {lenses.map((lens) => (
            <button
              key={lens.id}
              type="button"
              onClick={() => void switchLens(lens)}
              className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-semibold transition-colors ${
                activeLens === lens.id ? "bg-white text-black" : "text-white/80"
              }`}
            >
              {LENS_MARKER[lens.id] ?? lens.label}
            </button>
          ))}
        </div>
      )}
      {zoomFactor > 1.05 && (
        <div className="absolute left-1/2 top-[max(3.25rem,calc(env(safe-area-inset-top)+2.5rem))] z-10 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          {zoomFactor.toFixed(1)}×
        </div>
      )}
    </>
  );
}
