import { useState } from "react";
import { Plus } from "lucide-react";
import { ColorField } from "@/components/color-field";
import type { ColorSource } from "@/components/image-color-picker";
import { cn } from "@/lib/utils";

/** A pen color of the coach's own beside a video tool's preset swatches (2026-11-20), with the
 *  eyedropper able to take a color off the frame on screen (a jersey, a cone, the bar). It opens as
 *  a row under the toolbar rather than a pop-up: the eyedropper is a window of its own, and a
 *  pop-up closes when focus moves to it, taking the color field with it. */
export function CustomPenColor({
  color,
  presets,
  onChange,
  video,
}: {
  color: string;
  presets: readonly string[];
  onChange: (hex: string) => void;
  /** The video being drawn on; its current frame is offered to the eyedropper. */
  video: () => HTMLVideoElement | null;
}) {
  const [open, setOpen] = useState(false);
  const custom = !presets.includes(color);

  function frame(): ColorSource[] {
    const v = video();
    if (!v || !v.videoWidth) return [];
    try {
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      canvas.getContext("2d")?.drawImage(v, 0, 0);
      return [{ label: "This video frame", src: canvas.toDataURL("image/png") }];
    } catch {
      // A frame the browser will not let the page read: the logo and a chosen picture still work.
      return [];
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Your own color"
        aria-expanded={open}
        title="Your own color"
        data-testid="custom-pen-color"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border-2",
          custom ? "border-foreground" : "border-dashed border-muted-foreground",
        )}
        style={custom ? { backgroundColor: color } : undefined}
      >
        {!custom && <Plus className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="basis-full rounded-md border border-border p-3">
          <ColorField label="Pen color" value={custom ? color : ""} extraSources={frame} onChange={(hex) => hex && onChange(hex)} />
        </div>
      )}
    </>
  );
}
