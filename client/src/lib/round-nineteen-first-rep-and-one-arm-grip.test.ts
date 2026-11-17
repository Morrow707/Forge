import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { replayCapture, type StoredCapture } from "./capture-replay";
import { trimOversizedLeadIn, EDGE_OVERSIZED_AMPLITUDE_RATIO } from "./bar-tracking";

/* ROUND NINETEEN (2026-11-17, build 772): a Single-Arm Dumbbell Row filmed one side at a time and a
 * Dumbbell Shoulder Press, 8 reps each, all three counted 7 -- and the row's scale was 21% / 12%
 * low because a one-arm lift was judged against a two-hand grip. Two bugs, fixed first (Rule #6).
 *
 * 1. THE FIRST REP WAS GLUED TO THE LEAD-IN. The row's first pull starts from a dead hang below
 *    every later bottom and the press's first press runs straight out of the clean, so the one
 *    upward phase is 2-3.5x the set's median and the oversized-edge test deleted it whole.
 *    trimOversizedLeadIn keeps the phase's last rep of travel when -- and only when -- the
 *    athlete's count says a rep is missing. The trimmed rep is counted and keeps its row, and it
 *    leaves the set's aggregates (windows.leadInTrimmed), because on a row with no pause its
 *    window starts mid-pull.
 * 2. A ONE-ARM LIFT HAS NO GRIP. The dialog measured the wrist-to-wrist span of a working hand
 *    and a braced one and handed it to the shoulder ruler as a grip, which read it as a span far
 *    too wide for the shoulders and loosened the ruler to 0.44-0.46. gripForRulers is null on a
 *    unilateral lift. */

type Fixture = StoredCapture & { id: string; loggedReps: number };
const fixtures: Fixture[] = JSON.parse(readFileSync(join(__dirname, "__fixtures__", "ovr-2026-11-17-export.json"), "utf8"));
const byId = (id: string) => {
  const f = fixtures.find((x) => x.id === id);
  if (!f) throw new Error(`no fixture ${id}`);
  return f;
};
const ROW_RIGHT = "2026-11-17 Single-Arm Dumbbell Row right";
const ROW_LEFT = "2026-11-17 Single-Arm Dumbbell Row left";
const PRESS = "2026-11-17 Dumbbell Shoulder Press set 1";
const BENCH = "2026-11-17 Bench Press set 1";
const LOGGED = 8;
/** What the phone (build 772) counted on the three that lost their first rep. */
const COUNTED_ON_PHONE = 7;

const reps = (f: Fixture) => replayCapture(f).metrics?.repBreakdown ?? [];

describe("round nineteen: the first rep comes back out of the lead-in", () => {
  it("every take logged 8", () => {
    for (const f of fixtures) expect(f.loggedReps, f.id).toBe(LOGGED);
  });

  it.each([ROW_RIGHT, ROW_LEFT, PRESS, BENCH])("%s counts 8 of 8", (id) => {
    expect(reps(byId(id))).toHaveLength(LOGGED);
  });

  it("without the athlete's count the lead-in is deleted whole, as before -- the trim never runs", () => {
    for (const id of [ROW_RIGHT, ROW_LEFT, PRESS]) {
      const f = byId(id);
      expect(replayCapture({ ...f, loggedReps: null } as StoredCapture).metrics?.repBreakdown.length, id).toBe(COUNTED_ON_PHONE);
    }
  });

  it("the trimmed rep keeps its row and leaves the set's aggregates, so the set's numbers are the seven whole reps'", () => {
    for (const id of [ROW_RIGHT, ROW_LEFT]) {
      const all = reps(byId(id));
      expect(all[0].windows?.leadInTrimmed, id).toBe(true);
      expect(all.slice(1).every((r) => !r.windows?.leadInTrimmed), id).toBe(true);
      const m = replayCapture(byId(id)).metrics!;
      const without = replayCapture({ ...byId(id), loggedReps: null } as StoredCapture).metrics!;
      expect(m.meanVelocityMps, id).toBe(without.meanVelocityMps);
      expect(m.romCm, id).toBe(without.romCm);
    }
  });

  it("trims only an oversized phase directly before the set's run, and drops what came before it", () => {
    // y-down positions: a lead-in wobble, an oversized phase from far below, then reps of 1.0.
    const y = [0, 0.4, 0.0, 2.5, 2.5, 2.4, 2.0, 1.5, 1.0, 0.5, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0, 0.0];
    const phases = [
      { startIdx: 0, endIdx: 1 },
      { startIdx: 1, endIdx: 2 },
      { startIdx: 2, endIdx: 3 },
      { startIdx: 3, endIdx: 10 },
      { startIdx: 10, endIdx: 11 },
      { startIdx: 11, endIdx: 12 },
      { startIdx: 12, endIdx: 13 },
      { startIdx: 13, endIdx: 14 },
      { startIdx: 14, endIdx: 15 },
      { startIdx: 15, endIdx: 16 },
    ];
    const out = trimOversizedLeadIn(phases, y, EDGE_OVERSIZED_AMPLITUDE_RATIO);
    expect(out).toHaveLength(phases.length - 3);
    expect(out[0].endIdx).toBe(10);
    expect(Math.abs(y[out[0].startIdx] - y[10])).toBeGreaterThanOrEqual(1);
    expect(Math.abs(y[out[0].startIdx] - y[10])).toBeLessThanOrEqual(1.3);
    expect((out[0] as { leadInTrimmed?: boolean }).leadInTrimmed).toBe(true);
    // a set with no oversized lead-in is returned untouched
    const plain = phases.slice(4);
    expect(trimOversizedLeadIn(plain, y, EDGE_OVERSIZED_AMPLITUDE_RATIO)).toBe(plain);
  });
});

describe("round nineteen: a one-arm lift has no grip to judge a ruler by", () => {
  const src = readFileSync(join(__dirname, "..", "components", "av-bar-tracker-dialog.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const callArgs = (name: string) => {
    const at = src.indexOf(`${name}(`);
    expect(at, name).toBeGreaterThan(-1);
    let depth = 0;
    for (let i = at + name.length; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")" && --depth === 0) return src.slice(at, i + 1);
    }
    throw new Error(`unclosed ${name}`);
  };

  it("the grip handed to the rulers is null on a unilateral lift", () => {
    expect(src).toMatch(/const gripForRulers = laterality === "unilateral" \? null : gripWidthPx;/);
  });

  it.each(["shoulderWidthScaleFromFrames", "rejectImplausibleScales"])("%s reads gripForRulers, never the raw grip", (name) => {
    const args = callArgs(name);
    expect(args).toContain("gripForRulers");
    expect(args).not.toMatch(/\bgripWidthPx\b/);
  });
});
