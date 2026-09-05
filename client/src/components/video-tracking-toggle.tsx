import { Video, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type TrackingLevel =
  | "none"
  | "bar_path"
  | "full"
  | "jump"
  | "golf_swing"
  | "baseball_swing"
  | "med_ball"
  | "kb_swing"
  | "horizontal_load";

// Word-boundary, not substring -- "Baseball-Style Rotational Med Ball
// Throw" shouldn't silently become a swing-tracked exercise just because
// the word appears in its name; an exercise actually named "Golf Swing" or
// "Baseball Batting Drill" should. Checked against the exercise's own name
// only (never its description) -- description text is far more likely to
// mention a sport in passing ("great for baseball players") without the
// exercise itself being that sport's swing.
const GOLF_NAME_PATTERN = /\bgolf\b/i;
const BASEBALL_NAME_PATTERN = /\bbaseball\b/i;
// Checked BEFORE BASEBALL_NAME_PATTERN below -- "Baseball-Style Rotational
// Med Ball Throw" (the example the comment above already calls out) would
// otherwise match baseball's own pattern first and become swing-tracked
// instead of med-ball-tracked. No structured `equipment` field is
// threaded into this component (unlike golf/baseball, "Medicine Ball" IS
// already a real value in shared/exercise-family.ts's equipment taxonomy,
// but plumbing it through every call site for one pattern wasn't worth
// it) -- name matching is the same lightweight approach already
// established for golf/baseball, not a new category of guess.
// "Wall Ball" is a medicine ball thrown at a target and belongs in this mode, but it never says
// "med ball" in its name, so it used to fall through to bar-path tracking -- an up-and-down rep
// tracker pointed at a thrown object.
const MED_BALL_NAME_PATTERN = /\b(?:med(?:icine)?[\s-]?ball|wall\s*ball)\b/i;
// "Kettlebell Snatch"/"KB Clean" deliberately do NOT match -- those are vertical-linear,
// ballistic movements (same category as a barbell clean/snatch), not the arc pattern a swing
// needs. Only the word "swing" alongside kettlebell/KB should route here -- see
// kb-swing-tracking.ts's own file comment for why the swing specifically needs different math
// even though it's the same implement as a snatch/clean.
const KB_SWING_NAME_PATTERN = /\b(?:kettlebell|kb)\s+swing\b/i;
// Sled push/pull/drag and a farmer's/loaded carry are both "cover a known distance in a
// straight line" -- the horizontal-linear pattern -- as opposed to an up-down rep like every
// other tracked mode. See av-horizontal-load-tracker-dialog.tsx's own file comment.
// A suitcase carry is the same "cover a known distance in a straight line" pattern as a
// farmer's carry -- one weight instead of two -- and was falling through to bar-path tracking.
const HORIZONTAL_LOAD_NAME_PATTERN = /\b(?:sled (?:push|pull|drag)|(?:farmer'?s?|suitcase)\s+(?:carry|walk)|loaded carry)\b/i;

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
  const onLevel: TrackingLevel =
    exerciseName && MED_BALL_NAME_PATTERN.test(exerciseName)
      ? "med_ball"
      : category === "plyometric"
      ? "jump"
      : exerciseName && KB_SWING_NAME_PATTERN.test(exerciseName)
        ? "kb_swing"
        : exerciseName && HORIZONTAL_LOAD_NAME_PATTERN.test(exerciseName)
          ? "horizontal_load"
          : exerciseName && GOLF_NAME_PATTERN.test(exerciseName)
              ? "golf_swing"
              : exerciseName && BASEBALL_NAME_PATTERN.test(exerciseName)
                ? "baseball_swing"
                : "full";

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
