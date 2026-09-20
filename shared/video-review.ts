/**
 * The vocabulary of a saved review: what a drawing is, and which drawings are on screen at a
 * given moment.
 *
 * Shared because three places have to agree about it exactly -- the coach's editor writing
 * events, the athlete's read-only player rendering them, and the zod schema on the route in
 * between. A fourth copy of "which kinds exist" is how a tool ships that the player cannot
 * draw.
 *
 * THE ZOD LESSON APPLIES HERE. A payload field the client sends and the schema does not declare
 * is stripped silently, with no error anywhere -- it has already cost this codebase three
 * deliberately-filmed takes and a bench set reported as 0 reps (see CLAUDE.md, capture
 * diagnostics). Every payload shape below is declared, and `video-review-events.test.ts`
 * derives the kind list from this file rather than restating it.
 */
import { z } from "zod";

export const REVIEW_EVENT_KINDS = [
  "stroke",
  "arrow",
  "line",
  "circle",
  "box",
  "text",
  "angle",
  "ruler",
  "guide",
  "barPath",
  "trackedAngle",
  "pause",
  "scrub",
  "speed",
  "flag",
] as const;
export type ReviewEventKind = (typeof REVIEW_EVENT_KINDS)[number];

/** Kinds that DRAW something. The rest are transport events -- they record what the coach did
 * to the video, and they end the hold of whatever was on screen (see visibleAt). */
export const DRAWING_KINDS = [
  "stroke",
  "arrow",
  "line",
  "circle",
  "box",
  "text",
  "angle",
  "ruler",
  "guide",
  "barPath",
  "trackedAngle",
] as const;

/** A boundary event: reaching one clears any drawing that was being held indefinitely.
 *
 * This is what makes "draw while you talk" work without the coach having to erase. They circle
 * a knee, keep talking, scrub to the next rep -- and the circle goes, because the thing it was
 * pointing at is no longer on screen. A drawing that outlived a scrub would sit over unrelated
 * footage, which is worse than no drawing. */
export const BOUNDARY_KINDS = ["scrub", "pause"] as const;

export type ReviewSide = "left" | "right" | "both";
export type ReviewMode = "split" | "overlay";

const point = z.object({ x: z.number(), y: z.number() });

/** Every payload shape, by kind. Coordinates are NORMALISED to the video's own box (0..1), never
 * pixels: a review drawn on a phone is replayed on a laptop, and a pixel would land somewhere
 * else entirely. */
export const reviewEventPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stroke"), points: z.array(point).max(2000), color: z.string(), width: z.number().optional() }),
  z.object({ kind: z.literal("arrow"), from: point, to: point, color: z.string() }),
  z.object({ kind: z.literal("line"), from: point, to: point, color: z.string() }),
  z.object({ kind: z.literal("circle"), center: point, radius: z.number(), color: z.string() }),
  z.object({ kind: z.literal("box"), from: point, to: point, color: z.string() }),
  z.object({ kind: z.literal("text"), at: point, text: z.string().max(280), color: z.string() }),
  z.object({ kind: z.literal("angle"), vertex: point, a: point, b: point, degrees: z.number(), color: z.string() }),
  z.object({ kind: z.literal("ruler"), from: point, to: point, label: z.string().optional(), color: z.string() }),
  // A guide that SNAPS TO A JOINT follows the skeleton frame to frame -- a plumb line from the
  // bar, a floor line, a hip-height line. `joint` is the landmark index it tracks; when null the
  // guide is static at `at`. The one lifters reach for most, per the plan.
  z.object({
    kind: z.literal("guide"),
    orientation: z.enum(["vertical", "horizontal"]),
    at: z.number(),
    joint: z.number().nullable().optional(),
    color: z.string(),
  }),
  // Drawn from the set's stored bar_path_trace. Data Forge already has; carries the caveat.
  z.object({ kind: z.literal("barPath"), setId: z.number(), color: z.string() }),
  // Stays on screen through playback, updating each frame, with a small graph.
  z.object({ kind: z.literal("trackedAngle"), joints: z.tuple([z.number(), z.number(), z.number()]), color: z.string() }),
  z.object({ kind: z.literal("pause") }),
  z.object({ kind: z.literal("scrub"), to: z.number() }),
  z.object({ kind: z.literal("speed"), rate: z.number() }),
  z.object({ kind: z.literal("flag"), note: z.string().max(280).optional() }),
]);

export type ReviewEventPayload = z.infer<typeof reviewEventPayloadSchema>;

export type ReviewEvent = {
  id?: number;
  t: number;
  side: ReviewSide;
  /** Seconds to hold past `t`. Null/undefined = hold until the next boundary event. */
  holdSeconds?: number | null;
  payload: ReviewEventPayload;
};

export function isDrawing(kind: string): boolean {
  return (DRAWING_KINDS as readonly string[]).includes(kind);
}

export function isBoundary(kind: string): boolean {
  return (BOUNDARY_KINDS as readonly string[]).includes(kind);
}

/**
 * Which drawings are on screen at time `t`.
 *
 * The rule, and every part of it earns its place:
 *
 * - A drawing appears at its own `t` and never before. Scrubbing backwards past it takes it off
 *   again, which is what makes a review scrubbable rather than a one-way recording.
 * - `holdSeconds` pins it for a fixed window -- "keep this on screen for 3 seconds" -- and it
 *   disappears on time even if nothing else happens.
 * - Without `holdSeconds` it holds until the next BOUNDARY event (a scrub or a pause) at or
 *   after its own time. That is the default because it matches what a coach means: the mark
 *   belongs to the moment they are talking about, and the moment ends when they move.
 * - Events exactly AT `t` are included. A coach drawing at 4.0s and a reader seeking to 4.0s
 *   should see it; excluding the boundary makes the first frame of every drawing blank.
 *
 * Pure and O(n) over the event list. A review is a few hundred events at most, and playback
 * calls this every animation frame -- so no allocation beyond the result, and no sorting: the
 * caller passes events already in time order (the route returns them ordered, and the index on
 * (review_id, t) is what makes that free).
 */
export function visibleAt(events: ReviewEvent[], t: number, side?: ReviewSide): ReviewEvent[] {
  const out: ReviewEvent[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!isDrawing(e.payload.kind)) continue;
    if (e.t > t) continue;
    if (side && e.side !== "both" && e.side !== side) continue;

    if (e.holdSeconds != null) {
      if (t <= e.t + e.holdSeconds) out.push(e);
      continue;
    }

    // Held until the next boundary at or after this drawing's time. Scanning forward from i is
    // what keeps this linear overall rather than quadratic: the list is ordered, so the first
    // boundary found is the right one.
    let endsAt = Infinity;
    for (let j = i + 1; j < events.length; j++) {
      if (isBoundary(events[j].payload.kind)) {
        endsAt = events[j].t;
        break;
      }
    }
    // Strictly before the boundary: a scrub at 10s ends a mark held from 6s, and at exactly 10s
    // the coach is already somewhere else.
    if (t < endsAt) out.push(e);
  }
  return out;
}

/** The playback rate in force at time `t`, from the speed events. 1 when none has happened yet. */
export function speedAt(events: ReviewEvent[], t: number): number {
  let rate = 1;
  for (const e of events) {
    if (e.t > t) break;
    if (e.payload.kind === "speed") rate = e.payload.rate;
  }
  return rate;
}

/** How long the review runs: the last event's time, plus any hold it carries. */
export function reviewDuration(events: ReviewEvent[]): number {
  let end = 0;
  for (const e of events) {
    end = Math.max(end, e.t + (e.holdSeconds ?? 0));
  }
  return end;
}

// ---------------------------------------------------------------------------
// Voice-over: the clock model (Phase 3 of docs/video-review-plan.md)
// ---------------------------------------------------------------------------

/**
 * WHEN THERE IS A VOICE-OVER, THE AUDIO IS THE MASTER CLOCK.
 *
 * That inversion is the whole of Phase 3. Without narration the review timeline IS the left
 * clip's time and a scrub moves the video directly. With narration the coach's voice is the
 * thing that must not stutter -- an audio track that jumps is unlistenable, where a video that
 * lags by a frame is not noticed -- so the audio plays straight through and everything else is
 * derived from where it has got to.
 *
 * The derivation is not the identity, and that is the part worth being careful about: while
 * recording, the coach changes the playback SPEED. Ten seconds of narration over a clip playing
 * at 0.25x has advanced the video two and a half seconds, not ten. So video time is the integral
 * of the speed events over the audio timeline, and a review that ignored speed would drift
 * further out of sync the longer the coach talked -- worst exactly where they slowed down to
 * point something out, which is the moment they most wanted synchronised.
 */

/** The left clip's time at `audioT` seconds into the narration.
 *
 * `startAt` is where the video was when recording began -- a coach who scrubs to the third rep
 * and then starts talking is narrating from there, not from zero.
 */
export function videoTimeForAudioTime(
  events: ReviewEvent[],
  audioT: number,
  startAt = 0,
): number {
  let video = startAt;
  let rate = 1;
  let last = 0;

  for (const e of events) {
    if (e.t > audioT) break;
    // Advance at the rate in force since the previous event.
    video += (e.t - last) * rate;
    last = e.t;
    if (e.payload.kind === "speed") {
      rate = e.payload.rate;
    } else if (e.payload.kind === "scrub") {
      // A scrub during recording moves the video without consuming audio time: the coach
      // jumped, and from here the clip runs on from the new position.
      video = e.payload.to;
    }
  }
  return video + (audioT - last) * rate;
}

/** The right clip's time for a left clip time, through the saved sync marks.
 *
 * Identical to the live compare tool's linkedTime and deliberately restated here rather than
 * imported from client code: shared/ cannot depend on client/, and a review's playback has to
 * agree with the tool that produced it to the frame. */
export function rightTimeForLeftTime(leftT: number, syncL: number, syncR: number): number {
  return leftT - syncL + syncR;
}

/** Where the audio should be to put the LEFT clip at `videoT` -- the inverse, for scrubbing the
 * review timeline while narration exists.
 *
 * Returns null when the video time is never reached (the coach scrubbed past it and never came
 * back), so the caller can refuse the seek rather than guess at an audio position. A silent
 * clamp to the end is the wrong answer: it plays the wrong part of the narration over the frame
 * the reader asked for.
 */
export function audioTimeForVideoTime(
  events: ReviewEvent[],
  videoT: number,
  startAt = 0,
  audioDuration = Infinity,
): number | null {
  let video = startAt;
  let rate = 1;
  let last = 0;

  const reachedIn = (fromVideo: number, toVideo: number, atRate: number, fromAudio: number) => {
    if (atRate <= 0) return null;
    const between = (videoT - fromVideo) / atRate;
    if (between < 0) return null;
    const audioAt = fromAudio + between;
    return toVideo >= videoT && audioAt >= fromAudio ? audioAt : null;
  };

  for (const e of events) {
    const segmentEnd = video + (e.t - last) * rate;
    const hit = reachedIn(video, segmentEnd, rate, last);
    if (hit != null) return hit;
    video = segmentEnd;
    last = e.t;
    if (e.payload.kind === "speed") rate = e.payload.rate;
    else if (e.payload.kind === "scrub") video = e.payload.to;
  }

  const finalEnd = video + (audioDuration - last) * rate;
  return reachedIn(video, finalEnd, rate, last);
}
