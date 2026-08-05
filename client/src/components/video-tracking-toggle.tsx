import { Video, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type TrackingLevel = "none" | "bar_path" | "full" | "jump";

/** Coach-facing camera control for one program exercise. Used to be 5
 * separate controls (4 tracking-level buttons -- Off/Path/Full/Jump --
 * plus an independent "require form-check video" checkbox) a coach could
 * set inconsistently for no real benefit: turning the camera on for a set
 * has always meant capturing everything the pipeline can (bar path,
 * velocity, power, ROM, form faults) and running the AI form-check on that
 * same footage, so there was never a real reason these were separate
 * decisions. Collapsed to the one choice that actually matters -- camera
 * on or off -- with "on" auto-picking the right measurement pipeline:
 * jump tracking (ankle/vertical displacement) for a plyometric exercise,
 * full bar tracking for everything else. A program exercise saved under
 * the old "bar_path"-only level before this change still works exactly as
 * before in the athlete's workout view -- it just now reads as "Video: On"
 * here rather than exposing that narrower option again. */
export function VideoTrackingToggle({
  trackingLevel,
  category,
  onChange,
}: {
  trackingLevel: TrackingLevel;
  category?: string | null;
  onChange: (patch: { trackingLevel: TrackingLevel; videoCheckEnabled: boolean }) => void;
}) {
  const isOn = trackingLevel !== "none";
  const onLevel: TrackingLevel = category === "plyometric" ? "jump" : "full";

  return (
    <div>
      <span className="mb-1 block text-[10px] uppercase text-muted-foreground">Camera</span>
      <div className="flex gap-2">
        <button
          type="button"
          aria-pressed={!isOn}
          title="No camera tracking or form-check video for this exercise"
          onClick={() => onChange({ trackingLevel: "none", videoCheckEnabled: false })}
          className={cn(
            "flex items-center gap-1.5 rounded-md border-2 px-3.5 py-2 text-sm font-bold transition-colors",
            !isOn
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:border-foreground/40",
          )}
        >
          <VideoOff className="h-4 w-4" />
          No Video
        </button>
        <button
          type="button"
          aria-pressed={isOn}
          title="Captures bar path, velocity, power, ROM, and form faults, plus AI form-check feedback on the same footage"
          onClick={() => onChange({ trackingLevel: onLevel, videoCheckEnabled: true })}
          className={cn(
            "flex items-center gap-1.5 rounded-md border-2 px-3.5 py-2 text-sm font-bold transition-colors",
            isOn
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
          )}
        >
          <Video className="h-4 w-4" />
          Video
        </button>
      </div>
    </div>
  );
}
