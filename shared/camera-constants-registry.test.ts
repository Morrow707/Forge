import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { CAMERA_CONSTANTS } from "./camera-constants-registry";

/** A registry that can quietly go stale is WORSE than no registry, because it is believed. So
 *  every entry is read back out of the file it claims to live in and compared. Same treatment
 *  shared/schema-constants.ts already gets, for the same reason. */
describe("the camera constants registry", () => {
  for (const c of CAMERA_CONSTANTS) {
    it(`${c.name} still holds ${c.value} in ${c.file}`, () => {
      const src = readFileSync(resolve(__dirname, "..", c.file), "utf8");
      // Matches `const NAME = 3;`, `const NAME = 0.95;`, exported or not, with or without a type.
      const match = src.match(
        new RegExp(`\\b${c.name}\\b[^=\\n]*=\\s*(-?\\d+(?:\\.\\d+)?)`),
      );
      expect(match, `${c.name} is not declared in ${c.file}`).toBeTruthy();
      expect(Number(match![1])).toBe(c.value);
    });
  }

  it("says plainly which constants nothing can check", () => {
    // A constant with no route to being revised means we are flying on it, and that is worth
    // seeing rather than hiding behind a plausible sentence.
    const unchecked = CAMERA_CONSTANTS.filter((c) => c.revisedBy === null);
    // Not an assertion that the count is low -- an assertion that the field is USED, so a
    // future entry cannot dodge the question by writing an empty string.
    for (const c of unchecked) expect(c.revisedBy).toBeNull();
    for (const c of CAMERA_CONSTANTS) {
      if (c.revisedBy !== null) expect(c.revisedBy.length).toBeGreaterThan(20);
      expect(c.basis.length).toBeGreaterThan(20);
      expect(c.decides.length).toBeGreaterThan(20);
    }
  });

  it("names no constant twice", () => {
    const names = CAMERA_CONSTANTS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
