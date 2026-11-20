import { useEffect, useRef, useState } from "react";
import { ImagePlus, Pipette } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { pixelHex } from "@/lib/color-input";

/** THE EYEDROPPER (Scott, 2026-11-20: "the little inkblot thing where i can click on an image and
 *  capture that color"). The browser's own EyeDropper exists only in Chrome and Edge, never on an
 *  iPhone, so this is Forge's: a picture (the program's logo, a photo the coach picks, or the
 *  video frame on screen), a magnifier under the finger showing the exact pixel and its color, and
 *  a tap to take it. Where the browser does have an EyeDropper, it is offered too. */

// Not yet in TypeScript's DOM lib; Chrome and Edge only, so it is always feature-detected.
declare global {
  interface Window {
    EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> };
  }
}

export type ColorSource = { label: string; src: string };

/** The longest side a picture is read at: enough to land on any pixel a person can point at. */
const MAX_READ_SIDE = 900;
/** The magnifier shows LOUPE_PIXELS x LOUPE_PIXELS source pixels, each LOUPE_ZOOM screen pixels. */
const LOUPE_PIXELS = 11;
const LOUPE_ZOOM = 10;
const LOUPE_SIZE = LOUPE_PIXELS * LOUPE_ZOOM;
const HALF = 2;
const LOUPE_HALF = Math.floor(LOUPE_PIXELS / HALF);
/** The outline round the pixel being read: a white ring inside a black one, so it shows on any color. */
const RING = 2;
/** How far above the finger the magnifier floats, so the finger never covers it. */
const LOUPE_LIFT = 24;

type Spot = { x: number; y: number; hex: string | null; px: number; py: number };

function statusLine(hover: Spot | null, chosen: string | null): string {
  if (hover?.hex) return "Under your pointer";
  if (chosen) return "Picked";
  if (hover) return "That spot is see-through";
  return "Tap the picture to pick";
}

export function ImageColorPicker({
  open,
  onOpenChange,
  sources,
  onPick,
  label,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pictures offered first, the program's logo among them. The coach can also choose their own. */
  sources: ColorSource[];
  onPick: (hex: string) => void;
  label: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [readable, setReadable] = useState<"loading" | "ok" | "failed">("loading");
  const [hover, setHover] = useState<Spot | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLCanvasElement>(null);
  const pixels = useRef<ImageData | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadedUrl = useRef<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const hasEyeDropper = typeof window !== "undefined" && !!window.EyeDropper;

  // Start on the first picture offered each time the window opens.
  useEffect(() => {
    if (!open) return;
    setSrc(sources[0]?.src ?? null);
    setChosen(null);
    setHover(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open only, not on every new sources array
  }, [open]);

  useEffect(() => () => {
    if (uploadedUrl.current) URL.revokeObjectURL(uploadedUrl.current);
  }, []);

  // Draw the picture and keep its pixels to read from.
  useEffect(() => {
    pixels.current = null;
    setHover(null);
    if (!open || !src) return;
    setReadable("loading");
    const img = new Image();
    // A logo is served from the API host; a signed URL needs no cookie, so this only lets the
    // canvas read the pixels back (the same reason the video dialogs set it).
    if (!src.startsWith("data:") && !src.startsWith("blob:")) img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const scale = Math.min(1, MAX_READ_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return setReadable("failed");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        pixels.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setReadable("ok");
      } catch {
        setReadable("failed");
      }
    };
    img.onerror = () => setReadable("failed");
    img.src = src;
  }, [open, src]);

  // The magnifier: the pixels around the finger, blown up, with the one being read outlined.
  useEffect(() => {
    const loupe = loupeRef.current;
    const canvas = canvasRef.current;
    if (!loupe || !canvas || !hover) return;
    const ctx = loupe.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    ctx.drawImage(canvas, hover.x - LOUPE_HALF, hover.y - LOUPE_HALF, LOUPE_PIXELS, LOUPE_PIXELS, 0, 0, LOUPE_SIZE, LOUPE_SIZE);
    ctx.lineWidth = RING;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(LOUPE_HALF * LOUPE_ZOOM, LOUPE_HALF * LOUPE_ZOOM, LOUPE_ZOOM, LOUPE_ZOOM);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#000000";
    ctx.strokeRect(LOUPE_HALF * LOUPE_ZOOM - 1, LOUPE_HALF * LOUPE_ZOOM - 1, LOUPE_ZOOM + RING, LOUPE_ZOOM + RING);
  }, [hover]);

  function spotAt(clientX: number, clientY: number): Spot | null {
    const canvas = canvasRef.current;
    const data = pixels.current;
    if (!canvas || !data) return null;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(((clientX - box.left) / box.width) * canvas.width)));
    const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(((clientY - box.top) / box.height) * canvas.height)));
    return { x, y, hex: pixelHex(data.data, data.width, x, y), px: clientX - box.left, py: clientY - box.top };
  }

  async function pickFromScreen() {
    if (!window.EyeDropper) return;
    try {
      const result = await new window.EyeDropper().open();
      setChosen(result.sRGBHex.toUpperCase());
    } catch {
      // The coach pressed Escape: not an error.
    }
  }

  function choosePicture(file: File | undefined) {
    if (!file) return;
    if (uploadedUrl.current) URL.revokeObjectURL(uploadedUrl.current);
    uploadedUrl.current = URL.createObjectURL(file);
    setSrc(uploadedUrl.current);
    setChosen(null);
  }

  const shown = hover?.hex ?? chosen;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Take a color from a picture</DialogTitle>
          <DialogDescription>
            For {label}. Move over the picture or drag your finger across it; the magnifier shows the exact spot. Tap to take that color.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {sources.map((s) => (
            <Button key={s.src} type="button" size="sm" variant={src === s.src ? "default" : "outline"} onClick={() => setSrc(s.src)}>
              {s.label}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={src && src === uploadedUrl.current ? "default" : "outline"}
            onClick={() => fileRef.current?.click()}
            data-testid="color-picker-choose-picture"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Choose a picture
          </Button>
          {hasEyeDropper && (
            <Button type="button" size="sm" variant="outline" onClick={() => void pickFromScreen()}>
              <Pipette className="h-3.5 w-3.5" />
              Anywhere on screen
            </Button>
          )}
          <input
            key={fileInputKey}
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="color-picker-file"
            onChange={(e) => {
              choosePicture(e.target.files?.[0]);
              // A fresh input, so choosing the same picture again still fires.
              setFileInputKey((k) => k + 1);
            }}
          />
        </div>

        {src ? (
          <div className="relative mx-auto w-fit max-w-full" style={{ scrollbarGutter: "auto" }}>
            <canvas
              ref={canvasRef}
              data-testid="color-picker-canvas"
              className={cn(
                "block max-h-[50vh] max-w-full touch-none rounded-md border border-border bg-[repeating-conic-gradient(#8882_0%_25%,transparent_0%_50%)] [background-size:16px_16px]",
                readable === "ok" ? "cursor-crosshair" : "opacity-60",
              )}
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                setHover(spotAt(e.clientX, e.clientY));
              }}
              onPointerMove={(e) => setHover(spotAt(e.clientX, e.clientY))}
              onPointerUp={(e) => {
                const spot = spotAt(e.clientX, e.clientY);
                if (spot?.hex) setChosen(spot.hex);
                // A mouse keeps its hover; a finger lifted leaves the chosen color showing.
                if (e.pointerType !== "mouse") setHover(null);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") setHover(null);
              }}
            />
            {hover && readable === "ok" && (
              <div
                className="pointer-events-none absolute flex flex-col items-center gap-1"
                style={{ left: hover.px - LOUPE_SIZE / HALF, top: hover.py - LOUPE_SIZE - LOUPE_LIFT }}
              >
                <canvas
                  ref={loupeRef}
                  width={LOUPE_SIZE}
                  height={LOUPE_SIZE}
                  data-testid="color-picker-loupe"
                  className="rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5),0_4px_12px_rgba(0,0,0,0.4)]"
                  style={{ width: LOUPE_SIZE, height: LOUPE_SIZE }}
                />
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Choose a picture to take a color from.</p>
        )}
        {readable === "failed" && src && (
          <p className="text-sm text-destructive">That picture can't be read for colors. Try choosing it from your device instead.</p>
        )}

        <div className="flex items-center gap-3 rounded-md border border-border p-3" data-testid="color-picker-result">
          <span className="h-9 w-9 shrink-0 rounded-md border border-border" style={{ backgroundColor: shown ?? "transparent" }} />
          <div className="min-w-0 text-sm">
            <p className="font-mono font-semibold">{shown ?? "No color yet"}</p>
            <p className="text-xs text-muted-foreground">
              {statusLine(hover, chosen)}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!chosen}
            data-testid="color-picker-use"
            onClick={() => {
              if (!chosen) return;
              onPick(chosen);
              onOpenChange(false);
            }}
          >
            Use this color
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
