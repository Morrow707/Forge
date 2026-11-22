/* eslint-disable ts-patterns/no-magic-numbers -- test values */
import { describe, expect, it, vi } from "vitest";

vi.mock("./storage", () => ({ storage: {} }));
vi.mock("./uploaded-files", () => ({ readUploadedFile: async () => null }));
import { DEFAULT_SHEET_LAYOUT, EMPTY_DAY_EDITS, SHEET_TOGGLE_KEYS, buildSheet, type SheetLayout } from "@shared/weight-room-sheet";
import { sheetAthlete, sheetLift, sheetSource } from "@shared/weight-room-sheet-fixture";
import { planSheet, qrPath, renderSheetPdf, tint, type DrawOp } from "./weight-room-sheet-pdf";

/* THE PRINTED SHEET, LAID OUT. planSheet is pure, so what the PDF draws is checked as a list of
 * operations: every element the coach turned off is absent, a row is never split, a lift's header
 * repeats on a continued page, a group starts its own page, and the brand band is on every page. */

const brand = { teamName: "Cal Bears", primaryColor: "#003262", logoBuffer: null };
const allToggles = (on: boolean) => Object.fromEntries(SHEET_TOGGLE_KEYS.map((k) => [k, on])) as SheetLayout["toggles"];
const texts = (ops: DrawOp[]) => ops.filter((o): o is Extract<DrawOp, { op: "text" }> => o.op === "text").map((o) => o.text);
const pages = (ops: DrawOp[]) => ops.filter((o) => o.op === "band").length;

const roster = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    sheetAthlete(1000 + i, `Athlete${String(i).padStart(3, "0")} Last${i}`, Object.fromEntries([1, 2, 3, 4, 5, 6].map((l) => [String(l), { testedLbs: 200 + i, history: [{ date: "2026-11-14", weight: 150 + i, reps: 5, unit: "lbs" as const }] }])), {
      position: i % 3 === 0 ? "QB" : "WR",
    }),
  );
const sixLifts = [1, 2, 3, 4, 5, 6].map((id) => sheetLift(id, `Lift ${id}`));

describe("every element can be turned off and leaves the PDF", () => {
  const source = sheetSource({
    lifts: [sheetLift(1, "Back Squat", { supersetGroup: "g", notes: "Brace hard" }), sheetLift(2, "Romanian Deadlift", { supersetGroup: "g", movementType: "Hinge" }), sheetLift(7, "Band Pull-Apart", { category: "mobility", movementType: "Activation" })],
  });
  const plan = (on: boolean) => planSheet(buildSheet(source, { ...DEFAULT_SHEET_LAYOUT, toggles: allToggles(on) }, { ...EMPTY_DAY_EDITS, note: "Hydrate" }), brand);
  it("on: the code, QR, note, phase, warm-up, superset, cues, max, last, plates, coach notes and star are drawn", () => {
    const { ops } = plan(true);
    const t = texts(ops).join("\n");
    ["FS-", "Note: Hydrate", "Accumulation", "Warm-up:", "A1", "Superset", "Brace hard", "Max", "Last", "Plates", "Coach notes", "Power"].forEach((s) => expect(t, s).toContain(s));
    expect(ops.some((o) => o.op === "qr")).toBe(true);
  });
  it("off: none of them is, and the bare grid of names and boxes remains", () => {
    const { ops } = plan(false);
    const t = texts(ops).join("\n");
    ["FS-", "Note:", "Accumulation", "Warm-up:", "A1", "Superset", "Brace hard", "Max", "Last", "Plates", "Coach notes", "Power", "Target"].forEach((s) => expect(t, s).not.toContain(s));
    expect(ops.some((o) => o.op === "qr" || o.op === "star")).toBe(false);
    expect(t).toContain("Jordan R.");
    expect(t).toContain("Back Squat");
  });
});

describe("a big roster", () => {
  it("120 athletes × 6 lifts: rows never split, each lift's header repeats, groups start new pages", () => {
    const source = sheetSource({ lifts: sixLifts, athletes: roster(120) });
    const model = buildSheet(source, { ...DEFAULT_SHEET_LAYOUT, groupBy: "position" }, EMPTY_DAY_EDITS);
    const { ops, size } = planSheet(model, brand);
    expect(pages(ops)).toBeGreaterThan(model.groups.length);
    const rows = ops.filter((o): o is Extract<DrawOp, { op: "rect" }> => o.op === "rect" && o.h === 20);
    rows.forEach((r) => expect(r.y + r.h).toBeLessThanOrEqual(size.h));
    expect(texts(ops).filter((t) => t.includes("(continued)")).length).toBeGreaterThan(0);
    expect(texts(ops).filter((t) => t === "QB").length).toBeGreaterThan(0);
  });
  it("renders a 120 × 6 PDF in a reasonable time", async () => {
    const source = sheetSource({ lifts: sixLifts, athletes: roster(120) });
    const start = Date.now();
    const pdf = await renderSheetPdf(buildSheet(source, DEFAULT_SHEET_LAYOUT, EMPTY_DAY_EDITS), brand);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(Date.now() - start).toBeLessThan(10_000);
  });
  it("athletes across: 3 lifts on one band of columns, 8 lifts wrap to a second band", () => {
    const three = planSheet(buildSheet(sheetSource({ lifts: sixLifts.slice(0, 3), athletes: roster(10) }), { ...DEFAULT_SHEET_LAYOUT, view: "across" }, EMPTY_DAY_EDITS), brand);
    const eightLifts = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => sheetLift(id, `Lift ${id}`, { sets: 4 }));
    const eight = planSheet(buildSheet(sheetSource({ lifts: eightLifts, athletes: roster(10) }), { ...DEFAULT_SHEET_LAYOUT, view: "across" }, EMPTY_DAY_EDITS), brand);
    expect(pages(three.ops)).toBe(1);
    expect(pages(eight.ops)).toBeGreaterThan(1);
    expect(three.size.w).toBeGreaterThan(three.size.h);
  });
  it("cards: four to a page", () => {
    const { ops } = planSheet(buildSheet(sheetSource({ athletes: roster(9) }), { ...DEFAULT_SHEET_LAYOUT, view: "cards" }, EMPTY_DAY_EDITS), brand);
    expect(pages(ops)).toBe(3);
  });
});

describe("the program's look", () => {
  it("every page wears the brand band, and a header tint is pale enough to print grey", () => {
    const { ops } = planSheet(buildSheet(sheetSource({ athletes: roster(80) }), DEFAULT_SHEET_LAYOUT, EMPTY_DAY_EDITS), brand);
    expect(ops.filter((o) => o.op === "page").length + 1).toBe(pages(ops));
    expect(tint("#003262", 0.85)).toBe("#d9e0e7");
  });
  it("the QR is drawn from the app's own QR library and encodes only the route and date", () => {
    expect(qrPath("https://forgeperformancesystems.com/athlete/calendar?date=2026-11-21")?.modules).toBeGreaterThan(20);
    const model = buildSheet(sheetSource(), DEFAULT_SHEET_LAYOUT, EMPTY_DAY_EDITS);
    expect(model.qrUrl).toBe("https://forgeperformancesystems.com/athlete/calendar?date=2026-11-21");
  });
});
