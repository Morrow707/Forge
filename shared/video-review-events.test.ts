import { describe, it, expect } from "vitest";
import {
  REVIEW_EVENT_KINDS,
  DRAWING_KINDS,
  BOUNDARY_KINDS,
  reviewEventPayloadSchema,
  visibleAt,
  speedAt,
  reviewDuration,
  isDrawing,
  audioCuesCrossed,
  type ReviewEvent,
} from "./video-review";

// GIVEN EVENTS AND A TIME, WHICH DRAWINGS ARE VISIBLE.
//
// The renderer is the whole of playback: a saved review is data, and this function is what
// turns it back into something on screen. It runs every animation frame, on the coach's editor
// and on the athlete's read-only player, so the two cannot be allowed to disagree -- which is
// why it is one pure function in shared/ rather than logic inside either component.
//
// The cases below are the ones that decide whether a review feels right or feels broken. A
// drawing that survives a scrub sits over unrelated footage; a drawing that vanishes a frame
// early flickers; a drawing that cannot be scrubbed back to makes a review a one-way recording.

const draw = (t: number, over: Partial<ReviewEvent> = {}): ReviewEvent => ({
  t,
  side: "left",
  payload: { kind: "circle", center: { x: 0.5, y: 0.5 }, radius: 0.1, color: "#f00" },
  ...over,
});

const scrub = (t: number, to = 0): ReviewEvent => ({
  t,
  side: "both",
  payload: { kind: "scrub", to },
});

describe("the review event vocabulary", () => {
  it("declares a payload shape for every kind", () => {
    // The zod-strip lesson: a kind with no declared payload is a tool whose data vanishes
    // silently on the way into the database. Derived from the kind list rather than restated,
    // so adding a kind and forgetting the schema fails here.
    const declared = new Set(
      reviewEventPayloadSchema.options.map((o) => o.shape.kind.value as string),
    );
    const missing = REVIEW_EVENT_KINDS.filter((k) => !declared.has(k));
    expect(missing, "a kind with no payload schema loses its data on insert").toEqual([]);
  });

  it("declares nothing the kind list does not know about", () => {
    const known = new Set<string>(REVIEW_EVENT_KINDS);
    const extra = reviewEventPayloadSchema.options
      .map((o) => o.shape.kind.value as string)
      .filter((k) => !known.has(k));
    expect(extra).toEqual([]);
  });

  it("splits kinds into drawings and transport, with nothing in both", () => {
    const both = DRAWING_KINDS.filter((k) => (BOUNDARY_KINDS as readonly string[]).includes(k));
    expect(both).toEqual([]);
    // Every drawing kind is a real kind.
    for (const k of DRAWING_KINDS) expect(REVIEW_EVENT_KINDS).toContain(k);
  });

  it("rejects a payload with coordinates outside the shape it claims", () => {
    // Normalised coordinates are the contract; a stroke missing its points is a drawing that
    // renders as nothing and is impossible to diagnose from the row.
    const bad = reviewEventPayloadSchema.safeParse({ kind: "stroke", color: "#fff" });
    expect(bad.success).toBe(false);
  });
});

describe("visibleAt", () => {
  it("shows nothing before the drawing's own time", () => {
    expect(visibleAt([draw(5)], 4.9)).toEqual([]);
  });

  it("shows a drawing at exactly its own time", () => {
    // Excluding the boundary makes the first frame of every drawing blank, which reads as a
    // flicker rather than as an off-by-one.
    expect(visibleAt([draw(5)], 5)).toHaveLength(1);
  });

  it("holds a drawing until the next scrub", () => {
    const events = [draw(5), scrub(10)];
    expect(visibleAt(events, 7)).toHaveLength(1);
    expect(visibleAt(events, 9.99)).toHaveLength(1);
    // At the scrub itself the coach is already somewhere else.
    expect(visibleAt(events, 10)).toHaveLength(0);
  });

  it("holds a drawing forever when nothing bounds it", () => {
    expect(visibleAt([draw(5)], 10_000)).toHaveLength(1);
  });

  it("honours an explicit hold and drops it on time", () => {
    const events = [draw(5, { holdSeconds: 3 })];
    expect(visibleAt(events, 7.9)).toHaveLength(1);
    expect(visibleAt(events, 8)).toHaveLength(1);
    expect(visibleAt(events, 8.01)).toHaveLength(0);
  });

  it("lets an explicit hold outlive a scrub", () => {
    // "Keep this on screen for N seconds" is a deliberate pin; a boundary must not override it,
    // or the pin does nothing in exactly the case somebody bothered to set it.
    const events = [draw(5, { holdSeconds: 10 }), scrub(6)];
    expect(visibleAt(events, 8)).toHaveLength(1);
  });

  it("is scrubbable backwards", () => {
    // The property that makes a review a document rather than a recording.
    const events = [draw(2), scrub(4), draw(6)];
    expect(visibleAt(events, 7)).toHaveLength(1);
    expect(visibleAt(events, 3)).toHaveLength(1);
    expect(visibleAt(events, 1)).toHaveLength(0);
  });

  it("filters by side, and 'both' always shows", () => {
    const events = [
      draw(1, { side: "left" }),
      draw(1, { side: "right" }),
      draw(1, { side: "both" }),
    ];
    expect(visibleAt(events, 2, "left")).toHaveLength(2);
    expect(visibleAt(events, 2, "right")).toHaveLength(2);
    expect(visibleAt(events, 2)).toHaveLength(3);
  });

  it("never returns a transport event as a drawing", () => {
    const events: ReviewEvent[] = [
      scrub(1),
      { t: 1, side: "both", payload: { kind: "pause" } },
      { t: 1, side: "both", payload: { kind: "speed", rate: 0.5 } },
    ];
    expect(visibleAt(events, 5)).toEqual([]);
  });

  it("handles an empty log", () => {
    expect(visibleAt([], 5)).toEqual([]);
  });

  it("agrees with isDrawing about every kind it returns", () => {
    const events = REVIEW_EVENT_KINDS.map((kind, i) => draw(i, {
      payload: { kind: "circle", center: { x: 0, y: 0 }, radius: 1, color: "#000" },
    }));
    for (const e of visibleAt(events, 1000)) expect(isDrawing(e.payload.kind)).toBe(true);
  });
});

describe("speedAt", () => {
  it("is 1 before any speed event", () => {
    expect(speedAt([draw(1)], 5)).toBe(1);
  });

  it("takes the most recent speed at or before t", () => {
    const events: ReviewEvent[] = [
      { t: 1, side: "both", payload: { kind: "speed", rate: 0.5 } },
      { t: 5, side: "both", payload: { kind: "speed", rate: 0.25 } },
    ];
    expect(speedAt(events, 0.5)).toBe(1);
    expect(speedAt(events, 1)).toBe(0.5);
    expect(speedAt(events, 4.9)).toBe(0.5);
    expect(speedAt(events, 5)).toBe(0.25);
    expect(speedAt(events, 99)).toBe(0.25);
  });
});

describe("reviewDuration", () => {
  it("is zero for an empty review", () => {
    expect(reviewDuration([])).toBe(0);
  });

  it("counts a trailing hold", () => {
    // A review whose last act is a pinned drawing runs until that pin expires, or playback cuts
    // off the thing the coach most wanted seen.
    expect(reviewDuration([draw(10, { holdSeconds: 4 })])).toBe(14);
  });

  it("takes the furthest end, not the last event", () => {
    expect(reviewDuration([draw(10, { holdSeconds: 20 }), draw(12)])).toBe(30);
  });
});

describe("audio cues fire once, on the interval that crosses them", () => {
  const withCue = (t: number, audioUrl: string | null): ReviewEvent => ({
    t,
    side: "left",
    payload: { kind: "cue", text: "Knees out", audioUrl, color: "#fff" },
  });

  it("fires a cue the step crossed, and not the one it has not reached", () => {
    const events = [withCue(1.0, "/uploads/reviews/a.m4a"), withCue(5.0, "/uploads/reviews/b.m4a")];
    expect(audioCuesCrossed(events, 0.9, 1.02)).toEqual([{ t: 1, audioUrl: "/uploads/reviews/a.m4a" }]);
    expect(audioCuesCrossed(events, 1.02, 1.05)).toEqual([]);
  });

  it("does not fire a cue that has no recording", () => {
    // A text-only cue is drawn, not played. Firing it would be an empty <audio> per tap.
    expect(audioCuesCrossed([withCue(1, null)], 0.5, 1.5)).toEqual([]);
  });

  it("fires nothing on a backwards seek, so a rewind re-arms rather than replays mid-jump", () => {
    const events = [withCue(1, "/a.m4a")];
    expect(audioCuesCrossed(events, 5, 0)).toEqual([]);
    // ...and the next forward step across it plays it again, which is what a listener who
    // rewound to hear it asked for.
    expect(audioCuesCrossed(events, 0.5, 1.5)).toHaveLength(1);
  });

  it("fires every cue inside one slow frame, not just the last", () => {
    // A rAF loop can skip 300ms under load. Dropping the earlier cue would silently lose a
    // thing the coach said.
    const events = [withCue(1, "/a.m4a"), withCue(1.1, "/b.m4a")];
    expect(audioCuesCrossed(events, 0.9, 1.2)).toHaveLength(2);
  });
});
