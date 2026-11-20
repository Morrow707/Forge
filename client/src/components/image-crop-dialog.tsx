import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { POWERED_BY_FORGE_LABEL } from "@/lib/branding-copy";
import { cn } from "@/lib/utils";
import {
  CROP_SHAPES,
  MAX_ZOOM,
  MIN_ZOOM,
  cropRect,
  drawCrop,
  initialCropView,
  panView,
  renderCrop,
  type CropKind,
  type CropView,
} from "@/lib/image-crop";

/** CROP, SEE IT WHERE ATHLETES WILL, THEN SAVE (Scott, 2026-11-20). Every brand image upload --
 *  the logo, the wordmark, the login background and a team's own logo -- opens this first.
 *  Nothing is uploaded until Save; Cancel leaves the current image exactly as it was. The
 *  preview on the right is drawn by the same code that makes the uploaded file (drawCrop), so
 *  what it shows is what athletes get. */

const PREVIEW_WIDTH = 480;
const ZOOM_STEP = 0.01;
const PERCENT = 100;

const TITLES: Record<CropKind, string> = {
  logo: "Crop your logo",
  wordmark: "Crop your wordmark",
  background: "Crop your login background",
};

export function ImageCropDialog({
  file,
  kind,
  programName,
  primaryColor,
  saving,
  onCancel,
  onSave,
}: {
  /** The picked file; the dialog is open while there is one. */
  file: File | null;
  kind: CropKind;
  programName: string | null;
  primaryColor: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (cropped: File) => void;
}) {
  const shape = CROP_SHAPES[kind];
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<CropView>(initialCropView);
  const [preview, setPreview] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  // Read the picked file into an image. A new file starts centred and unzoomed.
  useEffect(() => {
    setImg(null);
    setFailed(false);
    setPreview(null);
    setView(initialCropView());
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSrcUrl(url);
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => setFailed(true);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);


  // The preview is the real crop, redrawn small every time the view changes.
  useEffect(() => {
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = PREVIEW_WIDTH;
    canvas.height = Math.round(PREVIEW_WIDTH / shape.aspect);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCrop(ctx, img, kind, view, canvas.width, canvas.height);
    setPreview(canvas.toDataURL(shape.type));
  }, [img, view, kind, shape.aspect, shape.type]);

  async function save() {
    if (!img || !file) return;
    onSave(await renderCrop(img, kind, view, file.name));
  }

  // Where the full picture sits behind the frame, so the coach can see what is cut away.
  const rect = img ? cropRect(img.naturalWidth, img.naturalHeight, shape.aspect, view) : null;

  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && !saving && onCancel()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{TITLES[kind]}</DialogTitle>
          <DialogDescription>
            {shape.label}. Drag to move the picture, use the slider to zoom. Nothing is uploaded until you press Save.
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <p className="text-sm text-destructive">That file couldn't be opened as a picture. Try a PNG, JPG or WEBP.</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-3">
              <div
                ref={frameRef}
                data-testid="crop-frame"
                className={cn(
                  "relative w-full touch-none select-none overflow-hidden rounded-md border border-border bg-[repeating-conic-gradient(#8882_0%_25%,transparent_0%_50%)] [background-size:16px_16px]",
                  // A phone-shaped frame at full width is taller than most screens, which hid Save.
                  kind === "background" && "mx-auto max-w-[15rem]",
                )}
                // scrollbarGutter "auto": index.css reserves a 10px scrollbar strip on every
                // overflow box, which here would narrow the frame, push the center guides 5px left
                // and stretch the picture against what is uploaded.
                style={{ aspectRatio: String(shape.aspect), cursor: view.fitWhole ? "default" : "grab", scrollbarGutter: "auto" }}
                onPointerDown={(e) => {
                  if (view.fitWhole) return;
                  drag.current = { x: e.clientX, y: e.clientY };
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                }}
                onPointerMove={(e) => {
                  const frameW = frameRef.current?.getBoundingClientRect().width ?? 0;
                  if (!drag.current || !img || !frameW) return;
                  const dx = e.clientX - drag.current.x;
                  const dy = e.clientY - drag.current.y;
                  drag.current = { x: e.clientX, y: e.clientY };
                  setView((v) => panView(img.naturalWidth, img.naturalHeight, shape.aspect, v, dx, dy, frameW));
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
              >
                {img && srcUrl && rect && view.fitWhole && preview && (
                  <img src={preview} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
                )}
                {img && srcUrl && rect && !view.fitWhole && (
                  <img
                    src={srcUrl}
                    alt="Your picture"
                    draggable={false}
                    className="pointer-events-none absolute max-w-none"
                    // In percentages of the frame, so the picture fills it exactly at any width.
                    style={{
                      width: `${(img.naturalWidth / rect.w) * PERCENT}%`,
                      height: `${(img.naturalHeight / rect.h) * PERCENT}%`,
                      left: `${(-rect.x / rect.w) * PERCENT}%`,
                      top: `${(-rect.y / rect.h) * PERCENT}%`,
                    }}
                  />
                )}
                {/* Center guides (Scott, 2026-11-20: "show me where center is vertical and
                    horizontal"). Drawn over the frame only; never part of the uploaded picture. */}
                {img && (
                  <div aria-hidden="true" data-testid="crop-center-guides" className="pointer-events-none absolute inset-0">
                    <div className="absolute inset-y-0 w-px bg-white/80 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" style={{ left: "calc(50% - 0.5px)" }} />
                    <div className="absolute inset-x-0 h-px bg-white/80 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" style={{ top: "calc(50% - 0.5px)" }} />
                    <div
                      className="absolute h-2.5 w-2.5 rounded-full border border-black/40 bg-white"
                      style={{ left: "calc(50% - 5px)", top: "calc(50% - 5px)" }}
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">The lines cross at the center of the frame. They are not part of the picture.</p>
              <div className="space-y-1.5">
                <Label htmlFor="crop-zoom">Zoom</Label>
                <input
                  id="crop-zoom"
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={ZOOM_STEP}
                  value={view.zoom}
                  disabled={view.fitWhole}
                  onChange={(e) => setView((v) => ({ ...v, zoom: Number(e.target.value) }))}
                  className="w-full accent-[hsl(var(--primary))]"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={view.fitWhole} onCheckedChange={(c) => setView((v) => ({ ...v, fitWhole: c === true }))} />
                Fit the whole picture (nothing cut off)
              </label>
            </div>
            <div className="min-w-0 space-y-2">
              <p className="label-xs">How athletes will see it</p>
              {preview && <CropPreview kind={kind} src={preview} programName={programName} primaryColor={primaryColor} />}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={!img || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The cropped picture in the places it is used, with the same sizes and corners the app uses. */
function CropPreview({ kind, src, programName, primaryColor }: { kind: CropKind; src: string; programName: string | null; primaryColor: string | null }) {
  const name = programName || "Your program";
  const button = { backgroundColor: primaryColor || "hsl(var(--primary))" };
  if (kind === "background") {
    return (
      <div className="mx-auto aspect-[9/16] w-48 overflow-hidden rounded-2xl border border-border" style={{ scrollbarGutter: "auto" }}>
        <div
          className="flex h-full flex-col items-center justify-center gap-2 bg-cover bg-center px-3 text-center text-white"
          style={{ backgroundImage: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.8)), url("${src}")` }}
        >
          <p className="font-display text-lg font-extrabold uppercase tracking-wider">{name}</p>
          <div className="h-6 w-full rounded-full bg-white/15" />
          <div className="h-6 w-full rounded-full bg-white/15" />
          <div className="h-7 w-full rounded-full text-xs font-semibold leading-7" style={button}>Sign in</div>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-background p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">App header</p>
        <div className="flex items-center gap-2">
          {kind === "wordmark" ? (
            <img src={src} alt="" className="h-8 max-w-[11rem] shrink-0 object-contain" />
          ) : (
            <img src={src} alt="" className="h-8 w-8 shrink-0 rounded-md object-contain" />
          )}
          <div className="flex flex-col leading-none">
            {kind !== "wordmark" && <span className="font-display text-xl font-extrabold uppercase tracking-wider">{name}</span>}
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{POWERED_BY_FORGE_LABEL}</span>
          </div>
        </div>
      </div>
      <div className="rounded-md border border-border bg-background p-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Login screen</p>
        <div className="flex flex-col items-center gap-2 text-center">
          {kind === "wordmark" ? (
            <img src={src} alt="" className="h-16 max-w-[18rem] object-contain" />
          ) : (
            <>
              <img src={src} alt="" className="h-14 w-14 rounded-xl object-contain" />
              <p className="font-display text-2xl font-extrabold uppercase tracking-wider">{name}</p>
            </>
          )}
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{POWERED_BY_FORGE_LABEL}</p>
          <div className="mt-1 h-7 w-40 rounded-full text-xs font-semibold leading-7 text-white" style={button}>Sign in</div>
        </div>
      </div>
      {kind === "logo" && (
        <div className="flex items-center gap-3 rounded-md border border-border bg-background p-3">
          <img src={src} alt="" className="h-14 w-14 rounded-[22%] border border-border bg-white object-contain" />
          <p className="text-xs text-muted-foreground">Home-screen icon when an athlete saves the website to their phone.</p>
        </div>
      )}
    </div>
  );
}
