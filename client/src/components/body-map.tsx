import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SCORABLE_MUSCLE_GROUPS } from "@shared/strength-score";
import MANIFEST from "@/lib/body-map-manifest.json";

/**
 * ONE ANATOMICAL FIGURE, EVERYWHERE A MUSCLE IS DRAWN.
 *
 * A filter in the exercise picker (tap a muscle, see the exercises that train it), a readout on
 * the strength profile, and the body under the Muscle Load Map. One figure, three jobs: two
 * figures of the same athlete's muscles will always drift, and the one that drifts is the one
 * showing somebody their own body.
 *
 * IT IS A 3D RENDER NOW, NOT A DRAWING (2026-11-10). Scott worked the figure in the Body Map
 * artifact through October and November -- Z-Anatomy's model, rendered, finished by
 * tools/body-map/ -- and on 2026-11-10: "upload the body map we're good where it's at". The
 * tiles in client/public/body-map/ are that artifact's, byte for byte, and the label maps beside
 * them say which muscle group every pixel belongs to. tools/body-map/README.md is the history,
 * including the head, which is the real head musculature rather than a drawn face.
 *
 * REGIONS ARE KEYED TO MUSCLE_GROUPS, not invented ids. The manifest's group list is the label
 * map's index, and body-map-regions.test.ts refuses a group the exercise taxonomy does not use --
 * a region keyed to anything else is a region nothing can ever fill.
 *
 * THE FIGURE IS CHOSEN BY THE VIEWER, NEVER BY users.gender. There is a female and a male figure
 * because the artifact has both; which one shows is a per-viewer preference kept in this browser.
 * Reading it off the account would make a category out of a field that exists for a percentile,
 * and would put a body type in front of a child as though it were theirs.
 *
 * LICENCE: the anatomy is Z-Anatomy (CC BY-SA 4.0), from BodyParts3D, DBCLS (CC BY-SA 2.1 JP),
 * and the credit line below is what that licence asks for. It is drawn on every figure large
 * enough to carry it.
 */

export type BodyMapView = "front" | "back";
export type BodyMapFigure = "female" | "male";

/** Kept for callers: the groups that get a label on each view, with the side the label sits on.
 *  `y` and `at` are filled from the manifest's anchors at render time. */
export type BodyMapLeader = {
  group: string;
  side: "left" | "right";
  y: number;
  at: [number, number];
};

type TileGroup = { count: number; ax: number; ay: number };
type Tile = { w: number; h: number; groups: Record<string, TileGroup>; edgeStep: number; edges: [number, number][] };
type Manifest = { groups: string[]; tiles: Record<string, Tile> };
const MAN = MANIFEST as unknown as Manifest;

/** Every number this figure is drawn with, named once. */
const PX = {
  rgba: 4, r: 0, g: 1, b: 2, a: 3,
  opaque: 255, edgeAlpha: 240, dimAlpha: 135, white: 255, grey: 128,
  edgeReach: 2,
} as const;
const GREY: [number, number, number] = [PX.grey, PX.grey, PX.grey];
const LAYOUT = {
  maxDpr: 2,
  gutterShare: 0.55, // of the figure's own width, each side, when labelled
  tintAlpha: 0.85,
  labelMargin: 10,
  /** Label text size against the box's width: readable on a phone's half-width cell, not
   *  shouting on a desktop. */
  fontPerWidth: 0.052,
  fontMin: 9,
  fontMax: 13,
  captionScale: 0.8,
  /** A row's height in font sizes, with and without a caption under it. */
  rowWithCaption: 2.3,
  rowBare: 1.45,
  /** Under this box width the credit is the short form, so it stays one line. */
  narrowCredit: 260,
  labelPasses: 6,
  leaderInset: 6,
  textInset: 2,
  textLift: 2,
  dotLift: 4,
  hitWidth: 96,
  hitHeight: 28,
  hitLift: 16,
  dot: { on: 3, off: 2.2, onAlpha: 0.95, offAlpha: 0.5 },
  line: { onAlpha: 0.9, offAlpha: 0.35, onWidth: 1.4, offWidth: 0.8 },
} as const;

export const BODY_MAP_CREDIT = "3D anatomy: Z-Anatomy (CC BY-SA 4.0), from BodyParts3D, DBCLS (CC BY-SA 2.1 JP)";
/** The same attribution in one line, for a figure in half a phone's width. */
export const BODY_MAP_CREDIT_SHORT = "Z-Anatomy, BodyParts3D · CC BY-SA";

/** What a group is called on the figure. Core is the obliques; Back is the upper back. */
const LABEL: Record<string, string> = {
  Core: "Obliques",
  Back: "Upper back",
  "Lower Back": "Lower back",
  "Hip Flexors": "Hip flexors",
};
export const bodyMapLabel = (group: string) => LABEL[group] ?? group;

const tileKey = (figure: BodyMapFigure, view: BodyMapView) => `${figure}-${view}`;
const HALF = 2;

/** A group is LABELLED on the view that holds it, not on a sliver that wraps round the
 *  silhouette: at least 12% of its own best tile, and more than 400 pixels. The artifact's rule
 *  (tools/body-map/README.md, 2026-11-09), which stopped the back of the body labelling Chest. */
const LABEL_SHARE = 0.12;
const LABEL_MIN_PX = 400;
export function groupIsOnView(group: string, view: BodyMapView, figure: BodyMapFigure = "male"): boolean {
  const here = MAN.tiles[tileKey(figure, view)]?.groups[group]?.count ?? 0;
  if (here <= LABEL_MIN_PX) return false;
  const best = Math.max(...Object.values(MAN.tiles).map((t) => t.groups[group]?.count ?? 0));
  return best <= 0 || here / best >= LABEL_SHARE;
}

/** Which groups each view labels, and on which side -- derived from the manifest, never typed. */
export const BODY_MAP_LEADERS: Record<BodyMapView, BodyMapLeader[]> = {
  front: leadersFor("front"),
  back: leadersFor("back"),
};
function leadersFor(view: BodyMapView): BodyMapLeader[] {
  const t = MAN.tiles[tileKey("male", view)];
  return MAN.groups
    .filter((g) => groupIsOnView(g, view))
    .map((g) => {
      const a = t.groups[g];
      return { group: g, side: a.ax < t.w / HALF ? "left" : "right", y: a.ay, at: [a.ax, a.ay] as [number, number] };
    });
}

/** Every group the figure can show, for tests and for callers that need the list. */
export const BODY_MAP_GROUPS = MAN.groups.filter((g) => groupIsOnView(g, "front") || groupIsOnView(g, "back"));

/** Groups that are scorable but have nowhere drawn -- the profile falls back to a list row for
 *  these rather than pretending they are not part of the score. */
export const UNDRAWN_SCORABLE_GROUPS = SCORABLE_MUSCLE_GROUPS.filter((g) => !BODY_MAP_GROUPS.includes(g));

/* ------------------------------------------------------------------ the figure preference */

const FIGURE_KEY = "forge.bodyMap.figure";
function readFigure(): BodyMapFigure {
  try {
    return localStorage.getItem(FIGURE_KEY) === "female" ? "female" : "male";
  } catch {
    return "male";
  }
}
function writeFigure(f: BodyMapFigure) {
  try {
    localStorage.setItem(FIGURE_KEY, f);
  } catch {
    // a per-viewer convenience: forgetting it costs a tap, nothing else
  }
}
const figureListeners = new Set<(f: BodyMapFigure) => void>();
function useFigure(): [BodyMapFigure, (f: BodyMapFigure) => void] {
  const [figure, setFigure] = useState<BodyMapFigure>(readFigure);
  useEffect(() => {
    figureListeners.add(setFigure);
    return () => {
      figureListeners.delete(setFigure);
    };
  }, []);
  return [
    figure,
    (f) => {
      writeFigure(f);
      figureListeners.forEach((l) => l(f));
    },
  ];
}

/* ------------------------------------------------------------------ assets */

type Loaded = { img: HTMLImageElement; w: number; h: number; label: Uint8Array; alpha: Uint8Array };
const loaded = new Map<string, Promise<Loaded>>();
const asset = (path: string) => `/body-map/${path}`;

function loadTile(key: string): Promise<Loaded> {
  const cached = loaded.get(key);
  if (cached) return cached;
  const p = new Promise<Loaded>((resolve, reject) => {
    const img = new Image();
    const lab = new Image();
    let n = 0;
    const done = () => {
      if (++n < 2) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const c = off.getContext("2d", { willReadFrequently: true });
      if (!c) return reject(new Error("no 2d context"));
      c.drawImage(lab, 0, 0);
      const ld = c.getImageData(0, 0, w, h).data;
      c.clearRect(0, 0, w, h);
      c.drawImage(img, 0, 0);
      const id = c.getImageData(0, 0, w, h).data;
      const label = Uint8Array.from({ length: w * h }, (_, i) => ld[i * PX.rgba + PX.r]);
      const alpha = Uint8Array.from({ length: w * h }, (_, i) => id[i * PX.rgba + PX.a]);
      resolve({ img, w, h, label, alpha });
    };
    img.onload = done;
    lab.onload = done;
    img.onerror = lab.onerror = () => {
      loaded.delete(key);
      reject(new Error(`body map tile ${key} did not load`));
    };
    img.src = asset(`img3d/${key}.webp`);
    lab.src = asset(`lab3d/${key}.png`);
  });
  loaded.set(key, p);
  return p;
}

const overlayCache = new Map<string, HTMLCanvasElement>();

/** The heat-map tint: each filled group takes its colour by the canvas "color" blend, so the
 *  render's own shading and fibre survive under it; an unfilled group goes grey, so "none logged"
 *  reads as none. Pixels in no group (the head, the hands, bone) are left exactly as rendered. */
function tintOverlay(key: string, a: Loaded, fills: Record<string, string>): HTMLCanvasElement {
  const sig = `${key}|${JSON.stringify(fills)}`;
  const hit = overlayCache.get(sig);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = a.w;
  c.height = a.h;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const probe = document.createElement("canvas").getContext("2d");
  const rgb = (css: string): [number, number, number] => {
    if (!probe) return GREY;
    probe.fillStyle = "#000";
    probe.fillStyle = css;
    probe.fillRect(0, 0, 1, 1);
    const d = probe.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const byIndex: ([number, number, number] | null)[] = MAN.groups.map((g) => (fills[g] ? rgb(fills[g]) : null));
  const out = ctx.createImageData(a.w, a.h);
  const d = out.data;
  a.label.forEach((gi, i) => {
    if (!gi || !a.alpha[i]) return;
    const col = byIndex[gi - 1] ?? GREY;
    const o = i * PX.rgba;
    d[o + PX.r] = col[0];
    d[o + PX.g] = col[1];
    d[o + PX.b] = col[2];
    d[o + PX.a] = PX.opaque;
  });
  ctx.putImageData(out, 0, 0);
  overlayCache.set(sig, c);
  return c;
}

/** The selected group outlined and everything else dimmed -- the artifact's selection. */
function selectionOverlay(key: string, a: Loaded, gi: number): HTMLCanvasElement {
  const sig = `${key}|sel|${gi}`;
  const hit = overlayCache.get(sig);
  if (hit) return hit;
  const { w, h, label, alpha } = a;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const out = ctx.createImageData(w, h);
  const d = out.data;
  const k = PX.edgeReach;
  label.forEach((own, i) => {
    if (!alpha[i]) return;
    const x = i % w;
    const y = (i - x) / w;
    const o = i * PX.rgba;
    if (own !== gi) {
      d[o + PX.a] = PX.dimAlpha;
      return;
    }
    const edge =
      (x >= k && label[i - k] !== gi) ||
      (x < w - k && label[i + k] !== gi) ||
      (y >= k && label[i - k * w] !== gi) ||
      (y < h - k && label[i + k * w] !== gi);
    if (!edge) return;
    d[o + PX.r] = PX.white;
    d[o + PX.g] = PX.white;
    d[o + PX.b] = PX.white;
    d[o + PX.a] = PX.edgeAlpha;
  });
  ctx.putImageData(out, 0, 0);
  overlayCache.set(sig, c);
  return c;
}

/** Push sorted label rows apart so none is closer than `gap`, then slide the column back inside
 *  [top, bottom]. Returns new positions; the input is not touched. */
export function spreadLabels(ys: number[], gap: number, top: number, bottom: number): number[] {
  const down = ys.reduce<number[]>((acc, y, i) => [...acc, i === 0 ? y : Math.max(y, acc[i - 1] + gap)], []);
  const over = down.length ? Math.max(0, down[down.length - 1] - bottom) : 0;
  const lifted = down.map((y) => y - over);
  const under = lifted.length ? Math.max(0, top - lifted[0]) : 0;
  return lifted.map((y) => y + under);
}

/** Move the labels nearest the midline from an over-full side to the other, until each side
 *  holds at most `capacity` (or both are full). Returns new items; the input is not touched. */
export function rebalanceSides<T extends { side: "left" | "right"; x: number }>(items: T[], capacity: number, mid: number): T[] {
  const count = (side: "left" | "right", list: T[]) => list.filter((i) => i.side === side).length;
  const moveOne = (list: T[]): T[] => {
    const [from, to] = count("left", list) > count("right", list) ? (["left", "right"] as const) : (["right", "left"] as const);
    if (count(from, list) <= capacity || count(to, list) >= capacity) return list;
    const nearest = list
      .filter((i) => i.side === from)
      .reduce((best, i) => (Math.abs(i.x - mid) < Math.abs(best.x - mid) ? i : best));
    return moveOne(list.map((i) => (i === nearest ? { ...i, side: to } : i)));
  };
  return moveOne(items);
}

/* ------------------------------------------------------------------ render */

export function BodyMap({
  view = "front",
  /** The one region that reads as selected. Single by design -- see the picker. */
  selected,
  /** Muscle group -> fill colour. With fills, every group without one goes grey. */
  fills,
  onSelect,
  className,
  /** Compact drops the credit line and the figure switch -- see the picker's mobile strip. */
  compact = false,
  /** Labels beside the figure. The caller supplies the caption for each group, so the figure
   *  never has to know what a set count is. */
  leaders,
  captionFor,
}: {
  view?: BodyMapView;
  selected?: string | null;
  fills?: Record<string, string>;
  onSelect?: (group: string) => void;
  className?: string;
  compact?: boolean;
  leaders?: BodyMapLeader[];
  captionFor?: (group: string) => string | null;
}) {
  // React's ids contain colons ("r:1:"), which are not safe inside a key used as an element id;
  // this drops every ":" -- ":r1:" becomes "r1", "r1" is left alone.
  // https://regex101.com/?regex=%3A&testString=%3Ar1%3A
  const uid = useId().replace(/:/g, "");
  const [figure, setFigure] = useFigure();
  const key = tileKey(figure, view);
  const tile = MAN.tiles[key];
  const interactive = typeof onSelect === "function";
  const labelled = !!leaders?.length;
  const gutter = labelled ? LAYOUT.gutterShare : 0;

  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tileData, setTileData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    let live = true;
    setFailed(false);
    const load = async () => {
      try {
        const t = await loadTile(key);
        if (live) setTileData(t);
      } catch {
        if (live) setFailed(true);
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, [key]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The figure's fitted box inside the container, in CSS pixels.
  const fit = useMemo(() => {
    if (!size.w || !size.h) return null;
    const totalW = tile.w * (1 + gutter * HALF);
    const s = Math.min(size.w / totalW, size.h / tile.h);
    const dw = tile.w * s;
    const dh = tile.h * s;
    return { s, ox: (size.w - dw) / HALF, oy: (size.h - dh) / HALF, dw, dh };
  }, [size, tile, gutter]);

  const fillsSig = JSON.stringify(fills ?? null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fit || !tileData || tileData.w !== tile.w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, LAYOUT.maxDpr);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(tileData.img, fit.ox, fit.oy, fit.dw, fit.dh);
    if (fills) {
      ctx.globalCompositeOperation = "color";
      ctx.globalAlpha = LAYOUT.tintAlpha;
      ctx.drawImage(tintOverlay(key, tileData, fills), fit.ox, fit.oy, fit.dw, fit.dh);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    if (selected) {
      const gi = MAN.groups.indexOf(selected) + 1;
      if (gi > 0) ctx.drawImage(selectionOverlay(key, tileData, gi), fit.ox, fit.oy, fit.dw, fit.dh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, tileData, key, selected, fillsSig]);

  const groupAt = (clientX: number, clientY: number): string | null => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || !fit || !tileData) return null;
    const x = Math.floor((clientX - box.left - fit.ox) / fit.s);
    const y = Math.floor((clientY - box.top - fit.oy) / fit.s);
    if (x < 0 || y < 0 || x >= tileData.w || y >= tileData.h) return null;
    const gi = tileData.label[y * tileData.w + x];
    return gi ? MAN.groups[gi - 1] : null;
  };

  // Labels: the caller's leaders for this view, at the manifest's anchors, kept INSIDE the box.
  // A side that cannot hold its labels hands the ones nearest the midline to the other side --
  // a bilateral muscle's anchor is whichever half was larger, so one column can get most of them.
  const fontSize = Math.min(LAYOUT.fontMax, Math.max(LAYOUT.fontMin, size.w * LAYOUT.fontPerWidth));
  const rowGap = fontSize * (captionFor ? LAYOUT.rowWithCaption : LAYOUT.rowBare);
  const labels = useMemo(() => {
    if (!labelled || !fit) return [];
    const mid = fit.ox + fit.dw / HALF;
    const items = (leaders ?? [])
      .filter((l) => tile.groups[l.group])
      .map((l) => {
        const a = tile.groups[l.group];
        const x = fit.ox + a.ax * fit.s;
        return { group: l.group, side: (x < mid ? "left" : "right") as "left" | "right", x, y: fit.oy + a.ay * fit.s };
      });
    const capacity = Math.max(1, Math.floor((size.h - LAYOUT.labelMargin * HALF) / rowGap) + 1);
    const balanced = rebalanceSides(items, capacity, mid);
    return (["left", "right"] as const).flatMap((side) => {
      const col = balanced.filter((i) => i.side === side).sort((a, b) => a.y - b.y);
      const ys = spreadLabels(col.map((c) => c.y), rowGap, LAYOUT.labelMargin, size.h - LAYOUT.labelMargin);
      return col.map((c, i) => ({ ...c, ly: ys[i] }));
    });
  }, [labelled, leaders, fit, tile, size.h, rowGap]);

  const ariaTitle = `${view === "front" ? "Front" : "Back"} of the body${interactive ? ", choose a muscle group" : ""}`;
  const groupsHere = MAN.groups.filter((g) => groupIsOnView(g, view, figure));

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* THE BOX KEEPS THE FIGURE'S OWN PROPORTIONS. The SVG this replaced sized itself from its
          viewBox, so a caller could drop it in a grid cell with no height (the Muscle Load Map
          does) and it still drew. A canvas has no intrinsic size, so the box carries the aspect
          ratio; where the parent does give a height (the picker's h-80), flex-1 takes it and the
          figure is fitted inside. The caller's className lands here, on the box. */}
      <div
        ref={boxRef}
        className={cn("relative min-h-0 w-full flex-auto select-none", interactive && "cursor-pointer", className)}
        style={{ aspectRatio: `${tile.w * (1 + gutter * HALF)} / ${tile.h}` }}
        role="img"
        aria-label={ariaTitle}
        onClick={(e) => {
          if (!interactive) return;
          const g = groupAt(e.clientX, e.clientY);
          if (g) onSelect!(g);
        }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {failed && (
          <p className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-muted-foreground">
            The body map could not load.
          </p>
        )}
        {labelled && fit && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {labels.map((l) => {
              const isSelected = selected === l.group;
              // The text hugs the box's own edge and the line runs from it to the muscle, so a
              // label can never leave the box -- in a phone's half-width cell, leaving it means
              // landing on the neighbouring figure.
              const textX = l.side === "left" ? LAYOUT.textInset : size.w - LAYOUT.textInset;
              const edge = l.side === "left" ? fit.ox - LAYOUT.leaderInset : fit.ox + fit.dw + LAYOUT.leaderInset;
              const caption = captionFor?.(l.group);
              return (
                <g key={`${uid}-${l.group}`}>
                  <line
                    x1={Math.min(Math.max(edge, LAYOUT.textInset), size.w - LAYOUT.textInset)}
                    y1={l.ly - LAYOUT.dotLift}
                    x2={l.x}
                    y2={l.y}
                    stroke="currentColor"
                    strokeOpacity={isSelected ? LAYOUT.line.onAlpha : LAYOUT.line.offAlpha}
                    strokeWidth={isSelected ? LAYOUT.line.onWidth : LAYOUT.line.offWidth}
                  />
                  <circle
                    cx={l.x}
                    cy={l.y}
                    r={isSelected ? LAYOUT.dot.on : LAYOUT.dot.off}
                    fill="currentColor"
                    fillOpacity={isSelected ? LAYOUT.dot.onAlpha : LAYOUT.dot.offAlpha}
                  />
                  <text
                    x={textX}
                    y={l.ly - LAYOUT.textLift}
                    textAnchor={l.side === "left" ? "start" : "end"}
                    fontSize={fontSize}
                    className={cn("tracking-wide", isSelected ? "fill-foreground" : "fill-muted-foreground")}
                  >
                    {bodyMapLabel(l.group)}
                  </text>
                  {caption && (
                    <text
                      x={textX}
                      y={l.ly + fontSize}
                      textAnchor={l.side === "left" ? "start" : "end"}
                      fontSize={fontSize * LAYOUT.captionScale}
                      className="fill-muted-foreground opacity-70"
                    >
                      {caption}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {/* The label is a tap target too, not just the muscle. Real buttons, positioned over each
            label, so they also give every group a keyboard path -- a canvas has none of its own. */}
        {interactive &&
          labelled &&
          fit &&
          labels.map((l) => {
            const width = Math.min(LAYOUT.hitWidth, fit.ox);
            return (
              <button
                key={`${uid}-hit-${l.group}`}
                type="button"
                role="button"
                tabIndex={0}
                aria-pressed={selected === l.group}
                aria-label={bodyMapLabel(l.group)}
                className="absolute rounded outline-none focus-visible:ring-2 focus-visible:ring-primary"
                style={{
                  left: l.side === "left" ? 0 : size.w - width,
                  top: l.ly - LAYOUT.hitLift,
                  width,
                  height: LAYOUT.hitHeight,
                  background: "transparent",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect!(l.group);
                }}
              />
            );
          })}
      </div>
      {/* Without labels, the keyboard path is a visually hidden list of the groups on this view. */}
      {interactive && !labelled && (
        <div className="sr-only">
          {groupsHere.map((g) => (
            <button
              key={`${uid}-kb-${g}`}
              type="button"
              role="button"
              tabIndex={0}
              aria-pressed={selected === g}
              onClick={() => onSelect!(g)}
            >
              {bodyMapLabel(g)}
            </button>
          ))}
        </div>
      )}
      {!compact && (interactive || labelled) && (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span
            className={cn(
              "min-w-0 text-[9px] leading-tight text-muted-foreground/70",
              size.w < LAYOUT.narrowCredit && "basis-full",
            )}
            title={BODY_MAP_CREDIT}
          >
            {size.w < LAYOUT.narrowCredit ? BODY_MAP_CREDIT_SHORT : BODY_MAP_CREDIT}
          </span>
          <span className="flex shrink-0 overflow-hidden rounded-md border border-border text-[11px]" role="group" aria-label="Figure">
            {(["female", "male"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFigure(f);
                }}
                aria-pressed={figure === f}
                className={cn("px-2 py-0.5", figure === f ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                {f === "female" ? "Female" : "Male"}
              </button>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
