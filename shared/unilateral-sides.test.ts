import { describe, it, expect } from "vitest";
import { pairIndexFor, setRowCountFor, setRowLabel, sideForNewSet, sideLabel } from "./unilateral-sides";

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
