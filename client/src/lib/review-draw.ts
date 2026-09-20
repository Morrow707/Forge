import type { ReviewEvent, ReviewEventPayload } from "@shared/video-review";
import type { PoseFrame } from "@/lib/pose-tracking";

/**
 * Painting a review's drawings onto a canvas.
 *
 * Separate from the components for the same reason `visibleAt` is: the coach's editor and the
 * athlete's read-only player must produce identical pictures, and two copies of "how an arrow is
 * drawn" drift the moment one of them is touched. The editor decides WHAT is on screen (through
 * visibleAt) and this decides how it looks; neither knows anything about React.
 *
 * COORDINATES ARE NORMALISED (0..1) against the video's own box, never pixels. A review drawn on
 * a phone in portrait is replayed on a laptop in a 16:9 panel, and a pixel would land somewhere
 * else entirely -- usually somewhere plausible, which is worse than somewhere obviously wrong.
 * Every function here takes the canvas box and converts on the way out.
 */

export type Box = { width: number; height: number };

const px = (p: { x: number; y: number }, box: Box) => ({ x: p.x * box.width, y: p.y * box.height });

/** Line width that looks the same on a phone and a desktop: a fraction of the smaller edge
 * rather than a constant, so a 2px stroke does not become a hairline on a big canvas. */
function strokeWidth(box: Box, scale = 1): number {
  return Math.max(1.5, Math.min(box.width, box.height) * 0.005 * scale);
}

function arrowHead(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  size: number,
) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

/**
 * One event, painted.
 *
 * `frame` is the skeleton at the current moment, and it is what makes a guide FOLLOW a joint
 * rather than sit where it was dropped. That is the tool lifters reach for most: a plumb line
 * from the bar, a floor line, a hip-height line -- useful precisely because it tracks the body
 * through the rep instead of marking one instant of it. With no frame (a clip with no saved
 * skeleton) a joint-snapped guide falls back to its static position rather than disappearing.
 */
export function drawEvent(
  ctx: CanvasRenderingContext2D,
  event: ReviewEvent,
  box: Box,
  frame?: PoseFrame | null,
): void {
  const p = event.payload;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "color" in p ? p.color : "#ffffff";
  ctx.fillStyle = "color" in p ? p.color : "#ffffff";
  ctx.lineWidth = strokeWidth(box);

  switch (p.kind) {
    case "stroke": {
      if (p.points.length < 2) break;
      ctx.lineWidth = strokeWidth(box, p.width ?? 1);
      ctx.beginPath();
      const first = px(p.points[0], box);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < p.points.length; i++) {
        const q = px(p.points[i], box);
        ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
      break;
    }
    case "line": {
      const a = px(p.from, box);
      const b = px(p.to, box);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      break;
    }
    case "arrow": {
      const a = px(p.from, box);
      const b = px(p.to, box);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      arrowHead(ctx, a, b, strokeWidth(box) * 5);
      break;
    }
    case "circle": {
      const c = px(p.center, box);
      // Radius is normalised against the SMALLER edge so a circle stays a circle rather than
      // becoming an ellipse when the panel is not square.
      const r = p.radius * Math.min(box.width, box.height);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "box": {
      const a = px(p.from, box);
      const b = px(p.to, box);
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      break;
    }
    case "text": {
      const at = px(p.at, box);
      const size = Math.max(12, Math.min(box.width, box.height) * 0.045);
      ctx.font = `600 ${size}px system-ui, sans-serif`;
      ctx.textBaseline = "top";
      // Drawn over footage that may be any colour, so the label carries its own backing rather
      // than relying on the frame behind it being dark.
      const metrics = ctx.measureText(p.text);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(at.x - 4, at.y - 3, metrics.width + 8, size + 6);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, at.x, at.y);
      break;
    }
    case "angle": {
      const v = px(p.vertex, box);
      const a = px(p.a, box);
      const b = px(p.b, box);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(v.x, v.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      const size = Math.max(11, Math.min(box.width, box.height) * 0.04);
      ctx.font = `600 ${size}px system-ui, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(`${Math.round(p.degrees)}°`, v.x + 6, v.y + 6);
      break;
    }
    case "ruler": {
      const a = px(p.from, box);
      const b = px(p.to, box);
      ctx.setLineDash([strokeWidth(box) * 3, strokeWidth(box) * 2]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (p.label) {
        const size = Math.max(11, Math.min(box.width, box.height) * 0.04);
        ctx.font = `600 ${size}px system-ui, sans-serif`;
        ctx.textBaseline = "bottom";
        ctx.fillText(p.label, (a.x + b.x) / 2 + 6, (a.y + b.y) / 2 - 4);
      }
      break;
    }
    case "guide": {
      // The joint the guide is pinned to, if any -- this is what makes it follow the lift.
      let at = p.at;
      if (p.joint != null && frame) {
        const lm = frame.landmarks?.[p.joint];
        if (lm) at = p.orientation === "vertical" ? lm.x : lm.y;
      }
      ctx.setLineDash([strokeWidth(box) * 4, strokeWidth(box) * 3]);
      ctx.beginPath();
      if (p.orientation === "vertical") {
        ctx.moveTo(at * box.width, 0);
        ctx.lineTo(at * box.width, box.height);
      } else {
        ctx.moveTo(0, at * box.height);
        ctx.lineTo(box.width, at * box.height);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "barPath":
    case "trackedAngle":
      // Both are painted by the component, which owns the data they need (a stored bar-path
      // trace, and a per-frame angle series). Nothing to do from the event alone; listed
      // explicitly so a new kind cannot fall through this switch unnoticed.
      break;
    default:
      break;
  }
  ctx.restore();
}

/** Paints a whole frame's worth of drawings, in event order so later marks sit on top. */
export function drawEvents(
  ctx: CanvasRenderingContext2D,
  events: ReviewEvent[],
  box: Box,
  frame?: PoseFrame | null,
): void {
  for (const e of events) drawEvent(ctx, e, box, frame);
}

/** Which kinds this module actually paints. Exported so a test can hold it against the shared
 * kind list and fail when a tool ships that the renderer cannot draw -- the failure otherwise is
 * a drawing that saves correctly, replays as nothing, and looks like a data bug. */
export const PAINTED_KINDS: ReviewEventPayload["kind"][] = [
  "stroke",
  "line",
  "arrow",
  "circle",
  "box",
  "text",
  "angle",
  "ruler",
  "guide",
];
