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
  ClipboardPlus,
  Save,
  Mic,
  Square as StopIcon,
} from "lucide-react";
import { CameraMetricCaveat } from "@/components/camera-metric-caveat";
import { resolveApiUrl, apiRequest } from "@/lib/queryClient";
import { CueDrawer } from "@/components/cue-drawer";
import { ExercisePickerDialog } from "@/components/exercise-picker-dialog";
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
  variant = "coach",
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
  /**
   * WHOSE review this is. "coach" is the original editor; "self" is an athlete on their own
   * lift (Phase 4b of docs/video-review-plan.md).
   *
   * One component rather than two, because the drawing surface, the timeline and the tools are
   * the same thing -- and a copy would drift, which on this screen means one of the two
   * silently losing a tool. What differs is the routes it writes to, the word on the share
   * button, and the two coach-only affordances (voice-over, prescribing a corrective).
   */
  variant?: "coach" | "self";
  onSaved?: () => void;
}) {
  const base = variant === "coach" ? "/api/coach/video-reviews" : "/api/athlete/self-reviews";
  const isCoach = variant === "coach";
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
  const [pickingCorrective, setPickingCorrective] = useState(false);

  /** The review has to EXIST on the server for this, and it does -- the editor is only ever
   * opened on a saved review. Unsaved marks are a separate thing and are not implied by
   * prescribing a drill, so this deliberately does not save them first. */
  async function addCorrective(exerciseId: number) {
    try {
      await apiRequest("POST", `${base}/${reviewId}/corrective`, { exerciseId });
      toast.success("Added to their next training day");
    } catch (err) {
      // The server says which of the real refusals this is ("no upcoming training day", "not
      // about an athlete"), and those are the useful sentences -- not a generic failure.
      toast.error(err instanceof Error ? err.message : "Couldn't add that corrective.");
    }
  }
  const [dirty, setDirty] = useState(false);
  // VOICE-OVER. While recording, the coach's actions are logged against the AUDIO clock rather
  // than the video's -- see shared/video-review.ts's videoTimeForAudioTime for why the two are
  // not the same thing once playback speed changes.
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recStartedAtMs = useRef(0);
  const recStartVideoT = useRef(0);

  /** Seconds into the narration, right now. The clock every event uses while recording. */
  const audioElapsed = () => (Date.now() - recStartedAtMs.current) / 1000;

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
    // While narrating, a mark belongs to the moment in the SPEECH it was made, because that is
    // the clock playback will run on. Outside a recording it belongs to the video frame.
    const now = recording ? audioElapsed() : (videoRef.current?.currentTime ?? 0);
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

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      mr.onstop = () => {
        // Every track stopped, or iOS leaves the microphone indicator on after the dialog
        // closes and the coach reasonably concludes the app is still listening.
        stream.getTracks().forEach((t2) => t2.stop());
        void uploadTake(new Blob(chunks.current, { type: mr.mimeType || "audio/webm" }));
      };
      recStartedAtMs.current = Date.now();
      recStartVideoT.current = videoRef.current?.currentTime ?? 0;
      mr.start();
      recorder.current = mr;
      setRecording(true);
      // The narration runs over the lift, so playback starts with it.
      void videoRef.current?.play().catch(() => {});
      setPlaying(true);
    } catch {
      // A refused permission is the common case, not an error worth a stack trace.
      toast.error("Forge needs microphone access to record a voice-over.");
    }
  }

  function stopRecording() {
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
    videoRef.current?.pause();
    setPlaying(false);
  }

  async function uploadTake(blob: Blob) {
    try {
      const form = new FormData();
      // The extension is decided server-side from the mimetype; the name is only a label.
      form.append("audio", blob, "voice-over");
      form.append("startAt", String(recStartVideoT.current));
      const res = await fetch(resolveApiUrl(`${base}/${reviewId}/audio`), {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success("Voice-over saved");
      onSaved?.();
    } catch {
      toast.error("Couldn't save the voice-over. The drawings you made are still here.");
    }
  }

  async function save() {
    setSaving(true);
    try {
      await apiRequest("PUT", `${base}/${reviewId}/events`, {
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
      await apiRequest(
        "PATCH",
        `${base}/${reviewId}`,
        isCoach ? { shared: next } : { sentToCoach: next },
      );
      setShared(next);
      toast.success(
        isCoach
          ? next
            ? "Shared with the athlete"
            : "No longer shared"
          : next
            ? "Sent to your coach"
            : "Taken back from your coach",
      );
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

        {/* A cue carries a COPY of its text into the event, never the cue's id: editing or
            deleting a cue later must not change what the coach already said in a review
            somebody has watched. cueId rides along only as provenance. */}
        {/* The cue library is a coach's, and there is no athlete equivalent -- a drawer that
            always came back empty would be a promise the app does not keep. */}
        {isCoach && (
          <CueDrawer
            onDrop={(cue) =>
              addEvent({
                kind: "cue",
                text: cue.body,
                audioUrl: cue.audioUrl,
                cueId: cue.id,
                color,
              })
            }
          />
        )}

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
          {/* Coach-only for now: there is no self-review audio route, and drawing a button
              that always fails is worse than not drawing one. */}
          {isCoach && (
            <Button
              size="sm"
              variant={recording ? "destructive" : "outline"}
              onClick={() => (recording ? stopRecording() : void startRecording())}
            >
              {recording ? <StopIcon className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              {recording ? "Stop" : "Voice-over"}
            </Button>
          )}
          {/* Coach-only: prescribing work is the coach's job. From the review straight to the
              athlete's next session. It writes a per-athlete
              corrective, never an edit to the shared program day -- see
              addCorrectiveFromReview in storage.ts. */}
          {isCoach && (
            <Button size="sm" variant="outline" onClick={() => setPickingCorrective(true)}>
              <ClipboardPlus className="h-3.5 w-3.5" /> Add a corrective
            </Button>
          )}
          <span className="flex-1" />
          <Button size="sm" variant={shared ? "default" : "outline"} onClick={() => void toggleShare()}>
            <Share2 className="h-3.5 w-3.5" />{" "}
            {isCoach ? (shared ? "Shared" : "Share") : shared ? "Sent" : "Send to coach"}
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save"}
          </Button>
        </div>

        <CameraMetricCaveat variant="inline" />
      </DialogContent>
      <ExercisePickerDialog
        open={pickingCorrective}
        onOpenChange={setPickingCorrective}
        correctivesOnly
        title="Add a corrective from this review"
        onSelect={(exercise) => {
          setPickingCorrective(false);
          void addCorrective(exercise.id);
        }}
      />
    </Dialog>
  );
}
