import { useEffect, useRef, useState } from "react";

const MAX_PULL_PX = 80;
const REFRESH_THRESHOLD_PX = 60;
// Raw finger movement is scaled down so the indicator eases rather than
// tracks 1:1 -- matches the rubber-band feel of native pull-to-refresh.
const RESISTANCE = 0.5;

/** Native-style pull-to-refresh for a scrollable container: dragging down
 * while already scrolled to the top pulls a small indicator into view with
 * resistance (capped at `maxPull`), and releasing past `threshold` calls
 * `onRefresh` and holds the indicator in a loading state until it settles.
 * Bind `containerRef` to the element that actually scrolls -- for a page
 * whose scrolling happens on the window/document rather than an
 * `overflow-y` div, that's still fine to bind to a wrapping element, since
 * scroll position falls back to the window's when the container itself
 * isn't the one scrolling.
 *
 * Pointer Events drive this (not touch-specific handlers), so the same
 * gesture works with touch, mouse drag, and pen; a plain mouse user who
 * never starts a downward drag from the top just never triggers it. */
export function usePullToRefresh<T extends HTMLElement = HTMLDivElement>(
  onRefresh: () => void | Promise<void>,
  options?: { threshold?: number; maxPull?: number },
) {
  const threshold = options?.threshold ?? REFRESH_THRESHOLD_PX;
  const maxPull = options?.maxPull ?? MAX_PULL_PX;

  const containerRef = useRef<T | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Kept current via a ref so the gesture handlers (registered once) always
  // call the latest `onRefresh` without needing to re-bind on every render.
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function scrollTop() {
      // If `el` isn't itself the scrolling element (e.g. a page that scrolls
      // via the window/document rather than an overflow-y div on el), its
      // own scrollTop stays permanently 0 -- fall back to the document's
      // scroll position in that case so "at the top" is still accurate.
      return el!.scrollTop || window.scrollY || document.documentElement.scrollTop || 0;
    }

    let pointerId: number | null = null;
    let startY = 0;
    let dragging = false;
    let refreshing = false;

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (refreshing || scrollTop() > 0) return;
      pointerId = e.pointerId;
      startY = e.clientY;
      dragging = false;
    }

    function onPointerMove(e: PointerEvent) {
      if (pointerId === null || e.pointerId !== pointerId || refreshing) return;
      const rawDelta = e.clientY - startY;
      if (rawDelta <= 0 || scrollTop() > 0) {
        // Moved back up, or the page scrolled out from under the gesture --
        // either way this isn't a live pull anymore.
        if (dragging) {
          dragging = false;
          setPullDistance(0);
        }
        return;
      }
      dragging = true;
      e.preventDefault();
      setPullDistance(Math.max(0, Math.min(maxPull, rawDelta * RESISTANCE)));
    }

    function endDrag(e: PointerEvent) {
      if (pointerId === null || e.pointerId !== pointerId) return;
      pointerId = null;
      const wasDragging = dragging;
      dragging = false;
      if (!wasDragging) return;

      setPullDistance((current) => {
        if (current < threshold) return 0;
        refreshing = true;
        setIsRefreshing(true);
        Promise.resolve(onRefreshRef.current())
          .catch(() => {
            // Swallowed -- a failed refresh just means the indicator stops,
            // not an unhandled rejection. The caller's own query/mutation
            // state (e.g. a toast) is the right place to surface the error.
          })
          .finally(() => {
            refreshing = false;
            setIsRefreshing(false);
            setPullDistance(0);
          });
        // Hold the indicator at the threshold (rather than wherever the
        // finger happened to be) while the refresh is in flight.
        return threshold;
      });
    }

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove, { passive: false });
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", endDrag);
      el.removeEventListener("pointercancel", endDrag);
    };
  }, [maxPull, threshold]);

  return { containerRef, pullDistance, isRefreshing };
}
