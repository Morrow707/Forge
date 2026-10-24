import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError, resolveApiUrl } from "@/lib/queryClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Pencil, Undo2, Trash2, Video } from "lucide-react";

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; width: number };

// High-contrast against typical gym-video backdrops (turf green, wood
// floor, dark gym walls) -- avoids reds/greens that wash out on grass.
const COLORS = ["#fbbf24", "#f65b23", "#38bdf8", "#ffffff"];

/** Coach pauses an athlete's form-check video at any frame and draws
 * directly on it (freehand, a couple of colors, undo/clear) -- e.g.
 * circling a knee valgus moment -- then attaches the annotated frame as a
 * reply, the same way a video link gets attached. */
export function VideoAnnotationDialog({
  open,
  onOpenChange,
  videoUrl,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string;
  onSaved: (imageUrl: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef(false);
  const [captured, setCaptured] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  // The real <canvas> only mounts once `captured` is true, so the capture
  // step below draws into an offscreen canvas first, then flips state to
  // mount the real one -- this effect then sizes it and paints the base
  // frame once it actually exists in the DOM.
  useEffect(() => {
    if (!captured) return;
    const canvas = canvasRef.current;
    const base = baseImageRef.current;
    if (!canvas || !base) return;
    canvas.width = base.naturalWidth;
    canvas.height = base.naturalHeight;
    redraw([]);
  }, [captured]);

  function redraw(allStrokes: Stroke[]) {
    const canvas = canvasRef.current;
    const base = baseImageRef.current;
    if (!canvas || !base) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (const p of stroke.points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    // The real <canvas> isn't mounted until `captured` flips true, so grab
    // the frame into a throwaway offscreen canvas first.
    const offscreen = document.createElement("canvas");
    offscreen.width = video.videoWidth || 640;
    offscreen.height = video.videoHeight || 360;
    const ctx = offscreen.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height);
    // AND IT SAYS SO IF IT EVER FAILS ANYWAY. crossOrigin above is what makes this work, but a
    // tainted canvas throws rather than returning anything, and this threw out of an onClick
    // handler -- which React logs to the console and nothing else. There is no console on a
    // phone (see the debug-console entries), so the only symptom was a button that did nothing.
    // A sentence the coach can read beats a silent no-op even when the cause is unfixable here.
    let frame: string;
    try {
      frame = offscreen.toDataURL("image/png");
    } catch {
      toast.error("Couldn't capture this frame. Try reopening the video.");
      return;
    }
    const img = new Image();
    img.onload = () => {
      baseImageRef.current = img;
      setStrokes([]);
      setCaptured(true);
    };
    img.src = frame;
  }

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = true;
    const point = pointFromEvent(e);
    setStrokes((prev) => [...prev, { points: [point], color, width: 4 }]);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const point = pointFromEvent(e);
    setStrokes((prev) => {
      const next = prev.slice();
      const last = next[next.length - 1];
      const updated = { ...last, points: [...last.points, point] };
      next[next.length - 1] = updated;
      redraw(next);
      return next;
    });
  }

  function handlePointerUp() {
    drawingRef.current = false;
  }

  function undo() {
    setStrokes((prev) => {
      const next = prev.slice(0, -1);
      redraw(next);
      return next;
    });
  }

  function clearAll() {
    setStrokes([]);
    redraw([]);
  }

  function reset() {
    setCaptured(false);
    setStrokes([]);
    baseImageRef.current = null;
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const res = await apiRequest("POST", "/api/coach/annotations", { dataUrl });
      const { url } = await res.json();
      onSaved(url);
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the annotation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            Annotate Video
          </DialogTitle>
          <DialogDescription>
            {captured
              ? "Draw directly on the frame, circle, arrow, whatever gets the point across."
              : "Play to the moment you want to mark up, then capture that frame."}
          </DialogDescription>
        </DialogHeader>

        {!captured ? (
          <div className="space-y-3">
            <video
              ref={videoRef}
              // THE SAME CROSS-ORIGIN CANVAS TAINT, FOUND IN A THIRD FILE (2026-10-24).
              // video-analysis-dialog.tsx and video-pose-analysis.ts both carry this attribute
              // with the same comment; this element was missed, so "Capture This Frame" did
              // NOTHING on the native app -- no toast, no error, no state change, forever.
              // The page origin is capacitor://localhost and the video is on the API host, so
              // drawImage taints the canvas and the toDataURL below throws "the operation is
              // insecure"; plain playback never touches a canvas, which is why nobody noticed,
              // and the web build is same-origin so it worked in every browser.
              //
              // Safe because the uploads gate is a SIGNED URL and not a cookie: routes.ts's
              // /uploads middleware is verifyMediaUrl(path, exp, sig), and its own comment says
              // signed media URLs exist "precisely because the session cookie doesn't reliably
              // travel with a bare <video src> fetch on iOS native". So the credentials this
              // attribute withholds are credentials the request never sent, and app-wide
              // cors() already allows capacitor://localhost.
              crossOrigin="anonymous"
              src={resolveApiUrl(videoUrl)}
              controls
              className="w-full rounded-md bg-black"
            />
            <Button type="button" onClick={captureFrame} className="w-full">
              <Video className="h-4 w-4" />
              Capture This Frame
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <canvas
              ref={canvasRef}
              className="w-full touch-none rounded-md border border-border"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
            <div className="flex flex-wrap items-center gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Draw in ${c}`}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-7 w-7 rounded-full border-2",
                    color === c ? "border-foreground" : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
              <Button type="button" size="sm" variant="outline" onClick={undo} disabled={!strokes.length}>
                <Undo2 className="h-3.5 w-3.5" />
                Undo
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={clearAll} disabled={!strokes.length}>
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={reset}>
                Recapture
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {captured && (
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save & Attach"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
