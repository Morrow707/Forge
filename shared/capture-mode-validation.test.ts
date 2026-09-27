import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { CAPTURE_MODE_VALIDATION, validationForMode, validationNote } from "./capture-mode-validation";

const schema = readFileSync(resolve(__dirname, "schema.ts"), "utf8");

describe("what has and has not been checked against reality", () => {
  it("covers every tracking mode the enum allows, so a new one cannot arrive unclassified", () => {
    // The shape of the bug this prevents: a capture mode ships, produces confident-looking
    // numbers, and nothing anywhere records that nobody has ever checked them.
    const enumBlock = schema.slice(
      schema.indexOf('pgEnum("tracking_level"'),
      schema.indexOf("]);", schema.indexOf('pgEnum("tracking_level"')),
    );
    // Comment lines stripped first: the enum's own commentary quotes mode names in prose
    // ('mechanics-tracking.ts\'s existing "throw" mode'), and a naive scan reads those as
    // entries -- which is a false failure, and a test that cries wolf gets deleted.
    const entries = enumBlock
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    const modes = [...entries.matchAll(/"(\w+)"/g)]
      .map((m) => m[1])
      .filter((m) => m !== "tracking_level" && m !== "none");
    const classified = new Set(CAPTURE_MODE_VALIDATION.map((m) => m.mode));
    expect(modes.filter((m) => !classified.has(m))).toEqual([]);
  });

  it("never leaves a note empty -- a state with no reason is just a badge", () => {
    for (const m of CAPTURE_MODE_VALIDATION) {
      expect(m.note.length, m.mode).toBeGreaterThan(30);
    }
  });

  it("says plainly when nothing has been checked", () => {
    expect(validationNote("golf_swing")).toContain("NOTHING IN THIS MODE HAS EVER BEEN CHECKED");
    expect(validationNote("bar_path")).toContain("checked against real lifts");
    expect(validationNote("jump")).toContain("KNOWN problem");
  });

  it("claims validation for exactly the modes that have been filmed", () => {
    // Four movements, two modes. Promoting a mode here is a claim that real footage was run
    // through it, so it stays a separate explicit decision rather than drifting upward.
    const validated = CAPTURE_MODE_VALIDATION.filter((m) => m.state === "validated").map((m) => m.mode);
    expect(validated.sort()).toEqual(["bar_path", "full"]);
  });

  it("says nothing about a mode it has never heard of", () => {
    expect(validationForMode("something_new")).toBeNull();
    expect(validationNote(null)).toBeNull();
  });
});
