import { useEffect, useRef } from "react";

const DISMISS_THRESHOLD_PX = 40;

/** Native-style "swipe down to dismiss the keyboard," the same gesture iOS Mail/Messages/Notes
 * use: dragging down on the scrollable content -- not the input itself -- while already
 * scrolled to the top closes the keyboard. Same "only counts while already at the top" physics
 * usePullToRefresh already establishes for the identical downward-drag gesture pointed at a
 * different action (dismiss instead of refresh) -- without that gate, every ordinary downward
 * drag to scroll back up through a long chat would trigger a dismiss instead.
 *
 * Bind `containerRef` to the scrollable element the gesture should be read from (a chat panel's
 * message list, not the textarea) -- onDismiss fires once per completed downward drag past
 * `threshold`, on release. No drag-along visual here (unlike pull-to-refresh's own eased pull
 * distance): blurring the input is instantaneous, not a loading state with progress to show. */
export function useSwipeToDismissKeyboard<T extends HTMLElement = HTMLDivElement>(
  onDismiss: () => void,
  options?: { threshold?: number },
) {
  const threshold = options?.threshold ?? DISMISS_THRESHOLD_PX;
  const containerRef = useRef<T | null>(null);

  // Kept current via a ref so the gesture handlers (registered once) always call the latest
  // onDismiss without needing to re-bind on every render -- same reasoning as
  // usePullToRefresh's own onRefreshRef.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let pointerId: number | null = null;
    let startY = 0;
    let dragging = false;

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (el!.scrollTop > 0) return;
      pointerId = e.pointerId;
      startY = e.clientY;
      dragging = false;
    }

    function onPointerMove(e: PointerEvent) {
      if (pointerId === null || e.pointerId !== pointerId) return;
      const rawDelta = e.clientY - startY;
      // Moved back up, or scrolled out from under the gesture (more content loaded above,
      // etc.) -- either way this isn't a live downward pull from the top anymore.
      dragging = rawDelta > 0 && el!.scrollTop <= 0;
    }

    function endDrag(e: PointerEvent) {
      if (pointerId === null || e.pointerId !== pointerId) return;
      pointerId = null;
      const wasDragging = dragging;
      dragging = false;
      if (!wasDragging) return;
      if (e.clientY - startY >= threshold) onDismissRef.current();
    }

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", endDrag);
    el.addEventListener("pointercancel", endDrag);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", endDrag);
      el.removeEventListener("pointercancel", endDrag);
    };
  }, [threshold]);

  return { containerRef };
}
