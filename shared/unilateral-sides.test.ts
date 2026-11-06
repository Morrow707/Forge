import { describe, it, expect } from "vitest";
import {
  groupSetRows,
  pairIndexFor,
  rowSideFor,
  setPillLabel,
  setRowCountFor,
  sideForNewSet,
  sideLabel,
} from "./unilateral-sides";

describe("a unilateral set is one row per side, drawn as one set with two record buttons", () => {
  it("builds two rows per prescribed set on a unilateral lift, and one otherwise", () => {
    expect(setRowCountFor(3, "unilateral")).toBe(6);
    expect(setRowCountFor(3, "bilateral")).toBe(3);
    expect(setRowCountFor(3, null)).toBe(3);
    expect(setRowCountFor(0, "unilateral")).toBe(0);
  });

  it("odd rows are the left side and even rows the right, so a pair stays a pair however rows are added", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => sideForNewSet(n, "unilateral"))).toEqual(["left", "right", "left", "right", "left", "right"]);
    expect(sideForNewSet(1, "bilateral")).toBeNull();
    expect(sideForNewSet(2, null)).toBeNull();
  });

  it("rows 1 and 2 are set 1, rows 5 and 6 are set 3", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => pairIndexFor(n, "unilateral"))).toEqual([1, 1, 2, 2, 3, 3]);
    expect(pairIndexFor(4, "bilateral")).toBe(4);
  });

  it("groups a unilateral row list into sets of two and leaves a bilateral list one row per set", () => {
    const rows = [1, 2, 3, 4, 5].map((setNumber) => ({ setNumber }));
    expect(groupSetRows(rows, "unilateral").map((g) => [g.pairIndex, g.rows.map((r) => r.setNumber)])).toEqual([
      [1, [1, 2]],
      [2, [3, 4]],
      [3, [5]],
    ]);
    expect(groupSetRows(rows, "bilateral").map((g) => [g.pairIndex, g.rows.map((r) => r.setNumber)])).toEqual([
      [1, [1]],
      [2, [2]],
      [3, [3]],
      [4, [4]],
      [5, [5]],
    ]);
    expect(groupSetRows([], "unilateral")).toEqual([]);
  });

  it("a pill never names a side; the record button does, from the row or from its number", () => {
    expect(setPillLabel(1)).toBe("Set 1");
    expect(setPillLabel(4)).toBe("Set 4");
    expect(rowSideFor({ setNumber: 3, side: "right" }, "unilateral")).toBe("right");
    // A row saved before sides existed: the button still has to say which arm it films.
    expect(rowSideFor({ setNumber: 3, side: null }, "unilateral")).toBe("left");
    expect(rowSideFor({ setNumber: 4, side: null }, "unilateral")).toBe("right");
    expect(rowSideFor({ setNumber: 4, side: null }, "bilateral")).toBeNull();
    expect(sideLabel("left")).toBe("Left");
    expect(sideLabel(null)).toBe("");
  });
});
