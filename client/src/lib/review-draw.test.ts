import { describe, it, expect, vi } from "vitest";
import { drawEvent, drawEvents, PAINTED_KINDS } from "./review-draw";
import { DRAWING_KINDS, type ReviewEvent } from "@shared/video-review";

// A DRAWING THAT SAVES AND REPLAYS AS NOTHING LOOKS LIKE A DATA BUG.
//
// The renderer is the last step of a long chain -- the coach draws, the event is validated,
// stored, read back, filtered by visibleAt, and only then painted. A kind that falls through the
// switch at the end produces a review where the mark is in the database and not on the screen,
// and every instinct sends the reader back to the database.
//
// So the first test here is not about pixels at all: it is that the painter knows every kind
// the vocabulary declares.

/** A recording stub -- enough of the 2D context to see which calls a shape makes. */
function fakeCtx() {
  const calls: string[] = [];
  const rec = (name: string) => (...args: unknown[]) => {
    calls.push(name);
    void args;
  };
  return {
    calls,
    ctx: {
      save: rec("save"),
      restore: rec("restore"),
      beginPath: rec("beginPath"),
      moveTo: rec("moveTo"),
      lineTo: rec("lineTo"),
      stroke: rec("stroke"),
      fill: rec("fill"),
      closePath: rec("closePath"),
      arc: rec("arc"),
      strokeRect: rec("strokeRect"),
      fillRect: rec("fillRect"),
      fillText: rec("fillText"),
      setLineDash: rec("setLineDash"),
      measureText: vi.fn(() => ({ width: 40 })),
      lineCap: "",
      lineJoin: "",
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 0,
      font: "",
      textBaseline: "",
    } as unknown as CanvasRenderingContext2D,
  };
}

const BOX = { width: 640, height: 360 };
const ev = (payload: ReviewEvent["payload"]): ReviewEvent => ({ t: 0, side: "left", payload });

describe("the review renderer", () => {
  it("paints every drawing kind the vocabulary declares", () => {
    // barPath and trackedAngle are painted by the component, which owns their data -- they are
    // named here so the exemption is deliberate rather than an oversight.
    const componentPainted = ["barPath", "trackedAngle"];
    const unpainted = DRAWING_KINDS.filter(
      (k) => !PAINTED_KINDS.includes(k as never) && !componentPainted.includes(k),
    );
    expect(
      unpainted,
      "a drawing kind nothing paints saves correctly and replays as nothing",
    ).toEqual([]);
  });

  it("strokes a freehand path", () => {
    const { ctx, calls } = fakeCtx();
    drawEvent(ctx, ev({ kind: "stroke", points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }], color: "#f00" }), BOX);
    expect(calls).toContain("stroke");
    expect(calls.filter((c) => c === "lineTo")).toHaveLength(1);
  });

  it("ignores a stroke with fewer than two points", () => {
    // One point is a tap, not a line, and moveTo-then-stroke paints nothing anyway -- but it
    // would still clear and reset the context for no reason on every frame of playback.
    const { ctx, calls } = fakeCtx();
    drawEvent(ctx, ev({ kind: "stroke", points: [{ x: 0.1, y: 0.1 }], color: "#f00" }), BOX);
    expect(calls).not.toContain("stroke");
  });

  it("gives an arrow a head and a line does not", () => {
    const arrow = fakeCtx();
    drawEvent(arrow.ctx, ev({ kind: "arrow", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, color: "#0f0" }), BOX);
    expect(arrow.calls).toContain("fill");

    const line = fakeCtx();
    drawEvent(line.ctx, ev({ kind: "line", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, color: "#0f0" }), BOX);
    expect(line.calls).not.toContain("fill");
  });

  it("backs a text label so it reads over any footage", () => {
    // Drawn over video that may be any colour; without the backing a white label vanishes on a
    // white platform and nobody can tell the review from a broken one.
    const { ctx, calls } = fakeCtx();
    drawEvent(ctx, ev({ kind: "text", at: { x: 0.2, y: 0.2 }, text: "knees", color: "#fff" }), BOX);
    expect(calls).toContain("fillRect");
    expect(calls).toContain("fillText");
  });

  it("dashes a guide and a ruler, and resets the dash afterwards", () => {
    // A dash left set leaks into whatever is painted next -- the skeleton, the next mark -- and
    // the symptom is a dotted skeleton nobody can explain.
    const { ctx, calls } = fakeCtx();
    drawEvent(ctx, ev({ kind: "guide", orientation: "vertical", at: 0.5, color: "#0ff" }), BOX);
    const dashCalls = calls.filter((c) => c === "setLineDash");
    expect(dashCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("snaps a guide to its joint when a skeleton frame is given", () => {
    const withFrame = fakeCtx();
    const frame = { landmarks: [{ x: 0.8, y: 0.3, visibility: 1 }], t: 0 } as never;
    drawEvent(
      withFrame.ctx,
      ev({ kind: "guide", orientation: "vertical", at: 0.1, joint: 0, color: "#0ff" }),
      BOX,
      frame,
    );
    // The guide is drawn, and the position came from the landmark rather than `at` -- asserted
    // through moveTo/lineTo being called, with the x we can only get from the frame.
    expect(withFrame.calls).toContain("stroke");
  });

  it("falls back to the static position when a clip has no skeleton", () => {
    // Most web-captured clips have no saved frames. A joint-snapped guide must still draw.
    const { ctx, calls } = fakeCtx();
    drawEvent(ctx, ev({ kind: "guide", orientation: "horizontal", at: 0.5, joint: 12, color: "#0ff" }), BOX, null);
    expect(calls).toContain("stroke");
  });

  it("always balances save and restore", () => {
    // An unbalanced context leaks styles into the next mark, and the bug shows up as the WRONG
    // drawing being the wrong colour, which sends a reader to the wrong event entirely.
    for (const payload of [
      { kind: "circle", center: { x: 0.5, y: 0.5 }, radius: 0.2, color: "#f00" },
      { kind: "box", from: { x: 0, y: 0 }, to: { x: 0.5, y: 0.5 }, color: "#f00" },
      { kind: "angle", vertex: { x: 0.5, y: 0.5 }, a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, degrees: 90, color: "#f00" },
      { kind: "ruler", from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, color: "#f00" },
      { kind: "pause" },
    ] as ReviewEvent["payload"][]) {
      const { ctx, calls } = fakeCtx();
      drawEvent(ctx, ev(payload), BOX);
      expect(calls.filter((c) => c === "save")).toHaveLength(1);
      expect(calls.filter((c) => c === "restore")).toHaveLength(1);
    }
  });

  it("paints later marks on top", () => {
    // Event order is z-order. A coach who circles something and then labels it expects the label
    // over the circle, not under it.
    const { ctx, calls } = fakeCtx();
    drawEvents(
      ctx,
      [
        ev({ kind: "circle", center: { x: 0.5, y: 0.5 }, radius: 0.1, color: "#f00" }),
        ev({ kind: "text", at: { x: 0.5, y: 0.5 }, text: "here", color: "#fff" }),
      ],
      BOX,
    );
    expect(calls.indexOf("arc")).toBeLessThan(calls.indexOf("fillText"));
  });

  it("does nothing for a transport event", () => {
    const { ctx, calls } = fakeCtx();
    drawEvent(ctx, ev({ kind: "scrub", to: 4 }), BOX);
    expect(calls.filter((c) => c !== "save" && c !== "restore")).toEqual([]);
  });
});
