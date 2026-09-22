import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CAMERA_CAPTURE_EVIDENCE_COLUMNS } from "@shared/schema";

// A SET NOBODY FILMED MUST NOT REACH THE TRACKING REPORT, WHICHEVER MODE WOULD HAVE FILMED IT.
//
// Scott, 2026-09-22, shown Barbell Shoulder Press and Machine Chest Fly sets he had never
// recorded: "If the video hasn't been recorded yet, regardless of the exercise, it shouldn't
// show up."
//
// The mechanism: every dialog's EMPTY_*_METRICS fills some fields with 0 or [] because the
// client type does not offer null for them. Those are non-null, so an `isNotNull` membership
// test read them as proof of a capture. This has now been the cause TWICE -- captureDeviceInfo
// was the first -- so this test does not check a list of columns. It checks that every
// placeholder any dialog writes is of a kind the query's rule can see through.
describe("an empty capture placeholder is never evidence of a capture", () => {
  const dir = join(process.cwd(), "client/src/components");
  const dialogs = readdirSync(dir).filter((f) => f.endsWith("-dialog.tsx"));

  // Everything a dialog writes as a stand-in for "nothing was measured".
  const placeholders: { file: string; field: string; literal: string }[] = [];
  for (const file of dialogs) {
    const src = readFileSync(join(dir, file), "utf8");
    for (const block of src.matchAll(/const EMPTY_[A-Z_]+(?::[^=]+)?=\s*\{([\s\S]*?)\n\};/g)) {
      for (const m of block[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9]*):\s*(0|\[\]|\{\}),/gm)) {
        placeholders.push({ file, field: m[1], literal: m[2] });
      }
    }
  }

  it("finds the placeholders at all, so a rename cannot turn this green", () => {
    expect(placeholders.length).toBeGreaterThan(5);
  });

  // `{}` is the one shape the query's rule CANNOT see through: jsonb_typeof says 'object', not
  // 'array', so it passes as evidence. No dialog writes one today and none may start, because
  // the fix would have to be another hand-written exception.
  it("never uses an empty OBJECT as a placeholder", () => {
    const objects = placeholders.filter((p) => p.literal === "{}");
    expect(objects.map((p) => `${p.file}:${p.field}`)).toEqual([]);
  });

  // Every 0/[] placeholder that corresponds to an evidence column has to be a number or a json
  // array server-side -- those are the two kinds the rule handles. A placeholder landing in a
  // text column would read as evidence forever.
  it("only ever places 0 or [] into columns the membership rule can see through", () => {
    const evidence = new Set<string>(CAMERA_CAPTURE_EVIDENCE_COLUMNS as readonly string[]);
    const suspect = placeholders
      .filter((p) => evidence.has(p.field))
      .filter((p) => p.literal !== "0" && p.literal !== "[]");
    expect(suspect).toEqual([]);
  });
});
