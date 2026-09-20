import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Play,
  Pause,
  Pencil,
  ArrowUpRight,
  Minus,
  Circle,
  Square,
  Type,
  Ruler as RulerIcon,
  MoveVertical,
  MoveHorizontal,
  Undo2,
  Trash2,
  Share2,
  Save,
} from "lucide-react";
import { CameraMetricCaveat } from "@/components/camera-metric-caveat";
import { resolveApiUrl, apiRequest } from "@/lib/queryClient";
import { drawEvents } from "@/lib/review-draw";
import { visibleAt, type ReviewEvent, type ReviewEventPayload } from "@shared/video-review";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * The coach's side: draw on a clip, and every mark is an event at the moment it was made.
 *
 * WHY THE EDITOR HOLDS THE WHOLE LOG IN MEMORY AND SAVES IT WHOLE. Undo becomes a pop, reorder
 * becomes a sort, and the server never has to reason about event ordering or partial writes --
 * `PUT .../events` replaces the timeline. A review is a few hundred marks at most, so the
 * payload is small and the simplicity is free.
 *
 * THE TIME A MARK BELONGS TO IS THE VIDEO'S TIME, NOT THE WALL CLOCK. A coach scrubs to the
 * sticking point, draws, scrubs on. The drawing belongs to that frame forever, which is what
 * makes the review replayable rather than a recording of a session.
 *
 * Coordinates are normalised on the way in (see review-draw.ts): the canvas box is whatever the
 * dialog happens to be, and a review drawn on a phone replays on a laptop.
 */

type Tool = "stroke" | "arrow" | "line" | "circle" | "box" | "text" | "ruler" | "guideV" | "guideH";

const TOOLS: { id: Tool; label: string; icon: typeof Pencil }[] = [
  { id: "stroke", label: "Freehand", icon: Pencil },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight },
  { id: "line", label: "Line", icon: Minus },
  { id: "circle", label: "Circle", icon: Circle },
  { id: "box", label: "Box", icon: Square },
  { id: "text", label: "Label", icon: Type },
  { id: "ruler", label: "Ruler", icon: RulerIcon },
  { id: "guideV", label: "Plumb line", icon: MoveVertical },
  { id: "guideH", label: "Floor line", icon: MoveHorizontal },
];

const COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#ffffff"];

export function VideoReviewEditorDialog({
  open,
  onOpenChange,
  reviewId,
  title,
  clipUrl,
  clipLabel,
  initialEvents = [],
  initialShared = false,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reviewId: number;
  title: string;
  clipUrl: string;
  clipLabel: string;
  initialEvents?: ReviewEvent[];
  initialShared?: boolean;
  onSaved?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [events, setEvents] = useState<ReviewEvent[]>(initialEvents);
  const [tool, setTool] = useState<Tool>("stroke");
  const [color, setColor] = useState(COLORS[0]);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [duration, setDuration] = useState(0);
  const [saving, setSaving] = useState(false);
  const [shared, setShared] = useState(initialShared);
  const [dirty, setDirty] = useState(false);

  // Re-seed each time the dialog opens, for the same reason the compare tool does: a stale log
  // from a previous open would be somebody else's review. Props, not a query, so this is not the
  // hydrate-in-an-effect shape CLAUDE.md bans -- nothing is read here and saved back over.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setEvents(initialEvents);
      setShared(initialShared);
      setDirty(false);
    }
    wasOpen.current = open;
  }, [open, initialEvents, initialShared]);

  // In-progress drag, in normalised coordinates. Held in a ref rather than state: it updates on
  // every pointermove and re-rendering React sixty times a second to draw a line is wasteful.
  const drag = useRef<{ from: { x: number; y: number }; points: { x: number; y: number }[] } | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) {
        setT(v.currentTime);
        if (Number.isFinite(v.duration)) setDuration(v.duration);
        paint(v.currentTime);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  function box() {
    const c = canvasRef.current;
    return c ? { width: c.clientWidth, height: c.clientHeight } : { width: 0, height: 0 };
  }

  function paint(now: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const b = box();
    if (b.width === 0 || b.height === 0) return;
    if (canvas.width !== b.width || canvas.height !== b.height) {
      canvas.width = b.width;
      canvas.height = b.height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, b.width, b.height);
    drawEvents(ctx, visibleAt(events, now, "left"), b);
    // The mark being dragged right now, painted from the same code path so what the coach sees
    // while drawing is exactly what lands in the log.
    const d = drag.current;
    if (d) {
      const preview = previewPayload(d);
      if (preview) drawEvents(ctx, [{ t: now, side: "left", payload: preview }], b);
    }
  }

  function previewPayload(d: NonNullable<typeof drag.current>): ReviewEventPayload | null {
    const to = d.points[d.points.length - 1] ?? d.from;
    switch (tool) {
      case "stroke":
        return { kind: "stroke", points: d.points, color };
      case "arrow":
        return { kind: "arrow", from: d.from, to, color };
      case "line":
        return { kind: "line", from: d.from, to, color };
      case "ruler":
        return { kind: "ruler", from: d.from, to, color };
      case "box":
        return { kind: "box", from: d.from, to, color };
      case "circle":
        return {
          kind: "circle",
          center: d.from,
          radius: Math.hypot(to.x - d.from.x, to.y - d.from.y),
          color,
        };
      default:
        return null;
    }
  }

  function normalised(e: React.PointerEvent): { x: number; y: number } {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }

  function addEvent(payload: ReviewEventPayload) {
    const now = videoRef.current?.currentTime ?? 0;
    // Inserted in time order so the log stays sorted -- visibleAt scans forward for the next
    // boundary and would find the wrong one otherwise, and the server returns it sorted too.
    const mark: ReviewEvent = { t: now, side: "left", payload };
    setEvents((prev) => [...prev, mark].sort((a, b2) => a.t - b2.t));
    setDirty(true);
  }

  function onPointerDown(e: React.PointerEvent) {
    const at = normalised(e);
    if (tool === "text") {
      const text = window.prompt("Label");
      if (text?.trim()) addEvent({ kind: "text", at, text: text.trim(), color });
      return;
    }
    if (tool === "guideV" || tool === "guideH") {
      addEvent({
        kind: "guide",
        orientation: tool === "guideV" ? "vertical" : "horizontal",
        at: tool === "guideV" ? at.x : at.y,
        joint: null,
        color,
      });
      return;
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { from: at, points: [at] };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    drag.current.points.push(normalised(e));
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    // A tap with no movement is not a drawing. Without this every stray touch on the canvas
    // becomes a zero-length line in the log that renders as nothing and cannot be seen to undo.
    const last = d.points[d.points.length - 1];
    if (Math.hypot(last.x - d.from.x, last.y - d.from.y) < 0.01 && tool !== "stroke") return;
    if (tool === "stroke" && d.points.length < 2) return;
    const payload = previewPayload(d);
    if (payload) addEvent(payload);
  }

  async function save() {
    setSaving(true);
    try {
      await apiRequest("PUT", `/api/coach/video-reviews/${reviewId}/events`, {
        events: events.map((e) => ({
          t: e.t,
          side: e.side,
          holdSeconds: e.holdSeconds ?? undefined,
          payload: e.payload,
        })),
      });
      setDirty(false);
      toast.success("Review saved");
      onSaved?.();
    } catch {
      // Left dirty on purpose: the marks stay on screen and the button stays live, so a failed
      // save is a retry rather than lost work.
      toast.error("Couldn't save the review. Your drawings are still here -- try again.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleShare() {
    const next = !shared;
    try {
      await apiRequest("PATCH", `/api/coach/video-reviews/${reviewId}`, { shared: next });
      setShared(next);
      toast.success(next ? "Shared with the athlete" : "No longer shared");
      onSaved?.();
    } catch {
      toast.error("Couldn't change who can see this review.");
    }
  }

  const undo = () => {
    setEvents((prev) => prev.slice(0, -1));
    setDirty(true);
  };

  const marksHere = useMemo(() => visibleAt(events, t, "left").length, [events, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-lg bg-black">
          <video
            ref={videoRef}
            src={resolveApiUrl(clipUrl)}
            className="block w-full"
            playsInline
            preload="metadata"
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
            {clipLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {TOOLS.map((tl) => (
            <Button
              key={tl.id}
              size="sm"
              variant={tool === tl.id ? "default" : "outline"}
              onClick={() => setTool(tl.id)}
              aria-pressed={tool === tl.id}
              title={tl.label}
            >
              <tl.icon className="h-3.5 w-3.5" />
            </Button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              className={cn(
                "h-6 w-6 rounded-full border-2",
                color === c ? "border-foreground" : "border-transparent",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              if (v.paused) {
                void v.play().catch(() => {});
                setPlaying(true);
              } else {
                v.pause();
                setPlaying(false);
              }
            }}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.1)}
            step={1 / 60}
            value={t}
            onChange={(e) => {
              const v = videoRef.current;
              if (v) v.currentTime = Number(e.target.value);
            }}
            className="h-1.5 flex-1 accent-primary"
            aria-label="Scrub"
          />
          <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
            {t.toFixed(2)}s
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={undo} disabled={events.length === 0}>
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEvents([]);
              setDirty(true);
            }}
            disabled={events.length === 0}
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </Button>
          <span className="text-xs text-muted-foreground">
            {events.length} mark{events.length === 1 ? "" : "s"}
            {marksHere > 0 ? ` (${marksHere} on screen)` : ""}
          </span>
          <span className="flex-1" />
          <Button size="sm" variant={shared ? "default" : "outline"} onClick={() => void toggleShare()}>
            <Share2 className="h-3.5 w-3.5" /> {shared ? "Shared" : "Share"}
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save"}
          </Button>
        </div>

        <CameraMetricCaveat variant="inline" />
      </DialogContent>
    </Dialog>
  );
}
