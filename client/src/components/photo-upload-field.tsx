import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { downscalePhotoFile, type CapturedPhoto } from "@/lib/photo-capture";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";

/** Shared photo-capture UI for every "photograph a sheet, extract it with
 * AI" import feature (testing day, weigh-in, nutrition sheet, injury
 * intake, OVR/Perch printout, player intake, program transcription) --
 * a row of thumbnails plus an add button backed by a plain file input.
 * `capture="environment"` opens the camera directly on a phone while still
 * falling back to the photo library/file picker anywhere that attribute
 * isn't honored, so this needs no native camera plugin or live preview UI
 * of its own -- appropriate for "photograph a static sheet of paper" in a
 * way it wouldn't be for the live-tracked lifts elsewhere in the app. */
export function PhotoUploadField({
  images,
  onChange,
  maxImages = 4,
  document = true,
}: {
  images: CapturedPhoto[];
  onChange: (images: CapturedPhoto[]) => void;
  maxImages?: number;
  document?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = maxImages - images.length;
    if (room <= 0) {
      toast.error(`You can add up to ${maxImages} photos`);
      return;
    }
    const picked = Array.from(files).slice(0, room);
    try {
      const captured = await Promise.all(picked.map((f) => downscalePhotoFile(f, { document })));
      onChange([...images, ...captured]);
    } catch {
      toast.error("Couldn't read that photo -- try a different one");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {images.map((img, i) => (
          <div key={i} className="relative h-20 w-20 overflow-hidden rounded-md border border-border">
            <img
              src={`data:${img.mediaType};base64,${img.data}`}
              alt={`Page ${i + 1}`}
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => onChange(images.filter((_, idx) => idx !== i))}
              className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {images.length < maxImages && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
          >
            <Camera className="h-5 w-5" />
            <span className="text-[10px]">Add photo</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {images.length > 1 && (
        <p className="text-xs text-muted-foreground">{images.length} photos -- multiple pages are combined</p>
      )}
    </div>
  );
}

/** A dialog step name every photo-import dialog shares: pick photo(s),
 * wait on the AI, review/edit the extracted rows, then apply. Exported so
 * each dialog's own step union stays literally identical instead of
 * silently drifting apart. */
export type PhotoImportStep = "capture" | "analyzing" | "review" | "applying";

export function AnalyzeButton({
  disabled,
  loading,
  onClick,
  label = "Read Photo",
}: {
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button type="button" onClick={onClick} disabled={disabled || loading} className="w-full">
      {loading ? "Reading..." : label}
    </Button>
  );
}
