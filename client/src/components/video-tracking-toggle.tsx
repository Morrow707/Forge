import { Video, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";

import {
  resolveTrackingMode,
  type TrackingLevel,
} from "@/lib/resolve-tracking-mode";

export type { TrackingLevel };

// The name and equipment patterns live in resolve-tracking-mode.ts, read here AND by the
// athlete's workout page at capture time, so the tracker a coach's toggle picks is the tracker
// that films the set. See that file's own comment for the medicine ball throw that was filmed by
// the bar tracker when the two disagreed.

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
 * kettlebell-swing arc tracking or horizontal-load checkpoint tracking for
 * a name matching those patterns, med-ball object tracking for a
 * med-ball-named throw, golf/baseball swing tracking for a name matching
 * that sport, full bar tracking for everything else. A program exercise
 * saved under
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
  exerciseName,
  onChange,
}: {
  trackingLevel: TrackingLevel;
  category?: string | null;
  /** Used only to auto-pick golf_swing/baseball_swing -- see
   * GOLF_NAME_PATTERN's own comment. Optional so every existing caller
   * that doesn't have a name handy (or doesn't care) keeps working exactly
   * as before. */
  exerciseName?: string | null;
  onChange: (patch: { trackingLevel: TrackingLevel; videoCheckEnabled: boolean }) => void;
}) {
  const isOn = trackingLevel !== "none";
  // Med ball is checked BEFORE the plyometric category, not after. "Med Ball Chest Pass" and
  // "Med Ball Overhead Throw" are both seeded as category plyometric, so the old order sent two
  // thrown-object exercises to jump tracking -- which measures ankle displacement -- and the
  // med-ball name check below could never run for them.
  // Category is read HERE, when tracking is first switched on, and not at capture time: a
  // plyometric exercise becomes a jump, and everything else resolves from its name (med ball
  // before plyometric -- "Med Ball Chest Pass" is seeded as plyometric and is a thrown object).
  const byName = resolveTrackingMode("full", { exerciseName });
  const onLevel: TrackingLevel = byName === "med_ball" ? "med_ball" : category === "plyometric" ? "jump" : byName;

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
