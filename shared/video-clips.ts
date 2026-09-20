/**
 * The shape the clip-list routes return (GET /api/athlete/clips, GET /api/coach/roster/:athleteId/clips,
 * GET /api/guardian/athletes/:athleteId/clips) and the clip picker consumes.
 *
 * Deliberately NOT the row: a set's skeleton_frames json is ~450 frames of 33 landmarks and is
 * never shipped in a list. `hasSkeletonFrames` says whether the per-clip frames route
 * (`.../clips/:setId/frames`) has anything to return, and the compare tool fetches them for the
 * one clip that was chosen. repBreakdown is a handful of numbers per rep and rides along because
 * "Align to rep N" needs it before the clip is opened.
 */
export type ClipSource = "set" | "skill";

export type ClipSummary = {
  source: ClipSource;
  /** workoutSetEntries.id for a set, skillSessionLogs.id for a skill clip. */
  id: number;
  /** A gated /uploads path, signed by the response middleware like every other video URL. */
  videoUrl: string;
  /** ISO date (YYYY-MM-DD) of the session the clip belongs to. */
  date: string;
  exerciseName: string;
  setNumber: number | null;
  hasSkeletonFrames: boolean;
  repBreakdown: { repNumber: number; startT: number; endT: number }[] | null;
};
