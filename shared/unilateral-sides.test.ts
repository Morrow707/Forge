import { describe, it, expect } from "vitest";
import { filmSideLabel, pairIndexFor, rowsPerSet, setPills, setRowCountFor, setRowLabel, setStartIndex, sideForNewSet, sideLabel } from "./unilateral-sides";

describe("a unilateral set is one row per side", () => {
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

  it("labels a side, says when none was recorded, and leaves a bilateral set alone", () => {
    expect(setRowLabel(1, "left", "unilateral")).toBe("Set 1 · Left");
    expect(setRowLabel(4, "right", "unilateral")).toBe("Set 2 · Right");
    // A row saved before sides existed: never a guessed side.
    expect(setRowLabel(3, null, "unilateral")).toBe("Set 2 · side not recorded");
    expect(setRowLabel(3, null, "bilateral")).toBe("Set 3");
    expect(setRowLabel(3, "left", "bilateral")).toBe("Set 3");
    expect(sideLabel(null)).toBe("");
  });
});

describe("the screen shows one set and two film buttons, not two sets", () => {
  it("draws one pill per prescribed set, each covering both of its rows", () => {
    expect(setPills(10, "unilateral")).toEqual([1, 2, 3, 4, 5].map((n) => ({ label: `Set ${n}`, rowIndexes: [2 * n - 2, 2 * n - 1] })));
    expect(setPills(5, "bilateral").map((p) => p.rowIndexes)).toEqual([[0], [1], [2], [3], [4]]);
    // An odd row count (an older day) still shows every row, the last set alone.
    expect(setPills(3, "unilateral").map((p) => p.rowIndexes)).toEqual([[0, 1], [2]]);
  });

  it("finds a row's set and labels the film buttons by side", () => {
    expect([0, 1, 2, 3].map((i) => setStartIndex(i, "unilateral"))).toEqual([0, 0, 2, 2]);
    expect(setStartIndex(3, "bilateral")).toBe(3);
    expect(rowsPerSet("unilateral")).toBe(2);
    expect(rowsPerSet(null)).toBe(1);
    expect(filmSideLabel("left", "unilateral")).toBe("Film Left");
    expect(filmSideLabel("right", "unilateral")).toBe("Film Right");
    expect(filmSideLabel(null, "unilateral")).toBe("Film (side not recorded)");
    expect(filmSideLabel("left", "bilateral")).toBeNull();
  });
});
