/**
 * The arithmetic behind the two-clip compare tool (components/video-compare.tsx), kept pure so
 * it can be tested without a <video> element.
 *
 * THE TIME MODEL, which Phase 2 (saved reviews) builds on:
 *
 * - Each side has its own clip time, `tLeft` and `tRight`, in seconds from that clip's start.
 * - Each side has a SYNC MARK, `syncL` and `syncR`: the clip time the coach said "this moment
 *   matches that moment" at. Default 0 on both, which means "start of clip lines up with start
 *   of clip".
 * - The two sides are related by one offset: `tRight = tLeft - syncL + syncR`. That is the
 *   whole link. A review timeline (Phase 2) is the LEFT clip's time; the right clip's position
 *   is derived from it through this formula, so a saved review only needs `syncL`, `syncR` and
 *   the review time to reproduce both positions.
 * - Rep alignment is not a third mechanism: "Align to rep N" just SETS both marks to that rep's
 *   `startT` on its own side (from the set's repBreakdown). After that it is the same offset.
 * - Speed scales both clips equally and never enters the offset: the offset is in clip seconds,
 *   and playbackRate stretches wall-clock time, not clip time.
 * - A derived time past either end is clamped to that clip's range; the link is not broken by
 *   one clip being shorter, the shorter one simply sits at its last frame.
 */

export type Side = "left" | "right";
export type TransportTarget = Side | "both";

export type SyncMarks = { syncL: number; syncR: number };

export type RepSpan = { repNumber: number; startT: number; endT: number };

/** The speeds the transport offers, slowest first. 0.1 is for reading a single frame's motion. */
export const COMPARE_SPEEDS = [0.1, 0.25, 0.5, 1, 2] as const;

/** Assumed when a clip does not report its real frame rate (see estimateFps). */
export const DEFAULT_FPS = 30;

/** Clamp a clip time into [0, duration]. A duration that is not yet known (NaN, 0, Infinity
 * before metadata loads) clamps only at zero, so a seek is never thrown away for arriving before
 * `loadedmetadata`. */
export function clampTime(t: number, duration: number | null | undefined): number {
  if (!Number.isFinite(t)) return 0;
  const lo = Math.max(0, t);
  if (duration == null || !Number.isFinite(duration) || duration <= 0) return lo;
  return Math.min(lo, duration);
}

/** The right clip's time for a left-clip time, through the sync marks. */
export function leftToRight(tLeft: number, marks: SyncMarks, rightDuration?: number | null): number {
  return clampTime(tLeft - marks.syncL + marks.syncR, rightDuration);
}

/** The left clip's time for a right-clip time -- the same offset, inverted. */
export function rightToLeft(tRight: number, marks: SyncMarks, leftDuration?: number | null): number {
  return clampTime(tRight - marks.syncR + marks.syncL, leftDuration);
}

/** The follower's time for a master time, whichever side is driving. */
export function linkedTime(
  master: Side,
  tMaster: number,
  marks: SyncMarks,
  followerDuration?: number | null,
): number {
  return master === "left"
    ? leftToRight(tMaster, marks, followerDuration)
    : rightToLeft(tMaster, marks, followerDuration);
}

/** The other side. */
export function otherSide(side: Side): Side {
  return side === "left" ? "right" : "left";
}

/**
 * Which sides a transport control drives. THE ONE PLACE THIS IS DECIDED.
 *
 * "both" always drives both. A single side drives only itself unless the link is on, in which
 * case the other side follows. A control aimed at one side while unlinked must never touch the
 * other -- that is what "unlinked" means -- and video-compare.tsx routes every play()/pause() through
 * this so the rule cannot be broken one call site at a time (transport-respects-unlink.test.ts
 * scans for that).
 */
export function sidesToDrive(target: TransportTarget, linked: boolean): Side[] {
  if (target === "both") return ["left", "right"];
  return linked ? [target, otherSide(target)] : [target];
}

/** The marks that put rep N's start on both sides at the same instant. Null when either side
 * has no such rep, so the caller can leave the marks alone rather than half-align. */
export function marksForRep(
  leftReps: RepSpan[] | null | undefined,
  rightReps: RepSpan[] | null | undefined,
  repNumber: number,
): SyncMarks | null {
  const l = leftReps?.find((r) => r.repNumber === repNumber);
  const r = rightReps?.find((x) => x.repNumber === repNumber);
  if (!l || !r) return null;
  return { syncL: l.startT, syncR: r.startT };
}

/** Rep numbers both sides have, in order -- the options for "Align to rep N". */
export function alignableReps(
  leftReps: RepSpan[] | null | undefined,
  rightReps: RepSpan[] | null | undefined,
): number[] {
  if (!leftReps?.length || !rightReps?.length) return [];
  const rightNumbers = new Set(rightReps.map((r) => r.repNumber));
  return leftReps
    .map((r) => r.repNumber)
    .filter((n) => rightNumbers.has(n))
    .sort((a, b) => a - b);
}

/** One frame's worth of clip time at the given frame rate. */
export function frameStepSeconds(fps: number | null | undefined): number {
  const rate = fps != null && Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS;
  return 1 / rate;
}

/** The clip time one frame forward (+1) or back (-1), clamped to the clip. Lands on a frame
 * boundary rather than adding a step to an arbitrary position, so repeated steps never drift off
 * the frame grid; the tiny epsilon stops floating-point rounding from re-landing on the same
 * frame. */
export function stepFrame(
  t: number,
  direction: 1 | -1,
  fps: number | null | undefined,
  duration?: number | null,
): number {
  const step = frameStepSeconds(fps);
  const frame = Math.round(t / step);
  return clampTime((frame + direction) * step + direction * 1e-6, duration);
}

/**
 * Estimate a clip's frame rate from two `requestVideoFrameCallback` metadata samples. The
 * browser reports `presentedFrames` (a running count) and `mediaTime` (the clip time of that
 * frame), so frames-per-media-second between two samples is the rate. Null until the samples
 * are far enough apart to mean anything; the caller keeps the default until then.
 */
export function estimateFps(
  first: { presentedFrames: number; mediaTime: number },
  last: { presentedFrames: number; mediaTime: number },
): number | null {
  const frames = last.presentedFrames - first.presentedFrames;
  const seconds = last.mediaTime - first.mediaTime;
  if (frames < 10 || seconds <= 0.2) return null;
  const fps = frames / seconds;
  if (!Number.isFinite(fps) || fps < 5 || fps > 240) return null;
  return fps;
}

/**
 * How far a follower may drift from where the link says it should be before it is re-seeked.
 * Scaled with speed because a seek is costly (a keyframe decode) and at 2x the follower overshoots
 * further between corrections; scaled no lower than a frame at 0.1x, where a frame is the only
 * meaningful unit.
 */
export function driftToleranceSeconds(speed: number, fps?: number | null): number {
  const oneFrame = frameStepSeconds(fps);
  return Math.max(oneFrame, 0.08 * Math.max(1, speed));
}

/** Both clips' marks after the sides are swapped -- the offset inverts with them. */
export function swapMarks(marks: SyncMarks): SyncMarks {
  return { syncL: marks.syncR, syncR: marks.syncL };
}

// ---------------------------------------------------------------------------
// Auto-sync suggestion (Phase 4 of docs/video-review-plan.md)
// ---------------------------------------------------------------------------

/** A proposed pair of sync marks, with what it was derived from and how much to trust it.
 *
 * `confidence` is deliberately three words rather than a number. Every threshold in the camera
 * pipeline is uncalibrated (CLAUDE.md), and a percentage would invite a coach to read precision
 * into a guess. "high / medium / low" says the same useful thing and cannot be misread as
 * measurement.
 */
export type SyncSuggestion = {
  marks: SyncMarks;
  basis: "rep" | "trace";
  confidence: "high" | "medium" | "low";
  /** Plain-language, shown next to the button. Never a bare number. */
  because: string;
};

/**
 * Where the two clips probably line up.
 *
 * A SUGGESTION, NEVER AN APPLICATION. It returns marks for the caller to offer; the coach
 * accepts or ignores. That is not politeness -- rep segmentation is the part of this pipeline
 * with a known history of being wrong (ten presses reported as fifteen, see
 * docs/camera-tracking-notes.md), and a tool that silently re-aligned two clips off a bad rep
 * boundary would be moving the thing the coach came to look at without telling them.
 *
 * Rep 1's start is the anchor rather than the deepest point or the bar's first movement: it is
 * the one landmark both takes definitely share, it is what "Align to rep N" already uses, and a
 * coach comparing two lifts is comparing the lifts, not the walk-ups.
 */
export function suggestSync(
  leftReps: RepSpan[] | null | undefined,
  rightReps: RepSpan[] | null | undefined,
): SyncSuggestion | null {
  const shared = alignableReps(leftReps, rightReps);
  if (shared.length === 0) return null;

  const marks = marksForRep(leftReps, rightReps, shared[0]);
  if (!marks) return null;

  // More shared reps means the segmenter found a consistent structure in both takes, which is
  // the only evidence available here that it found the right one. One rep each is a guess.
  const confidence = shared.length >= 3 ? "high" : shared.length === 2 ? "medium" : "low";

  return {
    marks,
    basis: "rep",
    confidence,
    because:
      shared.length === 1
        ? "Lined up on the first rep. Only one rep matched, so check it before you trust it."
        : `Lined up on the first of ${shared.length} reps that matched in both clips.`,
  };
}

/** Whether a suggestion is worth offering at all.
 *
 * A low-confidence suggestion is still offered -- a coach can see in one frame whether two lifts
 * are aligned, and refusing to suggest anything is less useful than suggesting something
 * labelled as weak. What must never happen is applying it without being asked.
 */
export function shouldOfferSuggestion(s: SyncSuggestion | null): s is SyncSuggestion {
  return s != null;
}

// ---------------------------------------------------------------------------
// Trim marks (Phase 4 polish of docs/video-review-plan.md)
// ---------------------------------------------------------------------------

/** An in/out pair on one clip's own timeline. Either end may be unset. */
export type TrimRange = { in: number | null; out: number | null };

export const NO_TRIM: TrimRange = { in: null, out: null };

/**
 * Where playback should actually be, given a trim.
 *
 * TRIMMING NEVER RE-ENCODES ANYTHING. It is two numbers and a loop: the point is to watch the
 * third rep over and over without cutting a file, so the clip on disk is untouched and the
 * marks are free to move. Returning a time rather than calling seek keeps this testable and
 * keeps the one-place-plays rule in the component intact.
 *
 * Returns the same time when there is nothing to do, so a caller can compare and skip the seek
 * -- reassigning currentTime every frame is what makes iOS stutter.
 */
export function trimmedTime(t: number, trim: TrimRange, duration: number): number {
  const start = trim.in ?? 0;
  const end = trim.out ?? duration;
  if (!(end > start)) return t;
  // Past the out point loops back, which is the behaviour somebody setting marks on one rep
  // is asking for. Before the in point is a scrub that landed outside; snap forward.
  if (t >= end || t < start) return start;
  return t;
}

/** Whether a trim actually constrains anything -- an unset pair, or an inverted one somebody
 * made by putting OUT before IN, is not a trim and must not silently swallow the clip. */
export function hasTrim(trim: TrimRange, duration: number): boolean {
  const start = trim.in ?? 0;
  const end = trim.out ?? duration;
  return end > start && (trim.in != null || trim.out != null);
}
