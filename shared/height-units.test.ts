import { describe, it, expect } from "vitest";
import {
  toTotalInches,
  fromTotalInches,
  formatFeetInches,
  parseFeetInches,
  MAX_HEIGHT_INCHES,
} from "./height-units";

/**
 * The height an athlete types is the ruler the camera converts pixels into metres with, so a
 * conversion bug here does not show up as a wrong number on a profile. It shows up as every
 * distance and speed on every set that athlete ever films being wrong by the same proportion,
 * silently, with nothing on screen to suggest it.
 */
describe("feet and inches to total inches", () => {
  it("converts the height that prompted this", () => {
    // Scott, 2026-10-01: "im 6'3\" and thats what? 75\" total? not sure off the top of my head."
    // He was right, and the fact that he had to check is the reason for the whole change.
    expect(toTotalInches(6, 3)).toBe(75);
    expect(parseFeetInches("6", "3")).toBe(75);
    expect(formatFeetInches(75)).toBe(`6'3"`);
  });

  it("round-trips every plausible height", () => {
    for (let total = 1; total <= MAX_HEIGHT_INCHES; total++) {
      const { feet, inches } = fromTotalInches(total);
      expect(inches).toBeGreaterThanOrEqual(0);
      expect(inches).toBeLessThan(12);
      expect(toTotalInches(feet, inches)).toBe(total);
    }
  });

  it("carries inches over twelve into feet instead of refusing them", () => {
    // People type 5 feet 14. Refusing it teaches nothing and costs a retry.
    expect(parseFeetInches("5", "14")).toBe(74);
    expect(formatFeetInches(74)).toBe(`6'2"`);
  });

  it("treats feet alone as a height and inches alone as nothing", () => {
    expect(parseFeetInches("6", "")).toBe(72);
    // "3 inches tall" is not what somebody means when they have not reached the feet box yet,
    // and a height of 3 would be accepted by the camera as readily as a real one.
    expect(parseFeetInches("", "3")).toBeNull();
  });

  it("returns null rather than zero for an unanswered field", () => {
    // Zero is the dangerous answer here: it is a number, it passes a `required` check on a
    // populated string, and it would scale a set to nonsense.
    expect(parseFeetInches("", "")).toBeNull();
    expect(parseFeetInches("0", "0")).toBeNull();
    expect(parseFeetInches("abc", "3")).toBeNull();
    expect(parseFeetInches("-6", "3")).toBeNull();
  });

  it("refuses a height taller than anybody", () => {
    expect(parseFeetInches("11", "0")).toBeNull();
    expect(parseFeetInches("10", "0")).toBe(120);
  });

  it("agrees with the storage format the schema still expects", () => {
    // Nothing about storage changed: users.heightIn is total inches and every schema still
    // takes `heightIn`. This is an input format, which is what made it safe to change on four
    // screens at once with no migration.
    expect(String(parseFeetInches("5", "9"))).toBe("69");
  });
});
