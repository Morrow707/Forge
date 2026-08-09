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
 * here rather than exposing that narrower option again.
 *
 * A single small pill rather than a labeled two-button row -- this sits on
 * every exercise card in a program that can run to dozens of exercises, so
 * the per-exercise chrome needs to stay as light as the Sets/Reps/Weight
 * fields next to it. */
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
    <button
      type="button"
      aria-pressed={isOn}
      title={
        isOn
          ? "Camera tracking + AI form-check is on for this exercise -- click to turn off"
          : "Turn on camera tracking (bar path, velocity, power, ROM, form faults) + AI form-check"
      }
      onClick={() =>
        onChange(
          isOn
            ? { trackingLevel: "none", videoCheckEnabled: false }
            : { trackingLevel: onLevel, videoCheckEnabled: true },
        )
      }
      className={cn(
        "flex w-fit items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors",
        isOn
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
      )}
    >
      {isOn ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
      {isOn ? "Video On" : "Video Off"}
    </button>
  );
}
