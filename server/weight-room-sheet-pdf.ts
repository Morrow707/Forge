/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/no-param-reassign -- the page geometry below is a table of named measurements in points, and a layout cursor is a mutable accumulator by design; the behaviour is pinned by weight-room-sheet-pdf.test.ts */
/* THE PRINTED WEIGHT-ROOM SHEET (2026-11-21): the PDF drawn from the same SheetModel the coach's
 * editor shows (shared/weight-room-sheet.ts buildSheet), so what prints is what was on screen.
 *
 * Two halves, so the drawing can be tested without reading a PDF back:
 *   - `planSheet(model, ...)` is PURE: it lays the model out into a list of drawing operations
 *     (text, boxes, tints, the QR, the star) page by page. Every toggle the coach turned off is
 *     simply absent from the model, so it is absent from the plan.
 *   - `renderSheetPdf` hands that plan to pdfkit, with the program's brand band on every page.
 *
 * Paging rules: a group (roster group or position) starts a new page with its name; a row or a
 * card is never split across a page; a lift's header row repeats at the top of a continued page.
 * Body text and write-in boxes are dark grey on white so the sheet prints in black and white; the
 * brand color appears only as the band and a light tint behind table headers, and a superset's
 * hue is extra: its letters and its box carry it without color.
 */
import PDFDocument from "pdfkit";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { pickReadableTextHex } from "@shared/color-contrast";
import { supersetHexForLabel } from "@shared/superset-colors";
import {
  BOX_HINT,
  CARDS_PER_PAGE,
  acrossBands,
  boxesInBlock,
  paginate,
  rowsPerPage,
  type SheetAthleteRow,
  type SheetBlock,
  type SheetModel,
} from "@shared/weight-room-sheet";
import { FORGE_PDF_ORANGE, drawPdfBrandBand, pdfGeneratedBy, type PdfBrand } from "./pdf-brand";

/* ---------------------------------------------------------------- page geometry, in points */

const PAGE_SIZES = { letter: { w: 612, h: 792 }, a4: { w: 595.28, h: 841.89 } } as const;
const L = {
  margin: 36,
  band: 90,
  afterBand: 8,
  headerLine: 13,
  footer: 22,
  coachNotes: 54,
  blockTitle: 15,
  blockMeta: 11,
  blockGap: 10,
  headerRow: 16,
  row: 20,
  nameCol: 118,
  acrossNameCol: 100,
  maxCol: 54,
  targetCol: 66,
  lastCol: 54,
  platesCol: 92,
  customCol: 60,
  rpeCol: 30,
  minBox: 30,
  supersetRule: 4,
  qr: 54,
  cardGap: 12,
  cardTitle: 16,
  cardLift: 26,
  cardLiftsGap: 4,
  star: 4,
  textInset: 3,
  groupTitle: 16,
} as const;
const TYPE = { body: 8, small: 7, target: 9.5, title: 10, meta: 7, group: 12 } as const;
const INK = "#222222";
const SOFT_INK = "#555555";
const RULE = "#9a9a9a";
const WHITE = "#ffffff";
/** How far a header tint is mixed toward white: 0.85 keeps it pale enough to print grey. */
const TINT_TOWARD_WHITE = 0.85;
const SUPERSET_TINT_TOWARD_WHITE = 0.92;
const HEX_LENGTH = 6;
const HEX_RADIX = 16;
const BYTE = 255;
const RED_AT = 0;
const GREEN_AT = 2;
const BLUE_AT = 4;
const PAIR = 2;
const HALF = 2;
const STAR_POINTS = 5;
const STAR_INNER = 0.45;
const FULL_TURN = Math.PI * 2;
const QUARTER_TURN = Math.PI / 2;

/** Mixes a #rrggbb toward white by `amount` (0 the color, 1 white). */
export function tint(hex: string, amount: number): string {
  const clean = hex.trim().replace("#", "");
  if (clean.length !== HEX_LENGTH) return "#eeeeee";
  const mix = (at: number) => {
    const c = parseInt(clean.slice(at, at + PAIR), HEX_RADIX);
    return Math.round(c + (BYTE - c) * amount).toString(HEX_RADIX).padStart(PAIR, "0");
  };
  return `#${mix(RED_AT)}${mix(GREEN_AT)}${mix(BLUE_AT)}`;
}

/* ---------------------------------------------------------------- the plan */

export type DrawOp =
  | { op: "page" }
  | { op: "band"; subtitle: string }
  | { op: "text"; text: string; x: number; y: number; w: number; size: number; bold?: boolean; color?: string }
  | { op: "rect"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string }
  | { op: "qr"; x: number; y: number; size: number; url: string }
  | { op: "star"; x: number; y: number; r: number };

export type SheetPlan = { size: { w: number; h: number }; ops: DrawOp[] };

type Cursor = { ops: DrawOp[]; y: number };

const text = (c: Cursor, value: string, x: number, w: number, size: number, opts: { bold?: boolean; color?: string; dy?: number } = {}) => {
  if (!value) return;
  c.ops.push({ op: "text", text: value, x, y: c.y + (opts.dy ?? 0), w, size, bold: opts.bold, color: opts.color ?? INK });
};

/** A superset's rest line is already a sentence ("Rest 90 s after B2"); a lone lift's is a value. */
function restText(block: SheetBlock): string | null {
  if (!block.rest) return null;
  return block.superset ? block.rest : `Rest ${block.rest}`;
}

const sideLetter = (i: number) => (i % PAIR === 0 ? "L" : "R");

/** "1", "2"... or, on a one-side lift, "1 L", "1 R", "2 L"... */
function setLabel(block: { sides: boolean }, i: number, gap: string): string {
  if (!block.sides) return String(i + 1);
  return `${Math.floor(i / PAIR) + 1}${gap}${sideLetter(i)}`;
}

function prescriptionLine(block: SheetBlock): string {
  const kind = block.kind === "load" ? "" : ` (${BOX_HINT[block.kind]})`;
  const sides = block.sides ? " each side" : "";
  return [
    `${block.sets} × ${block.reps}${sides}${kind}`,
    block.effort,
    block.goal,
    restText(block),
  ]
    .filter(Boolean)
    .join("  ·  ");
}

type Column = { key: string; label: string; w: number };

/** The columns of one lift's table, in the team view. */
function teamColumns(model: SheetModel, block: SheetBlock, width: number): Column[] {
  const fixed: Column[] = [
    { key: "name", label: "Athlete", w: L.nameCol },
    ...(model.blocks.length && model.groups.some((g) => g.rows.some((r) => r.cells.some((c) => c.max != null))) ? [{ key: "max", label: "Max", w: L.maxCol }] : []),
    ...(block.bodyweight || model.groups.some((g) => g.rows.some((r) => r.cells.some((c) => c.target != null))) ? [{ key: "target", label: "Target", w: L.targetCol }] : []),
    ...(model.groups.some((g) => g.rows.some((r) => r.cells.some((c) => c.last != null))) ? [{ key: "last", label: "Last", w: L.lastCol }] : []),
    ...(block.kind === "load" && model.groups.some((g) => g.rows.some((r) => r.cells.some((c) => c.plates != null))) ? [{ key: "plates", label: "Plates", w: L.platesCol }] : []),
  ];
  const rpe: Column[] = { lift: [{ key: "rpe", label: "RPE", w: L.rpeCol }], set: [], off: [] }[model.rpe];
  const custom = model.customColumns.map((c) => ({ key: `custom:${c.id}`, label: c.header, w: L.customCol }));
  const setCount = block.sides ? block.sets * PAIR : block.sets;
  const perSetRpe = model.rpe === "set" ? block.sets : 0;
  const used = [...fixed, ...rpe, ...custom].reduce((n, col) => n + col.w, 0);
  const boxW = Math.max(L.minBox, (width - used) / Math.max(1, setCount + perSetRpe));
  const sets: Column[] = Array.from({ length: setCount }, (_, i) => {
    return { key: `set:${i}`, label: setLabel(block, i, " "), w: boxW };
  });
  const setRpe: Column[] = Array.from({ length: perSetRpe }, (_, i) => ({ key: `rpe:${i}`, label: `RPE ${i + 1}`, w: boxW }));
  return [...fixed, ...sets, ...setRpe, ...rpe, ...custom];
}

function cellText(row: SheetAthleteRow, blockIndex: number, key: string): { value: string; bold?: boolean; pr?: boolean } {
  const cell = row.cells[blockIndex];
  if (key === "name") return { value: row.onDay ? row.displayName : `${row.displayName} (not on this day)` };
  if (key === "max") return { value: cell.max ?? "" };
  if (key === "target") return { value: cell.target ?? "", bold: true, pr: cell.pr };
  if (key === "last") return { value: cell.last ?? "" };
  if (key === "plates") return { value: cell.plates ?? "" };
  return { value: "" };
}

type PageFrame = { top: number; bottom: number; left: number; width: number };

function startPage(c: Cursor, model: SheetModel, size: { w: number; h: number }, subtitle: string, first: boolean): PageFrame {
  if (!first) c.ops.push({ op: "page" });
  c.ops.push({ op: "band", subtitle });
  c.y = L.band + L.afterBand;
  const left = L.margin;
  const width = size.w - L.margin * PAIR;
  const qrRoom = model.qrUrl ? L.qr + L.afterBand : 0;
  const headerWidth = width - qrRoom;
  if (model.qrUrl) c.ops.push({ op: "qr", x: left + width - L.qr, y: c.y, size: L.qr, url: model.qrUrl });
  text(c, `${model.dayTitle} · ${model.programName}`, left, headerWidth, TYPE.title, { bold: true });
  c.y += L.headerLine;
  text(c, `${model.teamName} · ${model.date} · Coach ${model.coachName}`, left, headerWidth, TYPE.body, { color: SOFT_INK });
  c.y += L.headerLine;
  if (model.phaseLine) {
    text(c, `${model.phaseLine}${model.lighterWeek ? " · lighter week" : ""}`, left, headerWidth, TYPE.body, { color: SOFT_INK });
    c.y += L.headerLine;
  }
  if (first && model.warmup) {
    text(c, `Warm-up: ${model.warmup.join(", ")}`, left, headerWidth, TYPE.body);
    c.y += L.headerLine;
  }
  if (first && model.note) {
    text(c, `Note: ${model.note}`, left, headerWidth, TYPE.body, { bold: true });
    c.y += L.headerLine;
  }
  c.y = Math.max(c.y, model.qrUrl ? L.band + L.afterBand + L.qr : c.y) + L.afterBand;
  const bottom = size.h - L.margin - L.footer - (model.coachNotes ? L.coachNotes : 0);
  return { top: c.y, bottom, left, width };
}

function endPage(c: Cursor, model: SheetModel, size: { w: number; h: number }, brand: PdfBrand | null): void {
  const left = L.margin;
  const width = size.w - L.margin * PAIR;
  const footerY = size.h - L.margin - L.footer;
  if (model.coachNotes) {
    const notesY = footerY - L.coachNotes;
    c.ops.push({ op: "rect", x: left, y: notesY, w: width, h: L.coachNotes - L.afterBand, stroke: RULE });
    c.ops.push({ op: "text", text: "Coach notes", x: left + L.textInset, y: notesY + L.textInset, w: width, size: TYPE.small, color: SOFT_INK });
  }
  c.ops.push({ op: "text", text: pdfGeneratedBy(brand), x: left, y: footerY + L.afterBand, w: width / PAIR, size: TYPE.small, color: SOFT_INK });
  if (model.code) {
    c.ops.push({ op: "text", text: model.code, x: left + width / PAIR, y: footerY + L.afterBand, w: width / PAIR, size: TYPE.body, bold: true, color: INK });
  }
}

function headerRow(c: Cursor, frame: PageFrame, cols: Column[], fill: string): void {
  c.ops.push({ op: "rect", x: frame.left, y: c.y, w: frame.width, h: L.headerRow, fill });
  const ink = pickReadableTextHex(fill);
  cols.reduce((x, col) => {
    text(c, col.label, x + L.textInset, col.w - L.textInset, TYPE.small, { bold: true, color: ink, dy: L.textInset + 1 });
    return x + col.w;
  }, frame.left);
  c.y += L.headerRow;
}

function dataRow(c: Cursor, frame: PageFrame, cols: Column[], row: SheetAthleteRow, blockIndex: number, model: SheetModel): void {
  cols.reduce((x, col) => {
    const content = cellText(row, blockIndex, col.key);
    const box = col.key.startsWith("set:") || col.key.startsWith("rpe") || col.key.startsWith("custom:");
    c.ops.push({ op: "rect", x, y: c.y, w: col.w, h: L.row, stroke: box ? INK : RULE });
    const size = content.bold && model.boldTargets ? TYPE.target : TYPE.body;
    text(c, content.value, x + L.textInset, col.w - L.textInset * PAIR, size, { bold: Boolean(content.bold && model.boldTargets), dy: (L.row - size) / HALF });
    if (content.pr && content.value) c.ops.push({ op: "star", x: x + col.w - L.star * PAIR, y: c.y + L.star * PAIR, r: L.star });
    return x + col.w;
  }, frame.left);
  c.y += L.row;
}

function blockTitle(c: Cursor, frame: PageFrame, block: SheetBlock, primary: string, continued: boolean): void {
  if (block.superset) {
    const hue = supersetHexForLabel(block.superset.letter, primary);
    c.ops.push({ op: "rect", x: frame.left, y: c.y, w: frame.width, h: L.blockTitle + L.blockMeta, fill: tint(hue, SUPERSET_TINT_TOWARD_WHITE) });
    c.ops.push({ op: "rect", x: frame.left, y: c.y, w: L.supersetRule, h: L.blockTitle + L.blockMeta, fill: hue });
  }
  const inset = block.superset ? L.supersetRule + L.textInset : 0;
  const label = block.slot ? `${block.slot}  ` : "";
  const caption = block.superset && block.superset.first && !continued ? "   Superset" : "";
  text(c, `${label}${block.name}${continued ? " (continued)" : ""}${caption}`, frame.left + inset, frame.width - inset, TYPE.title, { bold: true });
  c.y += L.blockTitle;
  text(c, prescriptionLine(block), frame.left + inset, frame.width - inset, TYPE.meta, { color: SOFT_INK });
  c.y += L.blockMeta;
  if (block.cues && !continued) {
    text(c, block.cues, frame.left + inset, frame.width - inset, TYPE.small, { color: SOFT_INK });
    c.y += L.blockMeta;
  }
}

function groupTitle(c: Cursor, frame: PageFrame, label: string | null): void {
  if (!label) return;
  text(c, label, frame.left, frame.width, TYPE.group, { bold: true });
  c.y += L.groupTitle;
}

type PlanArgs = { model: SheetModel; brand: PdfBrand | null; subtitle: string };

function planTeam({ model, brand, subtitle }: PlanArgs, size: { w: number; h: number }): DrawOp[] {
  const c: Cursor = { ops: [], y: 0 };
  const primary = brand?.primaryColor || FORGE_PDF_ORANGE;
  const headerFill = tint(primary, TINT_TOWARD_WHITE);
  model.groups.forEach((group, gi) => {
    let frame = startPage(c, model, size, subtitle, gi === 0);
    groupTitle(c, frame, group.label);
    const newPage = () => {
      endPage(c, model, size, brand);
      frame = startPage(c, model, size, subtitle, false);
      groupTitle(c, frame, group.label);
    };
    model.blocks.forEach((block, bi) => {
      const cols = teamColumns(model, block, frame.width);
      block.textBefore.forEach((t) => {
        if (c.y + L.headerLine > frame.bottom) newPage();
        text(c, t, frame.left, frame.width, TYPE.body, { bold: true });
        c.y += L.headerLine;
      });
      const titleHeight = L.blockTitle + L.blockMeta + (block.cues ? L.blockMeta : 0) + L.headerRow + L.row;
      if (c.y + titleHeight > frame.bottom) newPage();
      blockTitle(c, frame, block, primary, false);
      headerRow(c, frame, cols, headerFill);
      group.rows.forEach((row) => {
        if (c.y + L.row > frame.bottom) {
          newPage();
          blockTitle(c, frame, block, primary, true);
          headerRow(c, frame, cols, headerFill);
        }
        dataRow(c, frame, cols, row, bi, model);
      });
      c.y += L.blockGap;
    });
    model.textAfter.forEach((t) => {
      if (c.y + L.headerLine > frame.bottom) newPage();
      text(c, t, frame.left, frame.width, TYPE.body, { bold: true });
      c.y += L.headerLine;
    });
    endPage(c, model, size, brand);
  });
  return c.ops;
}

function planAcross({ model, brand, subtitle }: PlanArgs, size: { w: number; h: number }): DrawOp[] {
  const c: Cursor = { ops: [], y: 0 };
  const primary = brand?.primaryColor || FORGE_PDF_ORANGE;
  const headerFill = tint(primary, TINT_TOWARD_WHITE);
  const width = size.w - L.margin * PAIR;
  const customWidth = model.customColumns.length * L.customCol;
  const targetShown = model.groups.some((g) => g.rows.some((r) => r.cells.some((cell) => cell.target != null)));
  const extrasPerLift = (cellsShown: { last: boolean; plates: boolean }) => (cellsShown.last ? L.lastCol : 0) + (cellsShown.plates ? L.platesCol : 0);
  const shownExtras = {
    last: model.groups.some((g) => g.rows.some((r) => r.cells.some((cell) => cell.last != null))),
    plates: model.groups.some((g) => g.rows.some((r) => r.cells.some((cell) => cell.plates != null))),
  };
  const boxCounts = model.blocks.map((b) => boxesInBlock(b, model, targetShown) + Math.ceil(extrasPerLift(shownExtras) / L.minBox));
  const bands = acrossBands(boxCounts, width - L.acrossNameCol - customWidth);
  const notes = [...model.blocks.flatMap((b) => b.textBefore), ...model.textAfter];

  model.groups.forEach((group, gi) => {
    bands.forEach((band, bandIndex) => {
      let frame = startPage(c, model, size, subtitle, gi === 0 && bandIndex === 0);
      if (gi === 0 && bandIndex === 0) {
        notes.forEach((t) => {
          text(c, t, frame.left, frame.width, TYPE.body, { bold: true });
          c.y += L.headerLine;
        });
      }
      groupTitle(c, frame, group.label);
      const boxW = (frame.width - L.acrossNameCol - customWidth) / Math.max(1, band.reduce((n, i) => n + boxCounts[i], 0));
      const drawHeaders = () => {
        // Band 1: one header per lift, a superset's in its hue.
        c.ops.push({ op: "rect", x: frame.left, y: c.y, w: L.acrossNameCol, h: L.headerRow, fill: headerFill });
        band.reduce((x, i) => {
          const block = model.blocks[i];
          const w = boxCounts[i] * boxW;
          const fill = block.superset ? tint(supersetHexForLabel(block.superset.letter, primary), TINT_TOWARD_WHITE) : headerFill;
          c.ops.push({ op: "rect", x, y: c.y, w, h: L.headerRow, fill, stroke: RULE });
          text(c, `${block.slot ? `${block.slot} ` : ""}${block.name}`, x + L.textInset, w - L.textInset, TYPE.small, { bold: true, color: pickReadableTextHex(fill), dy: L.textInset });
          return x + w;
        }, frame.left + L.acrossNameCol);
        c.y += L.headerRow;
        // Band 2: what each box is for.
        c.ops.push({ op: "rect", x: frame.left, y: c.y, w: frame.width, h: L.headerRow, fill: headerFill });
        text(c, "Athlete", frame.left + L.textInset, L.acrossNameCol, TYPE.small, { bold: true, color: pickReadableTextHex(headerFill), dy: L.textInset });
        const afterLifts = band.reduce((x, i) => {
          const labels = acrossLabels(model.blocks[i], model, targetShown, shownExtras);
          return labels.reduce((xx, label) => {
            text(c, label, xx + L.textInset, boxW, TYPE.small, { color: pickReadableTextHex(headerFill), dy: L.textInset });
            return xx + boxW;
          }, x);
        }, frame.left + L.acrossNameCol);
        model.customColumns.reduce((x, col) => {
          text(c, col.header, x + L.textInset, L.customCol, TYPE.small, { bold: true, color: pickReadableTextHex(headerFill), dy: L.textInset });
          return x + L.customCol;
        }, afterLifts);
        c.y += L.headerRow;
      };
      drawHeaders();
      group.rows.forEach((row) => {
        if (c.y + L.row > frame.bottom) {
          endPage(c, model, size, brand);
          frame = startPage(c, model, size, subtitle, false);
          groupTitle(c, frame, group.label);
          drawHeaders();
        }
        c.ops.push({ op: "rect", x: frame.left, y: c.y, w: L.acrossNameCol, h: L.row, stroke: RULE });
        text(c, row.displayName, frame.left + L.textInset, L.acrossNameCol - L.textInset, TYPE.body, { dy: (L.row - TYPE.body) / HALF });
        const afterLifts = band.reduce((x, i) => {
          const cell = row.cells[i];
          const values = acrossValues(model.blocks[i], cell, model, targetShown, shownExtras);
          return values.reduce((xx, v) => {
            c.ops.push({ op: "rect", x: xx, y: c.y, w: boxW, h: L.row, stroke: v.box ? INK : RULE });
            const sizeFor = v.bold && model.boldTargets ? TYPE.target : TYPE.small;
            text(c, v.value, xx + L.textInset, boxW - L.textInset, sizeFor, { bold: Boolean(v.bold && model.boldTargets), dy: (L.row - sizeFor) / HALF });
            if (v.pr && v.value) c.ops.push({ op: "star", x: xx + boxW - L.star * PAIR, y: c.y + L.star * PAIR, r: L.star });
            return xx + boxW;
          }, x);
        }, frame.left + L.acrossNameCol);
        model.customColumns.reduce((x) => {
          c.ops.push({ op: "rect", x, y: c.y, w: L.customCol, h: L.row, stroke: INK });
          return x + L.customCol;
        }, afterLifts);
        c.y += L.row;
      });
      endPage(c, model, size, brand);
    });
  });
  return c.ops;
}

function acrossLabels(block: SheetBlock, model: SheetModel, targetShown: boolean, extras: { last: boolean; plates: boolean }): string[] {
  const setCount = block.sides ? block.sets * PAIR : block.sets;
  const sets = Array.from({ length: setCount }, (_, i) => setLabel(block, i, ""));
  const rpe = { lift: ["RPE"], set: Array.from({ length: block.sets }, (_, i) => `R${i + 1}`), off: [] }[model.rpe];
  const extraBoxes = Math.ceil(((extras.last ? L.lastCol : 0) + (extras.plates ? L.platesCol : 0)) / L.minBox);
  const extraLabels = [...(extras.last ? ["Last"] : []), ...(extras.plates ? ["Plates"] : [])];
  return [...(targetShown ? ["Target"] : []), ...extraLabels, ...Array.from({ length: Math.max(0, extraBoxes - extraLabels.length) }, () => ""), ...sets, ...rpe];
}

function acrossValues(
  block: SheetBlock,
  cell: SheetAthleteRow["cells"][number],
  model: SheetModel,
  targetShown: boolean,
  extras: { last: boolean; plates: boolean },
): { value: string; box: boolean; bold?: boolean; pr?: boolean }[] {
  const labels = acrossLabels(block, model, targetShown, extras);
  return labels.map((label, i) => {
    if (i === 0 && targetShown) return { value: cell.target ?? "", box: false, bold: true, pr: cell.pr };
    if (label === "Last") return { value: cell.last ?? "", box: false };
    if (label === "Plates") return { value: cell.plates ?? "", box: false };
    if (label === "") return { value: "", box: false };
    return { value: "", box: true };
  });
}

function planCards({ model, brand, subtitle }: PlanArgs, size: { w: number; h: number }): DrawOp[] {
  const c: Cursor = { ops: [], y: 0 };
  const rows = model.groups.flatMap((g) => g.rows.map((row) => ({ row, group: g.label })));
  const pages = paginate(rows, CARDS_PER_PAGE);
  pages.forEach((page, pi) => {
    const frame = startPage(c, model, size, subtitle, pi === 0);
    const cardW = (frame.width - L.cardGap) / PAIR;
    const cardH = (frame.bottom - frame.top - L.cardGap) / PAIR;
    page.forEach(({ row, group }, i) => {
      const x = frame.left + (i % PAIR) * (cardW + L.cardGap);
      const y0 = frame.top + Math.floor(i / PAIR) * (cardH + L.cardGap);
      c.ops.push({ op: "rect", x, y: y0, w: cardW, h: cardH, stroke: RULE });
      c.y = y0 + L.textInset;
      text(c, `${row.displayName}${group ? ` · ${group}` : ""}`, x + L.textInset, cardW - L.textInset, TYPE.title, { bold: true });
      c.y += L.cardTitle;
      model.blocks.forEach((block, bi) => {
        if (c.y + L.cardLift > y0 + cardH) return;
        const cell = row.cells[bi];
        const head = [block.slot, block.name, cell.target ? `→ ${cell.target}` : null, cell.last ? `last ${cell.last}` : null, cell.plates].filter(Boolean).join("  ");
        text(c, head, x + L.textInset, cardW - L.textInset, TYPE.small, { bold: true });
        if (cell.pr && cell.target) c.ops.push({ op: "star", x: x + cardW - L.star * PAIR, y: c.y + L.star, r: L.star });
        const setCount = block.sides ? block.sets * PAIR : block.sets;
        const boxW = Math.min(L.minBox, (cardW - L.textInset * PAIR) / Math.max(1, setCount + (model.rpe === "off" ? 0 : 1)));
        Array.from({ length: setCount + (model.rpe === "off" ? 0 : 1) }).forEach((_, k) => {
          c.ops.push({ op: "rect", x: x + L.textInset + k * boxW, y: c.y + L.blockMeta, w: boxW, h: L.cardLift - L.blockMeta - L.cardLiftsGap, stroke: INK });
        });
        c.y += L.cardLift;
      });
    });
    endPage(c, model, size, brand);
  });
  return c.ops;
}

/** The sheet as drawing operations, page by page. Pure. */
export function planSheet(model: SheetModel, brand: PdfBrand | null): SheetPlan {
  const base = PAGE_SIZES[model.layout.page.size];
  const size = model.orientation === "landscape" ? { w: base.h, h: base.w } : { w: base.w, h: base.h };
  const subtitle = `Weight-room sheet · ${model.date}`;
  const args: PlanArgs = { model, brand, subtitle };
  const planners = { team: planTeam, across: planAcross, cards: planCards };
  return { size, ops: planners[model.layout.view](args, size) };
}

/** The rows that fit one page of the team view, for the paging tests. */
export const teamRowsPerPage = (pageHeight: number) => rowsPerPage(pageHeight - L.margin * PAIR - L.band - L.footer, L.headerRow, L.row);

/* ---------------------------------------------------------------- drawing it */

// The QR's dark modules, the second <path> qrcode.react draws: matches d="M0 0h7v1H0z..." on the
// path with fill="#000000"; rejects the white background path. https://regex101.com/?regex=fill%3D%22%23000000%22%20d%3D%22%28%5B%5E%22%5D%2B%29%22&testString=%3Cpath%20fill%3D%22%23000000%22%20d%3D%22M0%200h7v1H0z%22
const QR_DARK_PATH = /fill="#000000" d="([^"]+)"/;
// The QR's size in modules from its viewBox: matches viewBox="0 0 29 29"; rejects width="64".
// https://regex101.com/?regex=viewBox%3D%220%200%20%28%5Cd%2B%29&testString=viewBox%3D%220%200%2029%2029%22
const QR_VIEWBOX = /viewBox="0 0 (\d+)/;

/** A QR code as an SVG path and its module count, drawn with the library already in the app. */
export function qrPath(url: string): { d: string; modules: number } | null {
  const svg = renderToStaticMarkup(createElement(QRCodeSVG, { value: url, level: "M" }));
  const d = svg.match(QR_DARK_PATH)?.[1];
  const modules = Number(svg.match(QR_VIEWBOX)?.[1]);
  return d && modules > 0 ? { d, modules } : null;
}

function drawStar(doc: InstanceType<typeof PDFDocument>, x: number, y: number, r: number) {
  const points = Array.from({ length: STAR_POINTS * PAIR }, (_, i) => {
    const radius = i % PAIR === 0 ? r : r * STAR_INNER;
    const angle = (i * FULL_TURN) / (STAR_POINTS * PAIR) - QUARTER_TURN;
    return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)] as [number, number];
  });
  doc.polygon(...points).fill(INK);
}

export function renderSheetPdf(model: SheetModel, brand: PdfBrand | null): Promise<Buffer> {
  const plan = planSheet(model, brand);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [plan.size.w, plan.size.h], margin: 0, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const qrCache = new Map<string, ReturnType<typeof qrPath>>();
    plan.ops.forEach((op) => {
      if (op.op === "page") doc.addPage({ size: [plan.size.w, plan.size.h], margin: 0 });
      if (op.op === "band") drawPdfBrandBand(doc, brand, op.subtitle);
      if (op.op === "rect") {
        if (op.fill && op.stroke) doc.rect(op.x, op.y, op.w, op.h).fillAndStroke(op.fill, op.stroke);
        else if (op.fill) doc.rect(op.x, op.y, op.w, op.h).fill(op.fill);
        else doc.lineWidth(op.stroke === INK ? 0.8 : 0.5).rect(op.x, op.y, op.w, op.h).stroke(op.stroke ?? RULE);
      }
      if (op.op === "text") {
        doc
          .fillColor(op.color ?? INK)
          .font(op.bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(op.size)
          .text(op.text, op.x, op.y, { width: Math.max(1, op.w), lineBreak: false, ellipsis: true, height: op.size * PAIR });
      }
      if (op.op === "star") drawStar(doc, op.x, op.y, op.r);
      if (op.op === "qr") {
        if (!qrCache.has(op.url)) qrCache.set(op.url, qrPath(op.url));
        const qr = qrCache.get(op.url);
        if (qr) {
          doc.save();
          doc.rect(op.x, op.y, op.size, op.size).fill(WHITE);
          doc.translate(op.x, op.y).scale(op.size / qr.modules);
          doc.path(qr.d).fill("#000000");
          doc.restore();
        }
      }
    });
    doc.end();
  });
}
