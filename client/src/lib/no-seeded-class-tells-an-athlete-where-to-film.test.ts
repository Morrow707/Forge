// RULE #1 REACHES THE SEEDED CLASSES, AND THE 2026-10-08 PROOFREAD HAD NOTHING BEHIND IT.
//
// Eleven sentences in the Forge classes told an athlete where to film from and were corrected by
// hand that day. Nothing guarded the correction, so it could not recognise itself and the next
// author re-introduces one for free -- and one had already survived: basketball-shooting.ts's
// Chapter 1 body was edited to "Film the free throws, from wherever you have room" while the
// KEY POINTS page summarising that same body, two screens later, still read "and a side video."
// Internally contradictory, athlete-facing, and the Key Points page is the one a reader carries
// away, because the reader draws it as a boxed summary.
//
// WHAT IS BANNED IS A PRESCRIPTION, NOT THE WORD "SIDE". Watching a sprinter from the side is
// coaching; hitting down the line is volleyball. The rule is Rule #1's own: nothing after -- or
// about -- a take may tell the athlete where to put the phone. A sentence that mentions FILMING
// may not also name a camera POSITION.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dirs = [
  join(process.cwd(), "server/seed-data/forge-classes"),
  join(process.cwd(), "server/seed-data/coaches-corner"),
];

const FILMING = /\b(film|filming|filmed|video|videos|record|recording|camera|phone)\b/i;
const POSITION =
  /\b(from the side|side video|side-on|square to|down the line|from behind|behind the|from the front|head[- ]on|camera level|from the pitcher'?s? view|at an angle)\b/i;

/* The Rule #1 sentences themselves mention filming AND a position word, on purpose, to say there
 * is no wrong one. They are the copy this rule exists to protect, not to catch. */
const RULE_ONE_REASSURANCE =
  /wherever|never refuses|no wrong angle|any angle|the same way each time|whatever it is given/i;

function sentences(src: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  src.split("\n").forEach((line, i) => {
    for (const s of line.split(/(?<=[.!?])\s+|\\n/)) {
      if (s.trim()) out.push({ text: s, line: i + 1 });
    }
  });
  return out;
}

describe("no seeded class tells an athlete where to film from", () => {
  const files = dirs.flatMap((dir) =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => ({ dir, f })),
  );

  it("has seeded class files to check", () => {
    // Guards the guard: a move or a rename would make every case below vacuous.
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  for (const { dir, f } of files) {
    it(`${f} prescribes no camera position`, () => {
      const src = readFileSync(join(dir, f), "utf8");
      const offenders = sentences(src)
        .filter((s) => FILMING.test(s.text) && POSITION.test(s.text))
        .filter((s) => !RULE_ONE_REASSURANCE.test(s.text))
        .map((s) => `${f}:${s.line} => ${s.text.trim().slice(0, 160)}`);
      expect(
        offenders,
        `Rule #1: no surface tells the athlete where to stand. Say "the same way each time", ` +
          `or "from wherever you have room".\n${offenders.join("\n")}`,
      ).toEqual([]);
    });
  }
});
