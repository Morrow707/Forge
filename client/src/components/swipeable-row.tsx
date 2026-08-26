import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// How far (in px) a pointer has to move before we commit to treating the
// gesture as a horizontal swipe rather than a tap or a vertical scroll.
// Below this, jitter from a finger/mouse coming to rest would otherwise
// register as a drag.
const DRAG_ACTIVATION_PX = 8;
// Release past this fraction of the row's own width to trigger delete --
// short of it, the row snaps back closed.
const DELETE_THRESHOLD_RATIO = 0.35;
const SNAP_DURATION_MS = 200;

/** Wraps row content (a list card, a table row, anything) with an iOS/
 * Android-style swipe-to-delete gesture: dragging left slides the content
 * over to reveal a red "Delete" action pinned underneath it, snapping back
 * if released before crossing ~35% of the row's own width, or calling
 * `onDelete` if released past it. Built on Pointer Events so the same
 * handlers drive touch, mouse, and pen -- no separate desktop/mobile code
 * paths.
 *
 * A plain tap/click that never actually drags passes straight through to
 * the wrapped content (e.g. a `<Link>` card), so this is safe to drop
 * around already-clickable rows. */
export function SwipeableRow({
  children,
  onDelete,
  deleteLabel = "Delete",
  className,
}: {
  children: ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
  className?: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  // Gesture bookkeeping lives in a ref, not state -- it needs to be read
  // synchronously inside the same pointer-move/up handlers that write it,
  // without waiting on a render.
  const drag = useRef({
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    width: 0,
    dragging: false,
    // Mirrors the `offset` state, updated synchronously alongside it --
    // read from here (not the state) when a gesture ends, so the
    // threshold check never depends on a render having landed between the
    // last pointermove and the pointerup/cancel that follows it.
    lastOffset: 0,
  });
  // Set right before a drag-release swallows the click browsers normally
  // synthesize after pointerup, and cleared as soon as that click is
  // consumed (or on the next pointerdown, in case the click never came).
  const suppressClickRef = useRef(false);

  const [offset, setOffset] = useState(0);
  // Only false during an active drag -- everything else (including the
  // snap-back after release) gets the transition so the row eases home
  // instead of jumping.
  const [isDragging, setIsDragging] = useState(false);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    suppressClickRef.current = false;
    const width = rowRef.current?.getBoundingClientRect().width ?? 0;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      width,
      dragging: false,
      lastOffset: 0,
    };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (d.pointerId !== e.pointerId) return;
    // Can't compute a meaningful drag against an unmeasured (or zero-width)
    // row -- bail rather than risk a divide-by-zero-shaped threshold.
    if (d.width <= 0) return;

    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    if (!d.dragging) {
      if (Math.abs(dx) < DRAG_ACTIVATION_PX && Math.abs(dy) < DRAG_ACTIVATION_PX) return;
      // Reads as a vertical scroll, not a swipe -- leave it alone so the
      // list keeps scrolling normally.
      if (Math.abs(dy) > Math.abs(dx)) return;
      d.dragging = true;
      setIsDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    e.preventDefault();
    const next = Math.max(-d.width, Math.min(0, dx));
    d.lastOffset = next;
    setOffset(next);
  }

  /** Shared by pointerup and pointercancel -- `commit` is false for a
   * cancelled gesture (the browser took over, e.g.), which should always
   * just snap back rather than ever fire onDelete even if the drag had
   * already crossed the threshold. */
  function endDrag(e: ReactPointerEvent<HTMLDivElement>, commit: boolean) {
    const d = drag.current;
    if (d.pointerId !== e.pointerId) return;
    const wasDragging = d.dragging;
    d.pointerId = null;
    d.dragging = false;

    if (!wasDragging) {
      // Plain tap: never touched the offset, so there's nothing to snap
      // back and nothing to suppress -- the underlying content's own click
      // (a Link navigating, a button firing) proceeds untouched.
      return;
    }

    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const crossedThreshold = commit && Math.abs(d.lastOffset) >= d.width * DELETE_THRESHOLD_RATIO;
    d.lastOffset = 0;
    setOffset(0);
    if (crossedThreshold) {
      // The tap-vs-drag click suppression below only matters when the
      // gesture ends still sitting on the content (i.e. didn't cross the
      // threshold) -- once we're calling onDelete there's no stray click to
      // worry about, since the row is snapping back rather than being
      // clicked through.
      onDelete();
    } else {
      suppressClickRef.current = true;
    }
  }

  function onClickCapture(e: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) return;
    suppressClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div ref={rowRef} className={cn("relative", className)}>
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 flex items-center justify-end overflow-hidden rounded-xl bg-destructive text-destructive-foreground"
        style={{
          width: Math.abs(offset),
          transition: isDragging ? "none" : `width ${SNAP_DURATION_MS}ms ease-out`,
        }}
      >
        <span className="flex shrink-0 items-center gap-1.5 px-5 text-sm font-semibold">
          <Trash2 className="h-4 w-4" />
          {deleteLabel}
        </span>
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, true)}
        onPointerCancel={(e) => endDrag(e, false)}
        onClickCapture={onClickCapture}
        className={cn("relative touch-pan-y", !isDragging && "transition-transform ease-out")}
        style={{
          transform: `translateX(${offset}px)`,
          transitionDuration: isDragging ? undefined : `${SNAP_DURATION_MS}ms`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
